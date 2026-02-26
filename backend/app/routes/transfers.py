from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Account, AccountType, Currency, Transaction, TransactionStatus, TransactionType, User
from app.otp import validate_otp_for_user
from app.schemas import ExchangeRequest, TransferByAccountRequest, TransactionPublic, TransferCreateRequest
from app.security import require_active_user

router = APIRouter(prefix="/api/v1/transfers", tags=["transfers"])

MIN_AMOUNT = Decimal("10.00")
MAX_AMOUNT = Decimal("300000.00")
DAILY_LIMIT = Decimal("1000000.00")

RATES_TO_RUB: dict[Currency, Decimal] = {
    # Захардкоженные ориентировочные курсы к RUB
    Currency.RUB: Decimal("1"),
    Currency.USD: Decimal("95"),   # 1 USD ≈ 95 RUB
    Currency.EUR: Decimal("105"),  # 1 EUR ≈ 105 RUB
    Currency.CNY: Decimal("13.5"), # 1 CNY ≈ 13.5 RUB
}


def _calc_today_transfers_rub(current_user: User, db: Session) -> dict:
    """Используется при проверке дневного лимита в POST /transfers и /by-account."""
    day_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    tx_list = db.scalars(
        select(Transaction).where(
            Transaction.initiated_by == current_user.id,
            Transaction.type == TransactionType.TRANSFER,
            Transaction.status == TransactionStatus.COMPLETED,
            Transaction.created_at >= day_start,
        )
    ).all()
    to_rub = lambda amount, currency: amount * RATES_TO_RUB.get(currency, Decimal("1"))
    total_rub = Decimal("0.00")
    per_account: dict[int, Decimal] = {}
    for tx in tx_list:
        rub = to_rub(tx.amount, tx.currency)
        total_rub += rub
        if tx.from_account_id is not None:
            per_account[tx.from_account_id] = per_account.get(tx.from_account_id, Decimal("0.00")) + rub
    return {"total_rub": total_rub, "per_account_rub": per_account}


