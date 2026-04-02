import random
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException
from starlette.requests import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.banks import get_external_bank_codes
from app.constants import FAILED_LOGIN_THRESHOLD
from app.core.config import settings
from app.db import get_db
from app.models import User, UserBank, UserStatus
from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserPublic
from app.security import create_access_token, validate_password_rules, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_REGISTER_RATE_WINDOW_SECONDS = 60
_register_hits_by_key: dict[str, deque[float]] = defaultdict(deque)


def _client_key(request: Request) -> str:
    # Для учебного rate limit используем IP клиента (или "unknown").
    # В реальном проде лучше учитывать proxy headers (X-Forwarded-For) и/или user-agent, и держать лимитер на уровне gateway.
    host = getattr(getattr(request, "client", None), "host", None)
    return host or "unknown"


def _enforce_register_rate_limit(request: Request) -> None:
    limit = settings.register_rate_limit_per_minute
    if limit <= 0:
        return
    now = time.time()
    key = _client_key(request)
    q = _register_hits_by_key[key]
    cutoff = now - _REGISTER_RATE_WINDOW_SECONDS
    while q and q[0] < cutoff:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status_code=429, detail="rate_limited: too_many_register_requests")
    q.append(now)


def _issue_token_for_credentials(login: str, password: str, db: Session) -> TokenResponse:
    user = db.scalar(select(User).where(User.login == login))
    if not user:
        raise HTTPException(status_code=401, detail="invalid_credentials")
    if user.status == UserStatus.BLOCKED:
        raise HTTPException(status_code=403, detail="user_blocked")

    if not verify_password(password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= FAILED_LOGIN_THRESHOLD:
            user.status = UserStatus.BLOCKED
        db.add(user)
        db.commit()
        raise HTTPException(status_code=401, detail="invalid_credentials")

    user.failed_login_attempts = 0
    db.add(user)
    db.commit()
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, role=user.role.value)


@router.post(
    "/register",
    response_model=UserPublic,
    status_code=201,
    summary="Зарегистрировать пользователя",
)
def register(request: Request, payload: RegisterRequest, db: Session = Depends(get_db)):
    _enforce_register_rate_limit(request)
    validate_password_rules(payload.login, payload.password)
    existing = db.scalar(select(User).where(User.login == payload.login))
    if existing:
        raise HTTPException(status_code=409, detail="validation_error: login_not_unique")

    user = User(
        login=payload.login,
        password_hash=payload.password,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    external = get_external_bank_codes()
    n = random.randint(0, min(5, len(external)))
    chosen = random.sample(external, n)
    for bank_code in chosen:
        db.add(UserBank(user_id=user.id, bank_code=bank_code))
    db.commit()

    return user


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Войти",
)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    return _issue_token_for_credentials(payload.login, payload.password, db)
