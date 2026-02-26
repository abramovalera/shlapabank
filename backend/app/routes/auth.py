from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User, UserStatus
from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserPublic
from app.security import (
    create_access_token,
    get_password_hash,
    validate_password_rules,
    verify_password,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _issue_token_for_credentials(login: str, password: str, db: Session) -> TokenResponse:
    user = db.scalar(select(User).where(User.login == login))
    if not user:
        raise HTTPException(status_code=401, detail="invalid_credentials")

    if user.status == UserStatus.BLOCKED:
        raise HTTPException(status_code=403, detail="user_blocked")

    if not verify_password(password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= 5:
            user.status = UserStatus.BLOCKED
        db.add(user)
        db.commit()
        raise HTTPException(status_code=401, detail="invalid_credentials")

    user.failed_login_attempts = 0
    db.add(user)
    db.commit()
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.post(
    "/register",
    response_model=UserPublic,
    status_code=201,
    summary="Регистрация нового пользователя",
)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    validate_password_rules(payload.login, payload.password)
    existing = db.scalar(select(User).where(User.login == payload.login))
    if existing:
        raise HTTPException(status_code=409, detail="validation_error: login_not_unique")

    user = User(
        login=payload.login,
        password_hash=get_password_hash(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Вход и получение JWT токена",
)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    return _issue_token_for_credentials(payload.login, payload.password, db)
