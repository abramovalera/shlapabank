from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Account, User
from app.otp import OTP_TTL_MINUTES, issue_otp_preview
from app.schemas import AccountPublic
from app.security import require_active_user

router = APIRouter(prefix="/api/v1/helper", tags=["helper"])


def _get_own_account(account_id: int, current_user: User, db: Session) -> Account:
    account = db.scalar(
        select(Account).where(
            Account.id == account_id,
            Account.user_id == current_user.id,
        )
    )
    if not account:
        raise HTTPException(status_code=404, detail="account_not_found")
    if not account.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    return account


@router.post(
    "/accounts/{account_id}/increase",
    response_model=AccountPublic,
    summary="Пополнить баланс счёта",
)
def helper_increase_balance(
    account_id: int,
    amount: Decimal = Query(..., gt=0, description="Сумма пополнения"),
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    account = _get_own_account(account_id, current_user, db)
    account.balance += amount
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.post(
    "/accounts/{account_id}/zero",
    response_model=AccountPublic,
    summary="Установить баланс счёта в 0",
)
def helper_zero_balance(
    account_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    from decimal import Decimal as _D

    account = _get_own_account(account_id, current_user, db)
    account.balance = _D("0.00")
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.post(
    "/accounts/{account_id}/decrease",
    response_model=AccountPublic,
    summary="Уменьшить баланс счёта на сумму",
)
def helper_decrease_balance(
    account_id: int,
    amount: Decimal = Query(..., gt=0, description="Сумма списания"),
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    account = _get_own_account(account_id, current_user, db)
    if account.balance < amount:
        raise HTTPException(status_code=400, detail="insufficient_funds")
    account.balance -= amount
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.get(
    "/otp/preview",
    summary="Сгенерировать и показать OTP-код для операций (только для тестов)",
)
def helper_otp_preview(
    current_user: User = Depends(require_active_user),
):
    code = issue_otp_preview(current_user.id)
    return {
        "userId": current_user.id,
        "otp": code,
        "ttlSeconds": OTP_TTL_MINUTES * 60,
        "message": f"SMS: ваш код подтверждения {code}",
    }


@router.post(
    "/clear-browser",
    summary="Супер-очистка: сигнал клиенту очистить localStorage, sessionStorage и перейти на страницу входа",
)
def helper_clear_browser(
    current_user: User = Depends(require_active_user),
):
    """Возвращает инструкцию для клиента. Клиент должен вызвать localStorage.clear(), sessionStorage.clear() и выполнить редирект."""
    return {
        "detail": "clear_browser",
        "redirect": "/ui/index.html",
    }

