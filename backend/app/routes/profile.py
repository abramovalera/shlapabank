from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas import ProfileUpdateRequest, UserPublic
from app.security import get_password_hash, require_active_user, validate_password_rules, verify_password

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])


@router.get("", response_model=UserPublic, summary="Получить профиль текущего пользователя")
def get_profile(current_user: User = Depends(require_active_user)):
    return current_user


@router.put("", response_model=UserPublic, summary="Обновить профиль и пароль пользователя")
def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    updates = payload.model_dump(exclude_unset=True)

    if "phone" in updates and updates["phone"] is not None:
        existing = db.scalar(select(User).where(User.phone == updates["phone"]))
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
        if verify_password(new_password, current_user.password_hash):
            raise HTTPException(status_code=400, detail="validation_error: password_reuse_not_allowed")
        current_user.password_hash = get_password_hash(new_password)

    for field, value in updates.items():
        if field in {"current_password", "new_password"}:
            continue
        setattr(current_user, field, value)

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


