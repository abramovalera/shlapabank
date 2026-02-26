from decimal import Decimal
import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Account, Currency, Transaction, TransactionStatus, TransactionType, User
from app.otp import validate_otp_for_user
from app.schemas import (
    AccountCreateRequest,
    AccountPublic,
    AccountTopupRequest,
    ActionResponse,
    TransactionPublic,
)
from app.security import require_active_user

router = APIRouter(prefix="/api/v1/accounts", tags=["accounts"])

MAX_BY_RUB = 3
MAX_BY_FOREIGN = 3


def _foreign_currencies():
    return [Currency.USD, Currency.EUR, Currency.CNY]


def _generate_account_number(currency: Currency) -> str:
    """
    Генерация цифрового номера счета с маской по валюте.

    RUB  -> 2202XXXXXXXXXXXX
    USD  -> 3202XXXXXXXXXXXX
    EUR  -> 4202XXXXXXXXXXXX
    CNY  -> 5202XXXXXXXXXXXX
    """
    prefixes: dict[Currency, str] = {
        Currency.RUB: "2202",
        Currency.USD: "3202",
        Currency.EUR: "4202",
        Currency.CNY: "5202",
    }
    prefix = prefixes.get(currency, "9999")
    suffix_length = 16 - len(prefix)
    if suffix_length < 4:
        suffix_length = 4
    suffix = "".join(random.choices("0123456789", k=suffix_length))
    return f"{prefix}{suffix}"


@router.get("", response_model=list[AccountPublic], summary="Список активных счетов пользователя")
def list_accounts(
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(Account).where(Account.user_id == current_user.id, Account.is_active.is_(True))
    ).all()


@router.post(
    "",
    response_model=AccountPublic,
    status_code=201,
    summary="Открыть новый счёт",
)
def create_account(
    payload: AccountCreateRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    user_accounts = db.scalars(
        select(Account).where(Account.user_id == current_user.id, Account.is_active.is_(True))
    ).all()

    rub_count = len([acc for acc in user_accounts if acc.currency == Currency.RUB])
    foreign_count = len([acc for acc in user_accounts if acc.currency in _foreign_currencies()])

    if payload.currency == Currency.RUB and rub_count >= MAX_BY_RUB:
        raise HTTPException(status_code=400, detail="account_limit_exceeded")
    if payload.currency in _foreign_currencies() and foreign_count >= MAX_BY_FOREIGN:
        raise HTTPException(status_code=400, detail="account_limit_exceeded")

    account = Account(
        account_number=_generate_account_number(payload.currency),
        user_id=current_user.id,
        account_type=payload.account_type,
        currency=payload.currency,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.delete(
    "/{account_id}",
    response_model=ActionResponse,
    summary="Закрыть счёт при нулевом балансе",
)
def close_account(
    account_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    account = db.scalar(select(Account).where(Account.id == account_id, Account.user_id == current_user.id))
    if not account:
        raise HTTPException(status_code=404, detail="not_found")
    if not account.is_active:
        raise HTTPException(status_code=400, detail="account_already_closed")
    if account.balance != Decimal("0.00"):
        raise HTTPException(status_code=400, detail="account_close_requires_zero_balance")

    account.is_active = False
    db.add(account)
    db.commit()
    return ActionResponse(detail="account_closed")


@router.post(
    "/{account_id}/topup",
    response_model=TransactionPublic,
    status_code=201,
    summary="Пополнить свой счёт",
)
def topup_account(
    account_id: int,
    payload: AccountTopupRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not validate_otp_for_user(current_user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    if payload.amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="amount_must_be_positive")

    account = db.scalar(
        select(Account)
        .where(Account.id == account_id, Account.user_id == current_user.id, Account.is_active.is_(True))
        .with_for_update()
    )
    if not account:
        raise HTTPException(status_code=404, detail="account_not_found")

    account.balance += payload.amount

    tx = Transaction(
        from_account_id=None,
        to_account_id=account.id,
        type=TransactionType.TOPUP,
        amount=payload.amount,
        currency=account.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description="self_topup",
    )
    db.add(account)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx
