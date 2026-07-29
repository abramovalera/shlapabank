import random
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.requests import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from app.banks import get_external_bank_codes
from app.constants import FAILED_LOGIN_THRESHOLD
from app.core.config import settings
from app.db import get_db
from app.models import User, UserBank, UserRole, UserStatus
from app.otp import OTP_TTL_MINUTES, issue_otp_preview, validate_otp_for_user
from app.schemas import LoginRequest, OtpCode, RegisterRequest, TokenResponse, UserPublic
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
    # Поддерживаем логин ИЛИ телефон в поле login. Определяем по началу: + или 8 → phone.
    from app.phone_utils import normalize_phone

    ident = login.strip()
    normalized = normalize_phone(ident)
    if normalized:
        user = db.scalar(select(User).where(User.phone == normalized))
    else:
        user = db.scalar(select(User).where(User.login == ident))
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
    summary="Войти в систему (по логину или телефону)",
    description=(
        "Возвращает JWT-токен, который нужно передавать в заголовке "
        "`Authorization: Bearer <access_token>` для доступа к защищённым эндпоинтам.\n\n"
        "Поле `login` в теле запроса принимает **либо логин** (6–20 симв., буквы/цифры), "
        "**либо телефон** в формате `+7XXXXXXXXXX`. Определяется автоматически — если начинается "
        "с `+`, `7` или `8` и содержит только цифры → телефон.\n\n"
        "После 5 неудачных попыток входа пользователь блокируется, разблокировать может админ."
    ),
)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    return _issue_token_for_credentials(payload.login, payload.password, db)


# =========================================================================
# Восстановление пароля (учебный проект: OTP выдаётся в ответе как подсказка)
# =========================================================================


class LoginAvailabilityResponse(BaseModel):
    available: bool


@router.get(
    "/login-available",
    response_model=LoginAvailabilityResponse,
    summary="Проверить, свободен ли логин (для регистрации)",
)
def login_available(
    login: str = Query(..., description="Логин, который проверяем на уникальность.", example="ivanpetrov"),
    db: Session = Depends(get_db),
):
    exists = db.scalar(select(User).where(User.login == login))
    return LoginAvailabilityResponse(available=exists is None)


class PasswordResetRequestBody(BaseModel):
    login: str = Field(min_length=1, max_length=20)


class PasswordResetRequestResponse(BaseModel):
    """Всегда `{"status": "ok"}` — независимо от того, найден пользователь или нет.
    Это защита от перебора: злоумышленник не может проверять, какие логины существуют.

    Чтобы получить сам OTP-код — вызовите `GET /helper/otp/preview?login=<логин>`
    (единая точка выдачи OTP для всего приложения).
    """

    status: str = "ok"


@router.post(
    "/password/reset-request",
    response_model=PasswordResetRequestResponse,
    summary="Запросить сброс пароля (сгенерирует OTP)",
    description=(
        "Триггерит генерацию OTP для указанного логина. Всегда возвращает 200 — независимо от того, "
        "существует пользователь или нет (защита от перебора).\n\n"
        "**Следующий шаг:** получить сгенерированный код через `GET /helper/otp/preview?login=<логин>`. "
        "Это единая точка выдачи OTP для всего проекта.\n\n"
        "**Финал:** отправить `POST /auth/password/reset-confirm` с логином, OTP и новым паролем."
    ),
)
def password_reset_request(
    payload: PasswordResetRequestBody,
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.login == payload.login))
    # Через восстановление НЕЛЬЗЯ трогать админа — иначе легко залочить админку.
    # Ответ 200 намеренно не отличается: не палим факт существования аккаунта.
    if user and user.role != UserRole.ADMIN:
        issue_otp_preview(user.id)
    return PasswordResetRequestResponse(status="ok")


class PasswordResetConfirmBody(BaseModel):
    login: str = Field(min_length=1, max_length=20)
    otp_code: OtpCode
    new_password: str = Field(min_length=8, max_length=30)


@router.post(
    "/password/reset-confirm",
    response_model=TokenResponse,
    summary="Подтвердить сброс пароля, установить новый и войти",
)
def password_reset_confirm(
    payload: PasswordResetConfirmBody,
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.login == payload.login))
    if not user:
        raise HTTPException(status_code=400, detail="invalid_credentials")
    # Админа сбросить нельзя — специально возвращаем «неверный код», чтобы не палить факт,
    # что это админский аккаунт, и одновременно не дать перезаписать пароль.
    if user.role == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    if not validate_otp_for_user(user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    validate_password_rules(user.login, payload.new_password)

    # Обновляем пароль и сбрасываем счётчик неудачных попыток (разблокируем).
    user.password_hash = payload.new_password
    user.failed_login_attempts = 0
    user.status = UserStatus.ACTIVE
    db.add(user)
    db.commit()

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, role=user.role.value)
