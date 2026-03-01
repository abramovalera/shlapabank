from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Account, Transaction, TransactionStatus, TransactionType, User, UserRole
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


def _get_account_for_helper(account_id: int, current_user: User, db: Session) -> Account:
    """Свой счёт — всегда. Чужой — только для админа (начисление зарплаты)."""
    account = db.scalar(select(Account).where(Account.id == account_id))
    if not account:
        raise HTTPException(status_code=404, detail="account_not_found")
    if not account.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    if account.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="forbidden_account_access")
    return account


@router.get(
    "/accounts",
    summary="Список счетов для шляпы. Админ видит все счета, клиент — только свои.",
)
def helper_list_accounts(
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if current_user.role == UserRole.ADMIN:
        accounts = list(
            db.scalars(
                select(Account)
                .options(joinedload(Account.owner))
                .where(Account.is_active.is_(True))
                .order_by(Account.id)
            )
        )
        return [
            {
                **AccountPublic.model_validate(a).model_dump(),
                "owner_login": a.owner.login if a.owner else None,
            }
            for a in accounts
        ]
    accounts = list(
        db.scalars(
            select(Account).where(
                Account.user_id == current_user.id,
                Account.is_active.is_(True),
            ).order_by(Account.id)
        )
    )
    return [AccountPublic.model_validate(a).model_dump() for a in accounts]


@router.get(
    "/otp/preview",
    summary="Получить OTP-код",
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


# Лимит баланса и сумм: Numeric(14, 2) — макс 12 знаков до запятой
_MAX_BALANCE = Decimal("999999999999.99")


@router.post(
    "/accounts/{account_id}/increase",
    response_model=AccountPublic,
    summary="Увеличить баланс счёта (без OTP). Создаёт транзакцию для статистики.",
)
def helper_increase_balance(
    account_id: int,
    amount: Decimal = Query(..., gt=0, description="Сумма пополнения"),
    purpose: str | None = Query(None, description="salary (только админ), gift, или пусто — пополнение"),
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if amount > _MAX_BALANCE:
        raise HTTPException(status_code=400, detail="amount_too_large")
    if purpose == "salary" and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="salary_credit_admin_only")
    account = _get_account_for_helper(account_id, current_user, db)
    if account.balance + amount > _MAX_BALANCE:
        raise HTTPException(status_code=400, detail="amount_too_large")
    account.balance += amount
    db.add(account)

    desc = "helper_topup"
    if purpose == "salary":
        desc = "admin_credit"
    elif purpose == "gift":
        desc = "helper_topup:gift"

    tx = Transaction(
        from_account_id=None,
        to_account_id=account.id,
        type=TransactionType.TOPUP,
        amount=amount,
        currency=account.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description=desc,
        fee=Decimal("0"),
    )
    db.add(tx)
    try:
        db.commit()
        db.refresh(account)
        return account
    except (OperationalError, ProgrammingError) as e:
        db.rollback()
        err_msg = str(e).lower() if e else ""
        if "fee" in err_msg and ("column" in err_msg or "does not exist" in err_msg):
            raise HTTPException(
                status_code=503,
                detail="database_migration_required",
            ) from e
        raise


@router.post(
    "/accounts/{account_id}/decrease",
    response_model=AccountPublic,
    summary="Уменьшить баланс счёта",
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


@router.post(
    "/accounts/{account_id}/zero",
    response_model=AccountPublic,
    summary="Обнулить счёт",
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
    "/clear-browser",
    summary="Очистить кеш браузера",
)
def helper_clear_browser(
    current_user: User = Depends(require_active_user),
):
    """Возвращает инструкцию для клиента. Клиент должен вызвать localStorage.clear(), sessionStorage.clear() и выполнить редирект."""
    return {
        "detail": "clear_browser",
        "redirect": "/login",
    }

