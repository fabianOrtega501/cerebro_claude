#!/usr/bin/env python3
"""Trae un ticket de Mantis/GLPI con su HU, la convierte a Markdown y la deja en cache.

Uso:
  tickets.py fetch <mantis> [--glpi <codigo>] [--pick <fuente:id>]   # baja todo de nuevo
  tickets.py fetch --glpi <codigo> [--pick <fuente:id>]               # sin ticket de Mantis
  tickets.py check <clave>          # la HU del cache sigue siendo la vigente?
  tickets.py current [<dir>]        # clave del ticket segun la rama del repo
  tickets.py assigned               # tickets de Mantis asignados al usuario del token

Salida: una linea JSON. Codigos: 0 ok | 2 caso inaccesible | 3 sin adjuntos | 4 ninguno es HU
| 5 varias HU candidatas | 6 falta credencial | 7 error de conexion o login.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import glpi  # noqa: E402
import mantis  # noqa: E402
from brain_secrets import MissingSecret  # noqa: E402
from to_markdown import convert  # noqa: E402

CACHE = Path.home() / ".claude" / "cache" / "tickets"

# Codigo del formato Historia de Usuario en el maestro documental.
HU_PATTERN = re.compile(r"TI-PR-0005-F02", re.I)

# Si la misma HU viene en varios formatos, se lee la primera de esta lista.
READ_PREFERENCE = [".docx", ".pdf"]

BRANCH_TICKET = re.compile(r"^(?:feature|hotfix)/(\d+)-")


class Stop(Exception):
    """Fin controlado con codigo y datos para el JSON de salida."""

    def __init__(self, code, message, **data):
        super().__init__(message)
        self.code, self.data = code, {"message": message, **data}


def emit(code, **data):
    print(json.dumps({"code": code, **data}, ensure_ascii=False))
    sys.exit(code)


def _stem(name):
    return re.sub(r"\.[A-Za-z0-9]+$", "", name).lower()


def _ticket_md(issue):
    """Ficha del ticket de Mantis en Markdown: campos, descripcion y notas completas."""
    fields = mantis.custom_fields(issue)
    lines = [f"# Mantis {issue['id']} — {issue['summary']}", "",
             f"- Estado: {issue['status']['name']}",
             f"- Proyecto: {issue['project']['name']}",
             f"- Prioridad: {issue.get('priority', {}).get('name', '-')}",
             f"- Actualizado: {issue.get('updated_at', '')[:10]}"]
    lines += [f"- {k}: {v}" for k, v in fields.items() if v]
    lines += ["", "## Descripcion", "", issue.get("description", "").strip()]
    if issue.get("additional_information"):
        lines += ["", "## Informacion adicional", "", issue["additional_information"].strip()]
    notes = issue.get("notes", [])
    if notes:
        lines += ["", "## Notas"]
        for n in notes:
            lines += ["", f"### {n.get('created_at', '')[:10]} — {n.get('reporter', {}).get('name', '')}",
                      "", n.get("text", "").strip()]
    return "\n".join(lines) + "\n"


def _candidates(mantis_id, issue, glpi_code):
    """HU candidatas de las dos fuentes: [{source, id, name}] y el titulo del caso de GLPI."""
    found, op, case_title, all_docs = [], None, None, []
    if glpi_code:
        op = glpi.session()
        case_title = glpi.title(op, glpi_code)
        if case_title is None:
            raise Stop(2, f"El caso GLPI {glpi_code} no se pudo abrir: no existe o el usuario no tiene permiso. "
                          "Revisa el campo 'Codigo GLPI' del ticket de Mantis.")
        all_docs += [{"source": "glpi", "id": d, "name": n} for d, n in glpi.attachments(op, glpi_code)]
    if issue:
        all_docs += [{"source": "mantis", "id": d, "name": n} for d, n in mantis.attachments(issue)]
    if not all_docs:
        raise Stop(3, "El ticket no tiene adjuntos. La HU puede estar en un caso relacionado o el requerimiento "
                      "vive solo en la descripcion: pide la HU al usuario si la descripcion no alcanza.")
    found = [d for d in all_docs if HU_PATTERN.search(d["name"])]
    if not found:
        raise Stop(4, "Hay adjuntos pero ninguno parece una HU (TI-PR-0005-F02).", attachments=all_docs)
    return found, op, case_title


def _choose(found, pick):
    """Las HU a bajar: la elegida con --pick, o todas si son la misma HU en varios formatos."""
    if pick:
        chosen = [d for d in found if f"{d['source']}:{d['id']}" == pick]
        if not chosen:
            raise Stop(5, f"--pick {pick} no esta entre las candidatas.", candidates=found)
        return chosen
    if len({_stem(d["name"]) for d in found}) > 1:
        raise Stop(5, "Hay varias HU candidatas y no se cual es la vigente: confirma con --pick fuente:id.",
                   candidates=found)
    return found


def fetch(mantis_id, glpi_code, pick):
    issue = mantis.issue(mantis_id) if mantis_id else None
    if issue and not glpi_code:
        glpi_code = str(mantis.custom_fields(issue).get("Codigo GLPI", "")).strip() or None
    key = str(mantis_id) if mantis_id else f"glpi-{glpi_code}"
    found, op, case_title = _candidates(mantis_id, issue, glpi_code)
    chosen = _choose(found, pick)

    folder = CACHE / key
    if folder.exists():
        shutil.rmtree(folder)  # solo cuenta la HU de esta ejecucion
    folder.mkdir(parents=True, mode=0o700)

    files = []
    for doc in chosen:
        if doc["source"] == "glpi":
            name, blob = glpi.download(op, glpi_code, doc["id"])
        else:
            name, blob = glpi.safe_name(doc["name"]), mantis.download(mantis_id, doc["id"])
        path = folder / f"hu-{doc['source']}-{doc['id']}{Path(name).suffix.lower()}"
        path.write_bytes(blob)
        files.append({**doc, "file": str(path), "bytes": len(blob)})

    files.sort(key=lambda f: READ_PREFERENCE.index(Path(f["file"]).suffix)
               if Path(f["file"]).suffix in READ_PREFERENCE else 99)
    markdown, info = convert(files[0]["file"])
    pdfs = [f["file"] for f in files if f["file"].endswith(".pdf")]
    if pdfs and "pages_with_images" not in info:
        # El DOCX no tiene paginas: las imagenes se ubican en el PDF de la misma HU.
        info["pages_with_images"] = convert(pdfs[0])[1]["pages_with_images"]
        info["images_pdf"] = pdfs[0]
    elif pdfs:
        info["images_pdf"] = pdfs[0]
    (folder / "hu.md").write_text(markdown, encoding="utf-8")
    if issue:
        (folder / "ticket.md").write_text(_ticket_md(issue), encoding="utf-8")

    meta = {"key": key, "mantis": mantis_id, "glpi": glpi_code, "glpi_title": case_title,
            "mantis_updated_at": issue.get("updated_at") if issue else None,
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "hu": files, "candidates_seen": found, "read_from": files[0]["file"], "conversion": info}
    (folder / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    emit(0, key=key, folder=str(folder), hu_md=str(folder / "hu.md"),
         ticket_md=str(folder / "ticket.md") if issue else None,
         summary=issue["summary"] if issue else case_title, conversion=info,
         ignored=[d for d in found if d not in chosen])


def check(key):
    meta_path = CACHE / key / "meta.json"
    if not meta_path.exists():
        emit(0, key=key, status="sin-cache", message="No hay HU descargada para este ticket: corre fetch.")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    issue = mantis.issue(meta["mantis"]) if meta["mantis"] else None
    op = glpi.session() if meta["glpi"] else None
    now = []
    if op:
        now += [{"source": "glpi", "id": d, "name": n} for d, n in glpi.attachments(op, meta["glpi"])]
    if issue:
        now += [{"source": "mantis", "id": d, "name": n} for d, n in mantis.attachments(issue)]
    now = {(d["source"], d["id"]) for d in now if HU_PATTERN.search(d["name"])}
    before = {(d["source"], d["id"]) for d in meta.get("candidates_seen", meta["hu"])}
    changes = []
    if now != before:
        changes.append(f"Cambiaron las HU adjuntas: nuevas {sorted(now - before)}, retiradas {sorted(before - now)}")
    if issue and issue.get("updated_at") != meta.get("mantis_updated_at"):
        changes.append(f"El ticket de Mantis se actualizo el {issue.get('updated_at', '')[:10]} "
                       "(nota o campo nuevo): revisa ticket.md despues de volver a bajarlo")
    emit(0, key=key, status="cambio" if changes else "vigente", changes=changes,
         hu_md=str(CACHE / key / "hu.md"), fetched_at=meta["fetched_at"])


def current(directory):
    r = subprocess.run(["git", "-C", directory, "rev-parse", "--abbrev-ref", "HEAD"],
                       capture_output=True, text=True)
    m = BRANCH_TICKET.match(r.stdout.strip()) if r.returncode == 0 else None
    key = m.group(1) if m else None
    emit(0, key=key, branch=r.stdout.strip() or None,
         cached=bool(key and (CACHE / key / "meta.json").exists()))


def assigned():
    rows = [{"id": i["id"], "status": i["status"]["name"],
             "glpi": mantis.custom_fields(i).get("Codigo GLPI", ""),
             "updated": i.get("updated_at", "")[:10], "summary": i["summary"]} for i in mantis.assigned()]
    emit(0, tickets=rows)


def _opt(args, name):
    if name in args:
        i = args.index(name)
        value = args[i + 1] if i + 1 < len(args) else None
        del args[i:i + 2]
        return value
    return None


def main(argv):
    if not argv:
        print(__doc__)
        sys.exit(1)
    cmd, args = argv[0], argv[1:]
    try:
        if cmd == "fetch":
            glpi_code, pick = _opt(args, "--glpi"), _opt(args, "--pick")
            mantis_id = args[0] if args else None
            if not (mantis_id or glpi_code) or (mantis_id and not mantis_id.isdigit()):
                emit(1, message="fetch necesita un numero de Mantis o --glpi <codigo>")
            fetch(mantis_id, glpi_code, pick)
        elif cmd == "check" and args:
            check(args[0])
        elif cmd == "current":
            current(args[0] if args else os.getcwd())
        elif cmd == "assigned":
            assigned()
        else:
            print(__doc__)
            sys.exit(1)
    except Stop as stop:
        emit(stop.code, **stop.data)
    except MissingSecret as missing:
        emit(6, message=str(missing))
    except glpi.LoginFailed as failed:
        emit(7, message=str(failed))
    except urllib.error.HTTPError as error:
        if error.code in (403, 404):
            emit(2, message=f"El servidor respondio {error.code}: el ticket no existe o el usuario no tiene permiso.")
        emit(7, message=f"El servidor respondio {error.code} {error.reason}.")
    except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
        emit(7, message=f"No hubo conexion: {error}. Si estas fuera de la red corporativa, revisa la VPN.")


if __name__ == "__main__":
    main(sys.argv[1:])
