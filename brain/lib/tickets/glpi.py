"""Conector de GLPI por sesion web: login (unico POST) y despues solo lecturas y descargas.

La REST API existe pero hoy responde ERROR_NOT_ALLOWED_IP: GLPI ve la IP publica de salida.
Cuando el admin la habilite (Configuracion > General > API), conviene migrar a ella.
"""
import http.cookiejar
import re
import ssl
import urllib.parse
import urllib.request

from brain_secrets import secret

# Los certificados de datint.co no validan; el contexto se usa solo contra GLPI.
_CTX = ssl._create_unverified_context()


class LoginFailed(Exception):
    """GLPI rechazo el usuario o la contrasena."""


def _url():
    return secret("GLPI_URL").rstrip("/")


def session():
    """Opener con la sesion web iniciada. GLPI 10 ofusca los names del formulario en cada carga,
    por eso los campos se ubican por su type y no por nombre."""
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar),
                                     urllib.request.HTTPSHandler(context=_CTX))
    op.addheaders = [("User-Agent", "Mozilla/5.0")]
    html = op.open(_url() + "/index.php", timeout=25).read().decode("utf-8", "replace")
    form = re.search(r'<form[^>]*action="[^"]*login\.php".*?</form>', html, re.S).group(0)

    def field(kind):
        m = re.search(rf'<input[^>]*type="{kind}"[^>]*name="(field[^"]+)"'
                      rf'|<input[^>]*name="(field[^"]+)"[^>]*type="{kind}"', form)
        return next(g for g in m.groups() if g)

    data = {"noAUTO": "1", "redirect": "", "submit": "",
            "_glpi_csrf_token": re.search(r'name="_glpi_csrf_token"\s+value="([^"]+)"', form).group(1),
            field("text"): secret("GLPI_USER"), field("password"): secret("GLPI_PASSWORD")}
    r = op.open(urllib.request.Request(
        _url() + "/front/login.php", data=urllib.parse.urlencode(data).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"}), timeout=30)
    r.read()
    if "login.php" in r.url:
        raise LoginFailed("GLPI no acepto el inicio de sesion (revisa GLPI_USER/GLPI_PASSWORD)")
    return op


def title(op, code):
    """Titulo del caso si se pudo abrir; `None` si no existe o el usuario no tiene permiso."""
    html = op.open(f"{_url()}/front/ticket.form.php?id={int(code)}", timeout=30).read().decode("utf-8", "replace")
    m = re.search(r"<title>([^<]{5,200})</title>", html)
    text = m.group(1).strip() if m else ""
    return text if f"#{int(code)}" in text else None


def _tab(op, code, tab):
    q = urllib.parse.urlencode({"_target": "/front/ticket.form.php", "_itemtype": "Ticket",
                                "_glpi_tab": tab, "id": int(code), "glpi_tab": tab})
    return op.open(f"{_url()}/ajax/common.tabs.php?{q}", timeout=60).read().decode("utf-8", "replace")


def _links(html):
    pairs = dict(re.findall(r'document\.send\.php\?docid=(\d+)[^>]*title="([^"]*)"', html))
    for docid in re.findall(r'document\.send\.php\?docid=(\d+)', html):
        pairs.setdefault(docid, "(sin nombre)")
    return sorted(pairs.items(), key=lambda x: int(x[0]))


def attachments(op, code):
    """[(docid, nombre)] del caso: primero el hilo principal y, si no hay, los documentos vinculados."""
    return _links(_tab(op, code, "Ticket$main")) or _links(_tab(op, code, "Document_Item$1"))


def download(op, code, docid):
    """(nombre, bytes) de un documento del caso. El nombre ya viene saneado para usarlo en disco."""
    r = op.open(f"{_url()}/front/document.send.php?docid={int(docid)}&tickets_id={int(code)}", timeout=120)
    cd = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)', r.headers.get("Content-Disposition", ""))
    name = urllib.parse.unquote(cd.group(1)) if cd else f"documento-{docid}"
    return safe_name(name), r.read()


def safe_name(name):
    """Nombre de archivo sin rutas ni caracteres raros: evita escribir fuera de la carpeta destino."""
    base = re.split(r"[\\/]", name)[-1]
    return re.sub(r"[^\w.\- ]", "_", base).strip(" .") or "documento"
