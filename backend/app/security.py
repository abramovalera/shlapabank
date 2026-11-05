from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import clock
from app.core.config import settings
from app.db import get_db
from app.errors import ApiError
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=8)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_access_token(user_id: int) -> str:
    # Срок считается по часам стенда (app.clock), чтобы истечение токена можно было проверить сдвигом времени.
    expire = (clock.now() + timedelta(minutes=settings.access_token_expire_minutes)).replace(tzinfo=timezone.utc)
    return jwt.encode({"sub": str(user_id), "exp": expire}, settings.secret_key, algorithm=settings.algorithm)


def current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise ApiError(401, "invalid_token")
    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=[settings.algorithm],
                             options={"verify_exp": False})
        user_id = int(payload["sub"])
        expired = datetime.fromtimestamp(int(payload["exp"]), tz=timezone.utc).replace(tzinfo=None) <= clock.now()
    except (JWTError, KeyError, ValueError, TypeError):
        raise ApiError(401, "invalid_token")
    if expired:
        raise ApiError(401, "token_expired")
    q = select(User).where(User.id == user_id)
    if request.method not in ("GET", "HEAD"):
        # Запросы одного клиента, которые что-то меняют, выполняются по очереди (блокировка строки клиента
        # до конца запроса): двойной клик и повтор запроса не проведут операцию дважды и не откроют 4-й счёт.
        # NO KEY UPDATE не мешает чужим вставкам со ссылкой на клиента (входящий перевод).
        q = q.with_for_update(key_share=True)
    user = db.scalar(q)
    if not user:
        raise ApiError(401, "invalid_token")
    if user.status == "BLOCKED":
        raise ApiError(403, "user_blocked")
    return user
