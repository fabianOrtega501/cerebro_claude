"""Lectura de `~/.claude/secrets.env` para los conectores en Python (par de `secrets.mjs`)."""
import os
import pathlib

SECRETS_PATH = pathlib.Path.home() / ".claude" / "secrets.env"


class MissingSecret(Exception):
    """Falta una credencial; el mensaje dice que linea agregar y donde."""


def _load():
    values = {}
    if SECRETS_PATH.exists():
        for line in SECRETS_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip()
    return values


_CACHE = None


def secret(name):
    """Valor de `name` en secrets.env (o en el entorno). Lanza MissingSecret si no esta."""
    global _CACHE
    if _CACHE is None:
        _CACHE = _load()
    value = _CACHE.get(name) or os.environ.get(name)
    if not value:
        raise MissingSecret(f"Falta {name}. Agrega la linea `{name}=...` en {SECRETS_PATH}")
    return value
