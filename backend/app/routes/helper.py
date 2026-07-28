"""Единая точка получения OTP — `/helper/otp/preview`.

Используется во всех операциях, требующих подтверждения кодом:
- Переводы, платежи (клиент залогинен → берём его user).
- Смена пароля в профиле (клиент залогинен).
- Восстановление пароля (не залогинен → передаём ?login=X).

Один эндпоинт, один формат ответа.
"""

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.models import User
from app.otp import OTP_TTL_MINUTES, issue_otp_preview

router = APIRouter(prefix="/api/v1/helper", tags=["helper"])


def _resolve_user_by_token(authorization: str | None, db: Session) -> User | None:
    """Мягкий парсер токена — если валидный, возвращает user; иначе None (не бросает)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        from jose import jwt
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        sub = payload.get("sub")
        if not sub:
            return None
        return db.scalar(select(User).where(User.id == int(sub)))
    except Exception:
        return None


@router.get(
    "/otp/preview",
    summary="Получить актуальный OTP-код (единая точка)",
    description=(
        "**Единая точка выдачи OTP** для всех операций.\n\n"
        "Два режима:\n"
        "1. **С Bearer-токеном (без параметров)** — вернёт OTP для текущего пользователя. "
        "Используется для подтверждения переводов, платежей, смены пароля в профиле.\n"
        "2. **Без токена, с параметром `?login=<логин>`** — вернёт OTP для указанного пользователя. "
        "Используется в восстановлении пароля, когда клиент ещё не залогинен.\n\n"
        "**Учебный проект:** реального SMS нет — OTP возвращается прямо в ответе для удобства "
        "тестирования и подсказки в UI. В проде этот эндпоинт должен быть закрыт."
    ),
)
def helper_otp_preview(
    login: str | None = Query(
        default=None,
        description="Логин пользователя. Указывать только если Bearer-токена нет.",
        example=None,
    ),
    authorization: str | None = Header(default=None, include_in_schema=False),
    db: Session = Depends(get_db),
):
    user: User | None = None
    if login:
        user = db.scalar(select(User).where(User.login == login))
        # Не палим существование логина — возвращаем как будто OK
        if not user:
            return {
                "userId": None,
                "otp": None,
                "ttlSeconds": OTP_TTL_MINUTES * 60,
                "message": "Если пользователь существует, код сгенерирован",
            }
    else:
        user = _resolve_user_by_token(authorization, db)
        if not user:
            raise HTTPException(status_code=401, detail="unauthorized")

    code = issue_otp_preview(user.id)
    return {
        "userId": user.id,
        "otp": code,
        "ttlSeconds": OTP_TTL_MINUTES * 60,
        "message": f"Ваш код подтверждения: {code}",
    }
