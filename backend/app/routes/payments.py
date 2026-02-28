from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Account, Currency, Transaction, TransactionStatus, TransactionType, User
from app.otp import validate_otp_for_user
from app.schemas import MobilePaymentRequest, TransactionPublic, VendorPaymentRequest
from app.security import require_active_user

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])

MOBILE_OPERATORS = ["Babline", "MTSha", "MegaFun", "TelePanda", "YotaLike"]
MOBILE_MIN = Decimal("100.00")
MOBILE_MAX = Decimal("12000.00")

VENDOR_PROVIDERS = {
    # Интернет / ТВ / телефония
    "RostelCom+": 15,
    "TV360": 12,
    "FiberNet": 14,
    # ЖКХ
    "ZhKH-Service": 20,
    "UO-Gorod": 18,
    "DomComfort": 22,
    "GasEnergy": 22,
    "CityWater": 18,
    # Образование
    "UniEdu": 16,
    "EduCenter+": 16,
    # Благотворительность
    "GoodHands": 10,
    "KindKids": 12,
}
VENDOR_MIN = Decimal("100.00")
VENDOR_MAX = Decimal("500000.00")


@router.get(
    "/mobile/operators",
    summary="Получить операторов",
)
def mobile_operators(current_user: User = Depends(require_active_user)):
    return {
        "userId": current_user.id,
        "operators": MOBILE_OPERATORS,
        "amountRangeRub": {"min": int(MOBILE_MIN), "max": int(MOBILE_MAX)},
    }


@router.post(
    "/mobile",
    response_model=TransactionPublic,
    status_code=201,
    summary="Оплатить мобильную связь",
)
def pay_mobile(
    payload: MobilePaymentRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not validate_otp_for_user(current_user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    if payload.operator not in MOBILE_OPERATORS:
        raise HTTPException(status_code=400, detail="payment_operator_not_supported")
    if payload.amount < MOBILE_MIN or payload.amount > MOBILE_MAX:
        raise HTTPException(status_code=400, detail="payment_amount_out_of_range")

    account = db.scalar(
        select(Account)
        .where(Account.id == payload.account_id, Account.user_id == current_user.id, Account.is_active.is_(True))
        .with_for_update()
    )
    if not account:
        raise HTTPException(status_code=404, detail="account_not_found")
    if account.currency != Currency.RUB:
        raise HTTPException(status_code=400, detail="payment_requires_rub_account")
    if account.balance < payload.amount:
        raise HTTPException(status_code=400, detail="insufficient_funds")

    account.balance -= payload.amount
    tx = Transaction(
        from_account_id=account.id,
        to_account_id=None,
        type=TransactionType.PAYMENT,
        amount=payload.amount,
        currency=account.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description=f"mobile:{payload.operator}:{payload.phone}",
    )
    db.add(account)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.get(
    "/vendor/providers",
    summary="Получить поставщиков",
)
def vendor_providers(current_user: User = Depends(require_active_user)):
    return {
        "userId": current_user.id,
        "providers": [{"name": name, "accountLength": length} for name, length in VENDOR_PROVIDERS.items()],
        "amountRangeRub": {"min": int(VENDOR_MIN), "max": int(VENDOR_MAX)},
    }


def _execute_vendor_payment(
    payload: VendorPaymentRequest,
    current_user: User,
    db: Session,
) -> Transaction:
    if not validate_otp_for_user(current_user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    provider_account_length = VENDOR_PROVIDERS.get(payload.provider)
    if provider_account_length is None:
        raise HTTPException(status_code=400, detail="payment_provider_not_supported")
    if len(payload.account_number) != provider_account_length:
        raise HTTPException(status_code=400, detail="payment_account_number_invalid_length")
    if payload.amount < VENDOR_MIN or payload.amount > VENDOR_MAX:
        raise HTTPException(status_code=400, detail="payment_amount_out_of_range")

    account = db.scalar(
        select(Account)
        .where(Account.id == payload.account_id, Account.user_id == current_user.id, Account.is_active.is_(True))
        .with_for_update()
    )
    if not account:
        raise HTTPException(status_code=404, detail="account_not_found")
    if account.currency != Currency.RUB:
        raise HTTPException(status_code=400, detail="payment_requires_rub_account")
    if account.balance < payload.amount:
        raise HTTPException(status_code=400, detail="insufficient_funds")

    account.balance -= payload.amount
    tx = Transaction(
        from_account_id=account.id,
        to_account_id=None,
        type=TransactionType.PAYMENT,
        amount=payload.amount,
        currency=account.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description=f"vendor:{payload.provider}:{payload.account_number}",
    )
    db.add(account)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.post(
    "/vendor",
    response_model=TransactionPublic,
    status_code=201,
    summary="Оплатить поставщику",
)
def pay_vendor(
    payload: VendorPaymentRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    return _execute_vendor_payment(payload, current_user, db)
