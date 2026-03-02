"""Общие зависимости и хелперы для роутов: получение счёта текущего пользователя."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, User, UserRole


def get_own_account(
    account_id: int,
    current_user: User,
    db: Session,
    *,
    active_only: bool = False,
    for_update: bool = False,
) -> Account:
    """
    Возвращает счёт по id, если он принадлежит текущему пользователю.
    Иначе — HTTP 404 с detail=\"account_not_found\".
    """
    q = select(Account).where(
        Account.id == account_id,
        Account.user_id == current_user.id,
    )
    if active_only:
        q = q.where(Account.is_active.is_(True))
    if for_update:
        q = q.with_for_update()
    account = db.scalar(q)
    if not account:
        raise HTTPException(status_code=404, detail="account_not_found")
    return account


def get_own_active_account(
    account_id: int,
    current_user: User,
    db: Session,
    *,
    for_update: bool = False,
) -> Account:
    """Счёт текущего пользователя, активный (is_active=True). Иначе 404."""
    return get_own_account(
        account_id,
        current_user,
        db,
        active_only=True,
        for_update=for_update,
    )


def get_account_for_helper(
    account_id: int,
    current_user: User,
    db: Session,
) -> Account:
    """Свой счёт — всегда. Чужой — только для админа (начисление зарплаты)."""
    account = db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="account_not_found")
    if not account.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    if account.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="forbidden_account_access")
    return account
