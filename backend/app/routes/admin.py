from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.banks import get_external_bank_codes
from app.core.config import settings
from app.db import get_db
from app.models import Account, Bank, Transaction, TransactionStatus, TransactionType, User, UserBank, UserStatus
from app.schemas import AdminCreditRequest, TransactionPublic, UserBanksUpdateRequest, UserPublic
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


@router.delete(
    "/users/{user_id}",
    status_code=204,
    summary="Удалить пользователя (для очистки тестовых данных)",
)
def delete_user(user_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="not_found")
    if user.login == settings.default_admin_login:
        raise HTTPException(status_code=400, detail="cannot_delete_admin")

    account_ids = [a.id for a in user.accounts]
    tx_conds = [Transaction.initiated_by == user_id]
    if account_ids:
        tx_conds.extend([
            Transaction.from_account_id.in_(account_ids),
            Transaction.to_account_id.in_(account_ids),
        ])
    db.execute(delete(Transaction).where(or_(*tx_conds)))
    db.execute(delete(Account).where(Account.user_id == user_id))
    db.execute(delete(User).where(User.id == user_id))
    db.commit()


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


@router.get(
    "/users/{user_id}/banks",
    summary="Список банков для перевода по телефону у пользователя (ADMIN)",
)
def get_user_banks(user_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="not_found")
    rows = db.scalars(
        select(UserBank).where(UserBank.user_id == user_id)
    ).all()
    bank_codes = [r.bank_code for r in rows]
    banks = db.scalars(select(Bank).where(Bank.code.in_(bank_codes))).all()
    by_code = {b.code: b.label for b in banks}
    return {
        "bank_codes": bank_codes,
        "banks": [{"code": c, "label": by_code.get(c, c)} for c in bank_codes],
    }


@router.put(
    "/users/{user_id}/banks",
    summary="Изменить список банков для перевода у пользователя (0–5, только внешние) (ADMIN)",
)
def update_user_banks(
    user_id: int,
    payload: UserBanksUpdateRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="not_found")
    external = set(get_external_bank_codes())
    invalid = [c for c in payload.bank_codes if c not in external]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"invalid_bank_codes: only external banks allowed, got {invalid!r}",
        )
    if len(payload.bank_codes) > 5:
        raise HTTPException(status_code=400, detail="max_5_banks_allowed")

    db.execute(delete(UserBank).where(UserBank.user_id == user_id))
    for code in payload.bank_codes:
        db.add(UserBank(user_id=user_id, bank_code=code))
    db.commit()
    return {"status": "ok", "bank_codes": payload.bank_codes}
