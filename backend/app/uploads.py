"""Директория для файлов, загружаемых пользователями (сейчас — только аватарки)."""

from pathlib import Path

UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
AVATARS_DIR = UPLOADS_DIR / "avatars"
AVATARS_DIR.mkdir(parents=True, exist_ok=True)
