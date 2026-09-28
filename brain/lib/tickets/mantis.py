"""Conector de Mantis por REST API. Solo lectura: unicamente peticiones GET."""
import base64
import json
import ssl
import urllib.request

from brain_secrets import secret

# Los certificados de datint.co no validan; el contexto se usa solo contra Mantis.
_CTX = ssl._create_unverified_context()


def _get(path):
    """GET a /api/rest<path> con el token del usuario; devuelve el JSON parseado."""
    req = urllib.request.Request(
        secret("MANTIS_URL").rstrip("/") + "/api/rest" + path,
        headers={"Authorization": secret("MANTIS_API_TOKEN"), "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60, context=_CTX) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def custom_fields(issue):
    """Campos personalizados del ticket como {nombre: valor}."""
    return {c["field"]["name"]: c.get("value", "") for c in issue.get("custom_fields", [])}


def issue(ticket_id):
    """El ticket completo tal como lo devuelve la API, incluidas notas y adjuntos."""
    return _get(f"/issues/{int(ticket_id)}")["issues"][0]


def assigned():
    """Tickets asignados al usuario del token (hasta 50)."""
    return _get("/issues?filter_id=assigned&page_size=50").get("issues", [])


def attachments(data):
    """[(id, nombre)] de los adjuntos del ticket, sin descargarlos."""
    return [(str(a["id"]), a.get("filename", "")) for a in data.get("attachments", [])]


def download(ticket_id, file_id):
    """Contenido binario de un adjunto del ticket."""
    files = _get(f"/issues/{int(ticket_id)}/files/{int(file_id)}").get("files", [])
    if not files:
        raise LookupError(f"Mantis no devolvio el adjunto {file_id} del ticket {ticket_id}")
    return base64.b64decode(files[0]["content"])
