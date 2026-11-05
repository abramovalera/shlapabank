"""Правила банка: комиссии, лимиты, номера счетов и карт."""

import re

from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import clock
from app.errors import ApiError
from app.models import Limit, Operation, Tariff

CENT = Decimal("0.01")
OWN_BANK = "ShlapaBank"
OWN_BIN = "220001"
# Операции «наружу» — они входят в лимиты (вместе с комиссией).
LIMITED_TYPES = ("PHONE_TRANSFER", "CARD_TRANSFER", "MOBILE", "UTILITY")
MSK = timedelta(hours=3)  # сутки и месяц для лимитов считаются по московскому времени


def money(value: Decimal) -> str:
    return str(Decimal(value).quantize(CENT))


def tariff(db: Session, operation_type: str) -> Tariff:
    return db.get(Tariff, operation_type)


def fee_for(t: Tariff, amount: Decimal) -> Decimal:
    if t.fee_percent == 0:
        return Decimal("0.00")
    fee = (amount * t.fee_percent / 100).quantize(CENT, rounding=ROUND_HALF_UP)
    return max(fee, t.fee_min)


def check_amount(t: Tariff, amount: Decimal) -> None:
    if amount < t.amount_min or amount > t.amount_max:
        raise ApiError(
            400, "amount_out_of_range",
            f"Сумма должна быть от {_rub(t.amount_min)} до {_rub(t.amount_max)}",
            field="amount", amount_min=money(t.amount_min), amount_max=money(t.amount_max),
        )


def _rub(v: Decimal) -> str:
    whole = f"{int(v):,}".replace(",", " ")
    return f"{whole} ₽"


def _period_starts(now: datetime) -> tuple[datetime, datetime]:
    local = now + MSK
    day = local.replace(hour=0, minute=0, second=0, microsecond=0) - MSK
    month = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - MSK
    return day, month


def limits_state(db: Session, user_id: int) -> dict:
    lim = {row.name: row.amount for row in db.scalars(select(Limit))}
    day_start, month_start = _period_starts(clock.now())

    def used_since(since: datetime) -> Decimal:
        total = db.scalar(
            select(func.coalesce(func.sum(Operation.amount + Operation.fee), 0)).where(
                Operation.user_id == user_id,
                Operation.status == "DONE",
                Operation.type.in_(LIMITED_TYPES),
                Operation.completed_at >= since,
                Operation.completed_at <= clock.now(),  # после возврата сдвинутого времени «будущие» не считаются
            )
        )
        return Decimal(total).quantize(CENT)

    daily_used, monthly_used = used_since(day_start), used_since(month_start)
    return {
        "per_operation": lim["per_operation"],
        "daily": {"limit": lim["daily"], "used": daily_used, "left": max(lim["daily"] - daily_used, Decimal(0))},
        "monthly": {"limit": lim["monthly"], "used": monthly_used, "left": max(lim["monthly"] - monthly_used, Decimal(0))},
    }


def check_limits(db: Session, user_id: int, total: Decimal) -> str | None:
    """Код ошибки лимита или None. total — сумма вместе с комиссией."""
    state = limits_state(db, user_id)
    if total > state["per_operation"]:
        return "limit_per_operation"
    if total > state["daily"]["left"]:
        return "limit_daily"
    if total > state["monthly"]["left"]:
        return "limit_monthly"
    return None


def luhn_digit(body: str) -> str:
    total = 0
    for i, ch in enumerate(reversed(body)):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return str((10 - total % 10) % 10)


def luhn_ok(number: str) -> bool:
    return len(number) == 16 and number.isdigit() and luhn_digit(number[:-1]) == number[-1]


def card_number_for(card_id: int) -> str:
    body = f"{OWN_BIN}{card_id:09d}"
    return body + luhn_digit(body)


def account_number_for(account_id: int) -> str:
    # 40817 (счёт физлица) 810 (рубли) 0 0000 + порядковый номер — 20 цифр
    return f"408178100{account_id:011d}"


def normalize_phone(raw: str, field: str = "phone") -> str:
    """Телефон в любом виде (+79005550001, 79005550001, 89005550001, 9005550001, 900 555-00-01) -> +79005550001."""
    phone = parse_phone(raw)
    if phone is None:
        raise ApiError(422, "validation_error", PHONE_MESSAGE, field=field)
    return phone


PHONE_MESSAGE = "Телефон: +7 и 10 цифр, например +79001234567"


def parse_phone(raw: str) -> str | None:
    """+7XXXXXXXXXX или None. Кроме цифр допустимы только пробел, +, -, скобки — буквы делают номер неверным."""
    if not isinstance(raw, str) or re.search(r"[^0-9\s+()\-]", raw):
        return None
    raw = raw.strip()
    digits = re.sub(r"[^0-9]", "", raw)
    if raw.startswith("+"):
        # С плюсом — только +7 и ровно 10 цифр после него
        return "+" + digits if len(digits) == 11 and digits[0] == "7" and raw.count("+") == 1 else None
    if "+" in raw:
        return None
    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    return "+7" + digits if len(digits) == 10 else None


def mask_card(number: str) -> str:
    return f"{number[:4]} {number[4:6]}•• •••• {number[12:]}"


def short_card(number: str) -> str:
    return f"{number[:4]} •• {number[12:]}"


def mask_account(number: str) -> str:
    return f"•• {number[-4:]}"


def short_name(first_name: str, last_name: str) -> str:
    return f"{first_name} {last_name[:1]}."


def full_name_short(full: str) -> str:
    """«Пётр Козлов» -> «Пётр К.»"""
    parts = full.split()
    return parts[0] if len(parts) == 1 else f"{parts[0]} {parts[1][:1]}."