@router.get(
    "/daily-usage",
    summary="Остаток дневного лимита по переводам (для полоски прогресса в UI)",
)
def daily_usage(
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Возвращает использовано/лимит по счёту за сегодня — для отображения статус-бара в модалках перевода."""
    stats = _calc_today_transfers_rub(current_user, db)
    total_used = stats["total_rub"]
    remaining_total = max(DAILY_LIMIT - total_used, Decimal("0.00"))
    accounts = db.scalars(
        select(Account).where(Account.user_id == current_user.id, Account.is_active.is_(True))
    ).all()
    per_account = []
    for acc in accounts:
        used = stats["per_account_rub"].get(acc.id, Decimal("0.00"))
        remaining = max(DAILY_LIMIT - used, Decimal("0.00"))
        per_account.append({
            "accountId": acc.id,
            "accountNumber": acc.account_number,
            "currency": acc.currency.value,
            "usedTodayRubEquivalent": str(used),
            "dailyLimitRubEquivalent": str(DAILY_LIMIT),
            "remainingRubEquivalent": str(remaining),
        })
    return {
        "limits": {
            "perUserDaily": {
                "dailyLimitRubEquivalent": str(DAILY_LIMIT),
                "usedTodayRubEquivalent": str(total_used),
                "remainingRubEquivalent": str(remaining_total),
            },
            "perAccountDaily": per_account,
        },
    }


@router.get("/rates", summary="Получить фиксированные курсы валют к RUB")
def exchange_rates(current_user: User = Depends(require_active_user)):
    return {
        "userId": current_user.id,
        "base": "RUB",
        "toRub": {currency.value: str(rate) for currency, rate in RATES_TO_RUB.items()},
    }


@router.post(
    "",
    response_model=TransactionPublic,
    status_code=201,
    summary="Перевод между своими счетами по ID",
)
def create_transfer(
    payload: TransferCreateRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not validate_otp_for_user(current_user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status_code=400, detail="transfer_same_account")

    if payload.amount < MIN_AMOUNT:
        raise HTTPException(status_code=400, detail="transfer_amount_too_small")
    if payload.amount > MAX_AMOUNT:
        raise HTTPException(status_code=400, detail="transfer_amount_exceeds_single_limit")

    account_ids = sorted([payload.from_account_id, payload.to_account_id])
    locked = db.scalars(select(Account).where(Account.id.in_(account_ids)).with_for_update()).all()
    by_id = {acc.id: acc for acc in locked}
    source = by_id.get(payload.from_account_id)
    target = by_id.get(payload.to_account_id)

    if not source or not target:
        raise HTTPException(status_code=404, detail="account_not_found")
    if source.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="forbidden_account_access")
    if source.account_type == AccountType.SAVINGS:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_from_savings")
    if not source.is_active or not target.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    if source.currency != target.currency:
        raise HTTPException(status_code=400, detail="currency_mismatch")
    if source.balance < payload.amount:
        raise HTTPException(status_code=400, detail="insufficient_funds")

    # Проверка дневного лимита в рублёвом эквиваленте после того,
    # как мы знаем валюту исходного счёта
    stats = _calc_today_transfers_rub(current_user, db)
    to_rub_amount = payload.amount * RATES_TO_RUB.get(source.currency, Decimal("1"))
    if stats["total_rub"] + to_rub_amount > DAILY_LIMIT:
        raise HTTPException(status_code=400, detail="transfer_amount_exceeds_daily_limit")

    source.balance -= payload.amount
    target.balance += payload.amount

    transaction = Transaction(
        from_account_id=source.id,
        to_account_id=target.id,
        type=TransactionType.TRANSFER,
        amount=payload.amount,
        currency=source.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description="p2p_transfer",
    )
    db.add(source)
    db.add(target)
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.post(
    "/by-account",
    response_model=TransactionPublic,
    status_code=201,
    summary="Перевод по номеру счёта получателя",
)
def create_transfer_by_account(
    payload: TransferByAccountRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not validate_otp_for_user(current_user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    if payload.amount < MIN_AMOUNT:
        raise HTTPException(status_code=400, detail="transfer_amount_too_small")
    if payload.amount > MAX_AMOUNT:
        raise HTTPException(status_code=400, detail="transfer_amount_exceeds_single_limit")

    source = db.scalar(
        select(Account)
        .where(Account.id == payload.from_account_id, Account.user_id == current_user.id)
        .with_for_update()
    )
    if not source:
        raise HTTPException(status_code=404, detail="account_not_found")

    target = db.scalar(
        select(Account).where(Account.account_number == payload.target_account_number).with_for_update()
    )
    if not target:
        raise HTTPException(status_code=404, detail="account_not_found")

    if not source.is_active or not target.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    if source.account_type == AccountType.SAVINGS:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_from_savings")
    if source.id == target.id:
        raise HTTPException(status_code=400, detail="transfer_same_account")
    if source.currency != target.currency:
        raise HTTPException(status_code=400, detail="currency_mismatch")
    if source.balance < payload.amount:
        raise HTTPException(status_code=400, detail="insufficient_funds")

    # Проверка дневного лимита в рублёвом эквиваленте после того,
    # как выяснили валюту исходного счёта
    stats = _calc_today_transfers_rub(current_user, db)
    to_rub_amount = payload.amount * RATES_TO_RUB.get(source.currency, Decimal("1"))
    if stats["total_rub"] + to_rub_amount > DAILY_LIMIT:
        raise HTTPException(status_code=400, detail="transfer_amount_exceeds_daily_limit")

    source.balance -= payload.amount
    target.balance += payload.amount

    tx = Transaction(
        from_account_id=source.id,
        to_account_id=target.id,
        type=TransactionType.TRANSFER,
        amount=payload.amount,
        currency=source.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description="p2p_transfer_by_account",
    )
    db.add(source)
    db.add(target)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.post(
    "/exchange",
    response_model=TransactionPublic,
    status_code=201,
    summary="Обмен валют между своими счетами",
)
def exchange_currency(
    payload: ExchangeRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not validate_otp_for_user(current_user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status_code=400, detail="transfer_same_account")

    if payload.amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="transfer_amount_too_small")

    account_ids = sorted([payload.from_account_id, payload.to_account_id])
    locked = db.scalars(select(Account).where(Account.id.in_(account_ids)).with_for_update()).all()
    by_id = {acc.id: acc for acc in locked}
    source = by_id.get(payload.from_account_id)
    target = by_id.get(payload.to_account_id)

    if not source or not target:
        raise HTTPException(status_code=404, detail="account_not_found")
    if source.user_id != current_user.id or target.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="forbidden_account_access")
    if not source.is_active or not target.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    if source.account_type == AccountType.SAVINGS:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_from_savings")
    if source.currency == target.currency:
        raise HTTPException(status_code=400, detail="currency_mismatch")

    source_rate = RATES_TO_RUB.get(source.currency)
    target_rate = RATES_TO_RUB.get(target.currency)
    if source_rate is None or target_rate is None:
        raise HTTPException(status_code=400, detail="currency_not_supported_for_exchange")

    if source.balance < payload.amount:
        raise HTTPException(status_code=400, detail="insufficient_funds")

    rub_equivalent = payload.amount * source_rate
    target_amount = rub_equivalent / target_rate

    source.balance -= payload.amount
    target.balance += target_amount

    tx = Transaction(
        from_account_id=source.id,
        to_account_id=target.id,
        type=TransactionType.TRANSFER,
        amount=payload.amount,
        currency=source.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description=f"fx_exchange:{source.currency.value}->{target.currency.value}:{target_amount}",
    )
    db.add(source)
    db.add(target)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx
