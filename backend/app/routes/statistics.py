"""Статистика: расходы за месяц по категориям.

Категории выводятся из description транзакции — раньше добавлять поле в модель
не будем, чтобы не тащить миграции. Логика проста и повторяет тесты:
- description начинается с "mobile:"                     -> Связь
- description начинается с "vendor:CityWater|GasEnergy|ZhKH-Service|UO-Gorod|DomComfort" -> ЖКХ
- description начинается с "vendor:RostelCom+|TV360|FiberNet"                   -> Интернет / ТВ
- description начинается с "vendor:UniEdu|EduCenter+"                            -> Образование
- description начинается с "vendor:GoodHands|KindKids"                           -> Благотворительность
- description начинается с "external_transfer:"                                  -> Переводы
- p2p_transfer, self_topup -> НЕ считаются расходом (движение между своими)
- всё остальное списание                                                        -> Прочее
"""

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Account, Currency, Transaction, TransactionType, User
from app.security import require_active_user

router = APIRouter(prefix="/api/v1/statistics", tags=["statistics"])


CATEGORY_ORDER = ["utilities", "mobile", "internet_tv", "education", "charity", "transfers", "other"]

CATEGORY_LABELS = {
    "utilities": "ЖКХ",
    "mobile": "Связь",
    "internet_tv": "Интернет и ТВ",
    "education": "Образование",
    "charity": "Благотворительность",
    "transfers": "Переводы",
    "other": "Прочее",
}


def _classify(description: str | None) -> str:
    d = (description or "").strip().lower()
    if d.startswith("mobile:"):
        return "mobile"
    if d.startswith("vendor:"):
        provider = d.split(":", 2)[1] if ":" in d else ""
        if provider in {"citywater", "gasenergy", "zhkh-service", "uo-gorod", "domcomfort"}:
            return "utilities"
        if provider in {"rostelcom+", "tv360", "fibernet"}:
            return "internet_tv"
        if provider in {"uniedu", "educenter+"}:
            return "education"
        if provider in {"goodhands", "kindkids"}:
            return "charity"
        return "other"
    if d.startswith("external_transfer"):
        return "transfers"
    return "other"


def _is_own_expense(tx: Transaction, owned_ids: set[int]) -> bool:
    """Трата = списание с нашего счёта (from_account_id принадлежит нам)."""
    if tx.type == TransactionType.TOPUP:
        return False
    if tx.from_account_id is None:
        return False
    if tx.from_account_id not in owned_ids:
        return False
    # Перевод между своими — не расход
    desc = (tx.description or "").lower()
    if desc.startswith("p2p_transfer"):
        return False
    if tx.type == TransactionType.TRANSFER and tx.to_account_id in owned_ids:
        return False
    return True


@router.get(
    "/monthly",
    summary="Статистика расходов за текущий месяц с разбивкой по категориям",
)
def monthly_stats(
    year: int | None = Query(default=None, description="По умолчанию — текущий год"),
    month: int | None = Query(default=None, description="По умолчанию — текущий месяц"),
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    y = year or now.year
    m = month or now.month

    period_start = datetime(y, m, 1)
    if m == 12:
        period_end = datetime(y + 1, 1, 1)
    else:
        period_end = datetime(y, m + 1, 1)

    owned_accounts = list(
        db.scalars(select(Account).where(Account.user_id == current_user.id))
    )
    owned_ids = {a.id for a in owned_accounts}

    # Отдаём в БД то, что можно проверить в SQL (свой счёт-источник, не TOPUP,
    # RUB), а не тянем все транзакции платформы ради фильтрации в Python.
    txs = db.scalars(
        select(Transaction).where(
            Transaction.created_at >= period_start,
            Transaction.created_at < period_end,
            Transaction.from_account_id.in_(owned_ids),
            Transaction.type != TransactionType.TOPUP,
            Transaction.currency == Currency.RUB,
        )
    ).all()

    totals: dict[str, Decimal] = {k: Decimal("0") for k in CATEGORY_ORDER}
    total_spent = Decimal("0")

    for tx in txs:
        if not _is_own_expense(tx, owned_ids):
            continue
        # Считаем только рублёвые расходы — валютные пропускаем, чтобы не тащить курсы.
        if tx.currency != Currency.RUB:
            continue
        fee = getattr(tx, "fee", None) or Decimal("0")
        amount = Decimal(tx.amount) + Decimal(fee)
        cat = _classify(tx.description)
        totals[cat] = totals.get(cat, Decimal("0")) + amount
        total_spent += amount

    categories = [
        {
            "key": key,
            "label": CATEGORY_LABELS[key],
            "amount": str(totals[key].quantize(Decimal("0.01"))),
        }
        for key in CATEGORY_ORDER
        if totals[key] > 0
    ]

    return {
        "period": f"{y:04d}-{m:02d}",
        "currency": "RUB",
        "spent": str(total_spent.quantize(Decimal("0.01"))),
        "categories": categories,
    }
