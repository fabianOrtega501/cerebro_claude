"""Convierte un documento a texto Markdown barato de leer para un LLM.

Uso:  python3 to_markdown.py <archivo> [-o salida.md]
PDF con `pdftotext -layout` (conserva tablas de dos columnas y casillas marcadas), DOCX con la
libreria estandar, y el resto con MarkItDown si esta instalado.
"""
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from pathlib import Path

# Por debajo de esto por pagina, el PDF casi seguro es escaneado y no tiene capa de texto.
MIN_CHARS_PER_PAGE = 100

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _norm(line):
    return re.sub(r"\d+", "#", re.sub(r"\s+", " ", line)).strip()


def _strip_page_headers(pages):
    """Quita las lineas que se repiten al inicio o al final de la mayoria de paginas (encabezados)."""
    if len(pages) < 2:
        return pages
    edges = Counter()
    for page in pages:
        lines = [l for l in page.splitlines() if l.strip()]
        edges.update({_norm(l) for l in lines[:8] + lines[-3:]})
    repeated = {k for k, n in edges.items() if n >= max(2, len(pages) // 2)}
    return ["\n".join(l for l in page.splitlines() if _norm(l) not in repeated) for page in pages]


def _tidy(text):
    """Quita espacios al final, la sangria comun y los bloques de lineas en blanco."""
    lines = [l.rstrip() for l in text.splitlines()]
    indents = [len(l) - len(l.lstrip()) for l in lines if l.strip()]
    cut = min(indents) if indents else 0
    text = "\n".join(l[cut:] for l in lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"


def _pages_with_images(path, total):
    """Paginas con imagenes propias (capturas, maquetas), sin contar el logo que se repite en todas."""
    if not shutil.which("pdfimages"):
        return []
    out = subprocess.run(["pdfimages", "-list", str(path)], capture_output=True, text=True).stdout
    rows = [l.split() for l in out.splitlines()[2:] if len(l.split()) > 10]
    per_object = Counter(r[10] for r in rows)
    return sorted({int(r[0]) for r in rows if per_object[r[10]] < max(2, total // 2)})


def pdf(path):
    """(markdown, info) de un PDF; `info["warning"]` avisa si parece escaneado."""
    if not shutil.which("pdftotext"):
        raise RuntimeError("Falta pdftotext (paquete poppler-utils)")
    raw = subprocess.run(["pdftotext", "-layout", str(path), "-"],
                         capture_output=True, text=True, check=True).stdout
    pages = [p for p in raw.split("\f") if p.strip()] or [""]
    pages = _strip_page_headers(pages)
    body = "\n".join(f"<!-- p. {i} -->\n{_tidy(p)}" for i, p in enumerate(pages, 1))
    info = {"engine": "pdftotext -layout", "pages": len(pages),
            "pages_with_images": _pages_with_images(path, len(pages))}
    if len(raw.strip()) < MIN_CHARS_PER_PAGE * len(pages):
        info["warning"] = "El PDF casi no tiene texto: parece escaneado. Hay que leerlo como imagen o pedir el original."
    return body, info


def _docx_text(node):
    parts = []
    for el in node.iter():
        if el.tag == W + "t" and el.text:
            parts.append(el.text)
        elif el.tag in (W + "tab",):
            parts.append(" ")
        elif el.tag in (W + "br", W + "cr"):
            parts.append(" ")
    return re.sub(r"\s+", " ", "".join(parts)).strip()


def docx(path):
    """(markdown, info) de un DOCX: parrafos, titulos por estilo y tablas en formato Markdown."""
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
        images = [n for n in z.namelist() if n.startswith("word/media/")]
    out = []
    for block in root.find(W + "body"):
        if block.tag == W + "p":
            text = _docx_text(block)
            if not text:
                continue
            style = block.find(f"{W}pPr/{W}pStyle")
            name = style.get(W + "val", "") if style is not None else ""
            level = re.search(r"(?:heading|t[ií]tulo)\s*(\d)$", name, re.I)
            out.append(f"{'#' * int(level.group(1))} {text}" if level else text)
        elif block.tag == W + "tbl":
            rows = [[_docx_text(c).replace("|", "/") for c in r.findall(W + "tc")] for r in block.findall(W + "tr")]
            # Las celdas vacias del final solo cuestan tokens; la casilla marcada queda junto a su opcion.
            while any(r and not r[-1] for r in rows):
                rows = [r[:-1] if r and not r[-1] else r for r in rows]
            rows = [r for r in rows if any(r)]
            if not rows:
                continue
            out.append("\n".join(["| " + " | ".join(rows[0]) + " |", "|" + "---|" * len(rows[0])]
                                 + ["| " + " | ".join(r) + " |" for r in rows[1:]]))
    # Las imagenes no se convierten: si hay mas que el logo, conviene mirar el PDF en esas paginas.
    return "\n\n".join(out) + "\n", {"engine": "docx (stdlib)", "images": len(images)}


def other(path):
    """(markdown, info) con MarkItDown, si esta instalado."""
    try:
        from markitdown import MarkItDown
    except ImportError:
        raise RuntimeError(f"Formato {Path(path).suffix} sin conversor: instala MarkItDown para soportarlo")
    return MarkItDown().convert(str(path)).text_content, {"engine": "markitdown"}


def convert(path):
    """(markdown, info) del archivo segun su extension; `info` trae engine, chars y avisos."""
    ext = Path(path).suffix.lower()
    text, info = pdf(path) if ext == ".pdf" else docx(path) if ext == ".docx" else other(path)
    info["chars"] = len(text)
    info["approx_tokens"] = len(text) // 4
    return text, info


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    md, meta = convert(sys.argv[1])
    if "-o" in sys.argv:
        Path(sys.argv[sys.argv.index("-o") + 1]).write_text(md, encoding="utf-8")
        print(meta)
    else:
        sys.stdout.write(md)
