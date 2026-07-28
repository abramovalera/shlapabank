from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Account, Card, Transaction, TransferContact, User, UserBank
from app.phone_utils import normalize_phone
from app.schemas import ActionResponse, ProfileUpdateRequest, UserPublic
from app.security import get_current_user, require_active_user, validate_password_rules, verify_password

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])


@router.get("", response_model=UserPublic, summary="Получить профиль")
def get_profile(current_user: User = Depends(get_current_user)):
    """Заблокированный может читать профиль (увидеть статус и сообщение)."""
    return current_user


@router.put("", response_model=UserPublic, summary="Обновить профиль")
def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    updates = payload.model_dump(exclude_unset=True)

    if "phone" in updates and updates["phone"] is not None:
        normalized_phone = normalize_phone(updates["phone"]) or updates["phone"]
        updates["phone"] = normalized_phone
        existing = db.scalar(select(User).where(User.phone == normalized_phone))
        if existing and existing.id != current_user.id:
            raise HTTPException(status_code=409, detail="validation_error: phone_not_unique")

    if "email" in updates and updates["email"] is not None:
        existing = db.scalar(select(User).where(User.email == updates["email"]))
        if existing and existing.id != current_user.id:
            raise HTTPException(status_code=409, detail="validation_error: email_not_unique")

    has_current_password = "current_password" in updates
    has_new_password = "new_password" in updates
    if has_current_password != has_new_password:
        raise HTTPException(status_code=400, detail="validation_error: password_change_requires_both_fields")

    if has_current_password and has_new_password:
        current_password = updates["current_password"]
        new_password = updates["new_password"]

        if not verify_password(current_password, current_user.password_hash):
            raise HTTPException(status_code=401, detail="invalid_current_password")

        validate_password_rules(current_user.login, new_password)
        if new_password == current_user.password_hash:
            raise HTTPException(status_code=400, detail="validation_error: password_reuse_not_allowed")
        current_user.password_hash = new_password

    for field, value in updates.items():
        if field in {"current_password", "new_password"}:
            continue
        setattr(current_user, field, value)

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.delete(
    "",
    response_model=ActionResponse,
    summary="Удалить свой аккаунт (self-destruct)",
    description=(
        "Полностью удаляет пользователя вместе со счетами, картами, транзакциями и "
        "контактами. Действие необратимо. Используется для автотестов, чтобы не "
        "засорять базу тестовыми пользователями."
    ),
)
def delete_own_profile(
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    uid = current_user.id
    account_ids = list(
        db.scalars(select(Account.id).where(Account.user_id == uid)).all()
    )
    # Транзакции (сначала — иначе FK на cards/accounts не даст удалить)
    if account_ids:
        db.execute(
            delete(Transaction).where(
                (Transaction.from_account_id.in_(account_ids))
                | (Transaction.to_account_id.in_(account_ids))
            )
        )
    db.execute(delete(Transaction).where(Transaction.initiated_by == uid))
    # Карты
    if account_ids:
        db.execute(delete(Card).where(Card.account_id.in_(account_ids)))
    # Счета
    db.execute(delete(Account).where(Account.user_id == uid))
    # Контакты + банки
    db.execute(delete(TransferContact).where(TransferContact.user_id == uid))
    db.execute(delete(UserBank).where(UserBank.user_id == uid))
    # Сам пользователь
    db.execute(delete(User).where(User.id == uid))
    db.commit()
    return ActionResponse(detail="profile_deleted")
