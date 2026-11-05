"""Вспомогательные действия стенда (без авторизации) — только то, что обычными запросами к банку не сделать:
код из SMS, время банка, блокировки, сброс."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import clock, rules, seed, sms
from app.db import get_db
from app.errors import ApiError
from app.models import Card, SmsCode, User
from app.schemas import AddMinutesIn, SmsOut, TimeOut

router = APIRouter(prefix="/test", tags=["Вспомогательные действия"])


@router.get("/sms", response_model=list[SmsOut], summary="Последние SMS")
def last_sms(phone: str | None = Query(None, description="Телефон в любом виде; без него — SMS всех клиентов",
                                       examples=["9991234567"]),
             limit: int = Query(5, ge=1, le=50), offset: int = Query(0, ge=0, description="Сколько пропустить"),
             db: Session = Depends(get_db)):
    """Новые сверху. Код для входа или операции — поле `code` (он же в тексте SMS)."""
    q = select(SmsCode)
    if phone and phone.strip():
        q = q.where(SmsCode.phone == rules.normalize_phone(phone))
    rows = db.scalars(q.order_by(SmsCode.id.desc()).limit(limit).offset(offset))
    return [SmsOut(phone=r.phone, text=r.text, code=r.code, purpose=r.purpose, operation_id=r.operation_id,
                   created_at=sms.iso(r.created_at)) for r in rows]


@router.post("/reset", summary="Вернуть стенд к исходным данным")
def reset():
    """Удаляет всё, что создано тестами, и заливает исходные данные заново (номера счетов и карт прежние).
    Время банка тоже становится настоящим."""
    clock.reset()
    seed.reset()
    return {"status": "ok"}


# ---------- время банка ----------
# Нужно, чтобы не ждать: истечение кода (5 мин) и входа (60 мин), новые сутки и месяц для лимитов.

def _time_out() -> TimeOut:
    now = clock.now()
    return TimeOut(now_msk=(now + rules.MSK).strftime("%Y-%m-%d %H:%M:%S"), now_utc=sms.iso(now),
                   shifted=clock.offset() != timedelta(0))


@router.get("/time", response_model=TimeOut, summary="Время банка сейчас")
def get_time():
    return _time_out()


@router.post("/time/next-day", response_model=TimeOut, summary="Перейти на следующие сутки")
def next_day():
    """Время банка становится 00:00:01 следующего дня по Москве: дневной лимит снова полный.
    Если это 1-е число — начался новый месяц, обнулился и месячный лимит.
    Входы, начатые до перехода, истекают — войдите заново."""
    today_msk = (clock.now() + rules.MSK).date()
    target_utc = datetime.combine(today_msk + timedelta(days=1), datetime.min.time()) + timedelta(seconds=1) - rules.MSK
    clock.set_offset(target_utc - datetime.utcnow())
    return _time_out()


@router.post("/time/add-minutes", response_model=TimeOut, summary="Прибавить минуты")
def add_minutes(body: AddMinutesIn):
    """Например, `{"minutes": 6}` — истёк код из SMS (живёт 5 минут), `{"minutes": 61}` — истёк вход (60 минут)."""
    clock.set_offset(clock.offset() + timedelta(minutes=body.minutes))
    return _time_out()


@router.post("/time/reset", response_model=TimeOut, summary="Вернуть настоящее время")
def reset_time():
    clock.reset()
    return _time_out()


# ---------- блокировки ----------

def _user_by_phone(db: Session, phone: str) -> User:
    user = db.scalar(select(User).where(User.phone == rules.normalize_phone(phone)))
    if not user:
        raise ApiError(404, "client_not_found")
    return user


def _card_by_number(db: Session, number: str) -> Card:
    card = db.scalar(select(Card).where(Card.number == number.replace(" ", "")))
    if not card:
        raise ApiError(404, "card_not_found")
    return card


@router.post("/users/{phone}/block", summary="Заблокировать клиента")
def block_user(phone: str, db: Session = Depends(get_db)):
    """Клиент не сможет войти, его токен перестанет работать (403), переводить ему нельзя.
    Блокируйте своего клиента, а не общих из тестовых данных, и разблокируйте после проверки."""
    user = _user_by_phone(db, phone)
    user.status = "BLOCKED"
    db.commit()
    return {"phone": user.phone, "status": user.status}


@router.post("/users/{phone}/unblock", summary="Разблокировать клиента")
def unblock_user(phone: str, db: Session = Depends(get_db)):
    user = _user_by_phone(db, phone)
    user.status = "ACTIVE"
    db.commit()
    return {"phone": user.phone, "status": user.status}


@router.post("/cards/{number}/block", summary="Заблокировать карту ShlapaBank")
def block_card(number: str, db: Session = Depends(get_db)):
    card = _card_by_number(db, number)
    card.status = "BLOCKED"
    db.commit()
    return {"number": card.number, "status": card.status}


@router.post("/cards/{number}/unblock", summary="Разблокировать карту ShlapaBank")
def unblock_card(number: str, db: Session = Depends(get_db)):
    card = _card_by_number(db, number)
    card.status = "ACTIVE"
    db.commit()
    return {"number": card.number, "status": card.status}
