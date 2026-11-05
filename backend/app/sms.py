"""Коды из SMS. «Отправить SMS» = записать сообщение в таблицу sms_codes (на стенде его читает GET /test/sms)."""

import math
import secrets
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import clock
from app.errors import ApiError
from app.models import SmsCode

CODE_TTL = timedelta(minutes=5)
RESEND_AFTER = timedelta(seconds=60)
ATTEMPTS = 3


def _new_code() -> str:
    return f"{secrets.randbelow(10000):04d}"


def send_login_code(db: Session, user_id: int, phone: str, challenge_id: str | None = None) -> SmsCode:
    code = _new_code()
    return _store(
        db, phone=phone, user_id=user_id, purpose="LOGIN", code=code,
        challenge_id=challenge_id or str(uuid.uuid4()),
        text=f"Код {code} для входа в ShlapaBank. Никому его не сообщайте.",
    )


def send_operation_code(db: Session, user_id: int, phone: str, operation_id: int, what: str) -> SmsCode:
    code = _new_code()
    return _store(
        db, phone=phone, user_id=user_id, purpose="OPERATION", code=code, operation_id=operation_id,
        text=f"Код {code}. {what}. Никому его не сообщайте.",
    )


def _store(db: Session, **fields) -> SmsCode:
    # Новый код заменяет предыдущий для того же входа / той же операции.
    # Попытки не обнуляются: у нового кода столько же попыток, сколько осталось у старого.
    previous = (active_for_operation(db, fields["operation_id"]) if fields.get("operation_id")
                else active_for_challenge(db, fields["challenge_id"]))
    q = update(SmsCode).where(SmsCode.used.is_(False))
    if fields.get("operation_id"):
        q = q.where(SmsCode.operation_id == fields["operation_id"])
    else:
        q = q.where(SmsCode.challenge_id == fields["challenge_id"])
    db.execute(q.values(used=True))
    attempts = previous.attempts_left if previous else ATTEMPTS
    sms = SmsCode(attempts_left=attempts, expires_at=clock.now() + CODE_TTL, **fields)
    db.add(sms)
    db.flush()
    return sms


def active_for_operation(db: Session, operation_id: int) -> SmsCode | None:
    return db.scalar(
        select(SmsCode).where(SmsCode.operation_id == operation_id, SmsCode.used.is_(False))
        .order_by(SmsCode.id.desc())
    )


def active_for_challenge(db: Session, challenge_id: str, lock: bool = False) -> SmsCode | None:
    q = (select(SmsCode).where(SmsCode.challenge_id == challenge_id, SmsCode.used.is_(False))
         .order_by(SmsCode.id.desc()).limit(1))
    # lock — одновременные вводы кода и повторные отправки одного входа идут по очереди: попытки не перебрать.
    return db.scalar(q.with_for_update() if lock else q)


def close_login_challenges(db: Session, user_id: int) -> None:
    """Новый вход отменяет все прежние незавершённые входы клиента."""
    db.execute(update(SmsCode).where(SmsCode.user_id == user_id, SmsCode.purpose == "LOGIN",
                                     SmsCode.used.is_(False)).values(used=True))


def check_resend(sms: SmsCode) -> None:
    available_at = sms.created_at + RESEND_AFTER
    if clock.now() < available_at:
        raise ApiError(429, "resend_too_early", resend_available_at=iso(available_at),
                       resend_in_seconds=seconds_left(available_at))


def verify(sms: SmsCode, code: str) -> str | None:
    """Проверяет код. Возвращает None, если код верный, иначе код ошибки.
    После третьей ошибки код сгорает (attempts_left = 0)."""
    if clock.now() > sms.expires_at:
        return "code_expired"
    if sms.attempts_left <= 0:
        return "code_attempts_exceeded"
    if secrets.compare_digest(sms.code, code):
        sms.used = True
        return None
    sms.attempts_left -= 1
    return "invalid_code" if sms.attempts_left > 0 else "code_attempts_exceeded"


def code_info(sms: SmsCode | None) -> dict | None:
    if not sms:
        return None
    return {
        "expires_at": iso(sms.expires_at),
        "attempts_left": sms.attempts_left,
        "resend_available_at": iso(sms.created_at + RESEND_AFTER),
        "resend_in_seconds": seconds_left(sms.created_at + RESEND_AFTER),
        "expires_in_seconds": seconds_left(sms.expires_at),
    }


def seconds_left(moment: datetime) -> int:
    """Сколько секунд до момента по часам банка (часы банка можно сдвинуть, часы браузера — нет)."""
    return max(0, math.ceil((moment - clock.now()).total_seconds()))


def iso(dt: datetime | None) -> str | None:
    return None if dt is None else dt.replace(microsecond=0).isoformat() + "Z"


def mask_phone(phone: str) -> str:
    # +79991234567 -> +7 999 ***-45-67
    return f"+7 {phone[2:5]} ***-{phone[8:10]}-{phone[10:12]}"
