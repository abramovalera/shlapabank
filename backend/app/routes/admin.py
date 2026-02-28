"""Admin API: список пользователей, блокировка, удаление, банки, транзакции."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.banks import OUR_BANK_CODE, get_external_bank_codes
from app.core.config import settings
from app.db import get_db
from app.models import Account, Transaction, User, UserBank, UserStatus
from app.schemas import TransactionPublic, UserBanksUpdateRequest, UserPublic
from app.security import require_admin

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _user_is_default_admin(user: User) -> bool:
    return (
        user.login == settings.default_admin_login
        or user.email == settings.default_admin_email
    )


@router.get(
    "/users",
    response_model=list[UserPublic],
    summary="Список пользователей (только админ)",
)
def list_users(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = list(db.scalars(select(User).order_by(User.id)))
    return users


@router.post(
    "/users/{user_id}/block",
    response_model=UserPublic,
    summary="Заблокировать пользователя",
)
def block_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="not_found")
    if _user_is_default_admin(user):
        raise HTTPException(status_code=400, detail="cannot_delete_admin")
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
def unblock_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
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
    status_code=200,
    summary="Удалить пользователя (для очистки тестовых данных)",
)
def delete_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="not_found")
    if _user_is_default_admin(user):
        raise HTTPException(status_code=400, detail="cannot_delete_admin")
    db.delete(user)
    db.commit()
    return {"detail": "user_deleted"}


@router.get(
    "/users/{user_id}/banks",
    summary="Получить банки пользователя для перевода по телефону",
)
def get_user_banks(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="not_found")
    banks = list(
        db.scalars(
            select(UserBank).where(UserBank.user_id == user_id).order_by(UserBank.id)
        )
    )
    return {"bank_codes": [ub.bank_code for ub in banks]}


@router.put(
    "/users/{user_id}/banks",
    summary="Настроить банки пользователя (0–5 внешних банков)",
)
def update_user_banks(
    user_id: int,
    payload: UserBanksUpdateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="not_found")

    external = set(get_external_bank_codes())
    if OUR_BANK_CODE in payload.bank_codes:
        raise HTTPException(status_code=400, detail="invalid_bank_codes")
    for code in payload.bank_codes:
        if code not in external:
            raise HTTPException(status_code=400, detail="invalid_bank_codes")

    # Удаляем старые, добавляем новые
    existing = list(
        db.scalars(select(UserBank).where(UserBank.user_id == user_id))
    )
    for ub in existing:
        db.delete(ub)
    for code in payload.bank_codes:
        db.add(UserBank(user_id=user_id, bank_code=code))
    db.commit()
    return {"detail": "banks_updated", "bank_codes": payload.bank_codes}


@router.get(
    "/users/{user_id}/transactions",
    response_model=list[TransactionPublic],
    summary="Получить транзакции пользователя (только админ)",
)
def get_user_transactions(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="not_found")

    owned_account_ids = db.scalars(
        select(Account.id).where(Account.user_id == user_id)
    ).all()
    txs = db.scalars(
        select(Transaction)
        .where(
            or_(
                Transaction.initiated_by == user_id,
                Transaction.from_account_id.in_(owned_account_ids),
                Transaction.to_account_id.in_(owned_account_ids),
            )
        )
        .order_by(Transaction.created_at.desc())
    ).all()
    return list(txs)
