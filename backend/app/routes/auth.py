from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import sms
from app.db import get_db
from app.errors import ApiError, errors_for
from app.models import ExternalRecipient, SmsCode, User
from app.schemas import ChallengeIn, ChallengeOut, LoginConfirmIn, LoginIn, RegisterIn, TokenOut, UserOut
from app.security import create_access_token, current_user, hash_password, verify_password
from app.seed import new_account

router = APIRouter(tags=["Вход и регистрация"])


def user_out(user: User) -> UserOut:
    return UserOut(id=user.id, phone=user.phone, first_name=user.first_name, last_name=user.last_name, status=user.status)


def challenge_out(code: sms.SmsCode, phone: str) -> ChallengeOut:
    info = sms.code_info(code)
    return ChallengeOut(challenge_id=code.challenge_id, phone_masked=sms.mask_phone(phone),
                        expires_at=info["expires_at"], resend_available_at=info["resend_available_at"],
                        resend_in_seconds=info["resend_in_seconds"], expires_in_seconds=info["expires_in_seconds"])


@router.post("/auth/register", status_code=201, response_model=UserOut, summary="Регистрация",
             responses=errors_for(409, 422))
def register(body: RegisterIn, db: Session = Depends(get_db)):
    """Создаёт клиента и сразу открывает ему счёт «Основной» с нулевым балансом."""
    # Номера клиентов других банков из справочника СБП тоже заняты — иначе ломаются тестовые данные.
    if db.scalar(select(User.id).where(User.phone == body.phone)) or db.get(ExternalRecipient, body.phone):
        raise ApiError(409, "phone_taken", field="phone")
    user = User(phone=body.phone, password_hash=hash_password(body.password),
                first_name=body.first_name, last_name=body.last_name)
    db.add(user)
    try:
        db.flush()
    except IntegrityError:  # тот же номер зарегистрировали одновременно (двойной клик)
        db.rollback()
        raise ApiError(409, "phone_taken", field="phone")
    new_account(db, user, "Основной")
    db.commit()
    return user_out(user)


@router.post("/auth/login", response_model=ChallengeOut, summary="Вход: шаг 1 — телефон и пароль",
             responses=errors_for(400, 403, 422))
def login(body: LoginIn, db: Session = Depends(get_db)):
    """Проверяет пароль и отправляет код из SMS. Код на стенде: `GET /test/sms?phone=...`."""
    # Одновременные входы одного клиента — по очереди: действует только последний.
    user = db.scalar(select(User).where(User.phone == body.phone).with_for_update(key_share=True))
    if not user or not verify_password(body.password, user.password_hash):
        raise ApiError(400, "invalid_credentials")
    if user.status == "BLOCKED":
        raise ApiError(403, "user_blocked")
    # Новый вход отменяет прежние незавершённые входы: работает только код из последней SMS.
    # Чаще раза в 60 секунд не ограничиваем — автотесты входят под одним клиентом много раз подряд.
    sms.close_login_challenges(db, user.id)
    code = sms.send_login_code(db, user.id, user.phone)
    db.commit()
    return challenge_out(code, user.phone)


@router.post("/auth/login/confirm", response_model=TokenOut, summary="Вход: шаг 2 — код из SMS",
             responses=errors_for(400, 403, 404, 422))
def login_confirm(body: LoginConfirmIn, db: Session = Depends(get_db)):
    code = sms.active_for_challenge(db, body.challenge_id, lock=True)
    if not code:
        raise ApiError(404, "challenge_not_found")
    if db.get(User, code.user_id).status == "BLOCKED":  # заблокировали между паролем и кодом
        raise ApiError(403, "user_blocked")
    error = sms.verify(code, body.code)
    db.commit()
    if error == "invalid_code":
        raise ApiError(400, "invalid_code", f"Неверный код. Осталось попыток: {code.attempts_left}",
                       field="code", attempts_left=code.attempts_left)
    if error:
        raise ApiError(400, error, field="code", attempts_left=code.attempts_left)
    return TokenOut(access_token=create_access_token(code.user_id))


@router.post("/auth/login/resend", response_model=ChallengeOut, summary="Вход: отправить код ещё раз",
             responses=errors_for(403, 404, 422, 429))
def login_resend(body: ChallengeIn, db: Session = Depends(get_db)):
    # Блокируем все коды этого входа: одновременный повтор дождётся первого и увидит уже новый код (429).
    db.execute(select(SmsCode.id).where(SmsCode.challenge_id == body.challenge_id).with_for_update())
    code = sms.active_for_challenge(db, body.challenge_id)
    if not code or code.attempts_left <= 0:  # три неверных кода — вход сгорел, начинать заново
        raise ApiError(404, "challenge_not_found")
    if db.get(User, code.user_id).status == "BLOCKED":
        raise ApiError(403, "user_blocked")
    sms.check_resend(code)
    new = sms.send_login_code(db, code.user_id, code.phone, challenge_id=code.challenge_id)
    db.commit()
    return challenge_out(new, code.phone)


@router.get("/auth/login/{challenge_id}", response_model=ChallengeOut, summary="Вход: состояние шага кода",
            responses=errors_for(404))
def login_status(challenge_id: str, db: Session = Depends(get_db)):
    """Сколько секунд осталось до повторной отправки и до истечения кода — по часам банка.
    Интерфейс сверяется с банком на шаге кода (часы банка можно сдвинуть). 404 — вход сгорел или уже завершён."""
    code = sms.active_for_challenge(db, challenge_id)
    if not code or code.attempts_left <= 0:
        raise ApiError(404, "challenge_not_found")
    return challenge_out(code, code.phone)


@router.get("/me", response_model=UserOut, summary="Текущий клиент", responses=errors_for(401, 403))
def me(user: User = Depends(current_user)):
    return user_out(user)
