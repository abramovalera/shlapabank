from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Account, Transaction, TransactionStatus, TransactionType, User, UserStatus
from app.otp import validate_otp_for_user
from app.schemas import AdminCreditRequest, TransactionPublic, UserPublic
from app.security import require_admin

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get(
    "/users",
    response_model=list[UserPublic],
    summary="Список всех пользователей (ADMIN)",
)
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.id)).all()


@router.post(
    "/users/{user_id}/block",
    response_model=UserPublic,
    summary="Заблокировать пользователя",
)
def block_user(user_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="not_found")
    user.status = UserStatus.BLOCKED
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post(
    "/users/{user_id}/unblock",
    response_model=UserPublic,
    summary="Разблокировать пользователя",
)
def unblock_user(user_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="not_found")
    user.status = UserStatus.ACTIVE
    user.failed_login_attempts = 0
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post(
    "/accounts/{account_id}/credit",
    response_model=TransactionPublic,
    status_code=201,
    summary="Пополнить счёт пользователя от имени ADMIN",
)
def credit_account(
    account_id: int,
    payload: AdminCreditRequest,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not validate_otp_for_user(current_admin.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    account = db.scalar(select(Account).where(Account.id == account_id, Account.is_active.is_(True)).with_for_update())
    if not account:
        raise HTTPException(status_code=404, detail="account_not_found")
    if payload.amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="amount_must_be_positive")

    account.balance += payload.amount
    tx = Transaction(
        from_account_id=None,
        to_account_id=account.id,
        type=TransactionType.TOPUP,
        amount=payload.amount,
        currency=account.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_admin.id,
        description="admin_credit",
    )
    db.add(account)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.get(
    "/transactions",
    response_model=list[TransactionPublic],
    summary="История всех транзакций системы (ADMIN)",
)
def list_all_transactions(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(Transaction).order_by(Transaction.created_at.desc())).all()
