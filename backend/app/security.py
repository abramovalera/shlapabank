import re
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.models import User, UserRole, UserStatus

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)

PASSWORD_REGEX = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])\S{8,30}$")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def validate_password_rules(login: str, password: str) -> None:
    if password == login:
        raise HTTPException(status_code=400, detail="validation_error: password_equals_login")
    if " " in password:
        raise HTTPException(status_code=400, detail="validation_error: password_contains_space")
    if not PASSWORD_REGEX.match(password):
        raise HTTPException(status_code=400, detail="validation_error: weak_password")


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="invalid_token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not credentials or not credentials.credentials:
        raise credentials_exception

    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=[settings.algorithm])
        subject = payload.get("sub")
        if not subject:
            raise credentials_exception
        subject_id = int(subject)
    except JWTError as exc:
        raise credentials_exception from exc
    except (TypeError, ValueError) as exc:
        raise credentials_exception from exc

    user = db.scalar(select(User).where(User.id == subject_id))
    if not user:
        raise credentials_exception
    return user


def require_active_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.status == UserStatus.BLOCKED:
        raise HTTPException(status_code=403, detail="user_blocked")
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.status == UserStatus.BLOCKED:
        raise HTTPException(status_code=403, detail="user_blocked")
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="forbidden")
    return current_user
