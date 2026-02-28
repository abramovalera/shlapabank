from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict

from app.core.config import settings

OTP_TTL_MINUTES = 5


@dataclass
class _OtpEntry:
    code: str
    expires_at: datetime


_otp_store: Dict[int, _OtpEntry] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_expired(entry: _OtpEntry) -> bool:
    return _now() > entry.expires_at


def issue_otp_preview(user_id: int) -> str:
    """
    Вернуть действующий OTP-код для пользователя или сгенерировать новый.

    Используется только для тестового helper-эндпоинта, поэтому код
    хранится в памяти процесса и живет ограниченное время.
    """
    entry = _otp_store.get(user_id)
    if entry and not _is_expired(entry):
        return entry.code

    # Генерируем новый 4-значный код с ведущими нулями
    import random

    code = f"{random.randint(0, 9999):04d}"
    _otp_store[user_id] = _OtpEntry(code=code, expires_at=_now() + timedelta(minutes=OTP_TTL_MINUTES))
    return code


def validate_otp_for_user(user_id: int, code: str) -> bool:
    """
    Проверить OTP-код для пользователя.

    - Если в настройках задан operation_otp_code (непустой), этот код принимается
      без проверки хранилища. По умолчанию пусто — OTP только динамический из preview.
    - Иначе: возвращает True и удаляет запись при успешной проверке (one-time).
    - При истечении срока жизни кода запись очищается и возвращается False.
    - При неверном коде оставляет запись, чтобы пользователь мог попробовать снова.
    """
    if settings.operation_otp_code and code == settings.operation_otp_code:
        return True

    entry = _otp_store.get(user_id)
    if not entry:
        return False

    if _is_expired(entry):
        _otp_store.pop(user_id, None)
        return False

    if entry.code != code:
        return False

    _otp_store.pop(user_id, None)
    return True

