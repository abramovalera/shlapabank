from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, aliased

from app.banks import OUR_BANK_CODE, BANKS_CATALOG
from app.constants import DAILY_TRANSFER_LIMIT, MAX_TRANSFER_AMOUNT, MIN_TRANSFER_AMOUNT
from app.db import get_db
from app.phone_utils import normalize_phone
from app.models import Account, AccountType, Bank, Currency, Transaction, TransactionStatus, TransactionType, User, UserBank
from app.otp import validate_otp_for_user
from app.schemas import (
    ExchangeRequest,
    TransferByAccountCheckResponse,
    TransferByAccountRequest,
    TransferByPhoneCheckResponse,
    TransferByPhoneRequest,
    TransactionPublic,
    TransferCreateRequest,
)
from app.security import require_active_user

router = APIRouter(prefix="/api/v1/transfers", tags=["transfers"])

RATES_TO_RUB: dict[Currency, Decimal] = {
    # Захардкоженные ориентировочные курсы к RUB
    Currency.RUB: Decimal("1"),
    Currency.USD: Decimal("95"),   # 1 USD ≈ 95 RUB
    Currency.EUR: Decimal("105"),  # 1 EUR ≈ 105 RUB
    Currency.CNY: Decimal("13.5"), # 1 CNY ≈ 13.5 RUB
}


def _calc_today_transfers_per_currency(current_user: User, db: Session) -> dict[Currency, Decimal]:
    """Сумма переводов за сегодня по валютам: вовне (не между своими) + переводы в другой банк (to_account_id is None)."""
    day_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    from_acc = aliased(Account)
    to_acc = aliased(Account)
    tx_list = db.scalars(
        select(Transaction)
        .where(
            Transaction.initiated_by == current_user.id,
            Transaction.type == TransactionType.TRANSFER,
            Transaction.status == TransactionStatus.COMPLETED,
            Transaction.created_at >= day_start,
        )
        .join(from_acc, Transaction.from_account_id == from_acc.id)
        .outerjoin(to_acc, Transaction.to_account_id == to_acc.id)
        .where(or_(to_acc.id.is_(None), from_acc.user_id != to_acc.user_id))
    ).all()
    per_currency: dict[Currency, Decimal] = {}
    for tx in tx_list:
        curr = tx.currency
        per_currency[curr] = per_currency.get(curr, Decimal("0.00")) + tx.amount
    return per_currency


def _mask_account(account_number: str) -> str:
    """Маскирует номер счёта: ••••1234."""
    if not account_number:
        return "••••"
    s = str(account_number)
    return f"••••{s[-4:]}" if len(s) >= 4 else "••••"


def _check_daily_limit(used_per_currency: dict[Currency, Decimal], currency: Currency, amount: Decimal) -> None:
    """Проверяет суточный лимит по валюте. При превышении — HTTPException 400."""
    limit = DAILY_TRANSFER_LIMIT.get(currency)
    if limit is None:
        return
    used = used_per_currency.get(currency, Decimal("0.00"))
    if used + amount > limit:
        raise HTTPException(status_code=400, detail="transfer_amount_exceeds_daily_limit")


@router.post(
    "",
    response_model=TransactionPublic,
    status_code=201,
    summary="Перевести между своими счетами",
)
def create_transfer(
    payload: TransferCreateRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    # OTP не требуется при переводе между своими счетами
    if payload.otp_code is not None and not validate_otp_for_user(current_user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status_code=400, detail="transfer_same_account")

    if payload.amount < MIN_TRANSFER_AMOUNT:
        raise HTTPException(status_code=400, detail="transfer_amount_too_small")
    if payload.amount > MAX_TRANSFER_AMOUNT:
        raise HTTPException(status_code=400, detail="transfer_amount_exceeds_single_limit")

    account_ids = sorted([payload.from_account_id, payload.to_account_id])
    locked = db.scalars(select(Account).where(Account.id.in_(account_ids)).with_for_update()).all()
    by_id = {acc.id: acc for acc in locked}
    source = by_id.get(payload.from_account_id)
    target = by_id.get(payload.to_account_id)

    if not source or not target:
        raise HTTPException(status_code=404, detail="account_not_found")
    if source.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="forbidden_account_access")
    if source.account_type == AccountType.SAVINGS:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_from_savings")
    if not source.is_active or not target.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    if source.currency != target.currency:
        raise HTTPException(status_code=400, detail="currency_mismatch")
    if source.balance < payload.amount:
        raise HTTPException(status_code=400, detail="insufficient_funds")

    # Перевод между своими счетами не тратит дневной лимит
    source.balance -= payload.amount
    target.balance += payload.amount

    transaction = Transaction(
        from_account_id=source.id,
        to_account_id=target.id,
        type=TransactionType.TRANSFER,
        amount=payload.amount,
        currency=source.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description="p2p_transfer",
        fee=Decimal("0"),
    )
    db.add(source)
    db.add(target)
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.post(
    "/by-account",
    response_model=TransactionPublic,
    status_code=201,
    summary="Перевести по номеру счёта",
)
def create_transfer_by_account(
    payload: TransferByAccountRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not validate_otp_for_user(current_user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    if payload.amount < MIN_TRANSFER_AMOUNT:
        raise HTTPException(status_code=400, detail="transfer_amount_too_small")
    if payload.amount > MAX_TRANSFER_AMOUNT:
        raise HTTPException(status_code=400, detail="transfer_amount_exceeds_single_limit")

    source = db.scalar(
        select(Account)
        .where(Account.id == payload.from_account_id, Account.user_id == current_user.id)
        .with_for_update()
    )
    if not source:
        raise HTTPException(status_code=404, detail="account_not_found")

    target = db.scalar(
        select(Account).where(Account.account_number == payload.target_account_number).with_for_update()
    )
    if not target:
        raise HTTPException(status_code=404, detail="account_not_found")

    if not source.is_active or not target.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    if source.account_type == AccountType.SAVINGS:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_from_savings")
    if source.id == target.id:
        raise HTTPException(status_code=400, detail="transfer_same_account")
    if source.currency != target.currency:
        raise HTTPException(status_code=400, detail="currency_mismatch")
    if source.balance < payload.amount:
        raise HTTPException(status_code=400, detail="insufficient_funds")

    # Проверка суточного лимита по валюте счёта списания
    used_per_currency = _calc_today_transfers_per_currency(current_user, db)
    _check_daily_limit(used_per_currency, source.currency, payload.amount)

    source.balance -= payload.amount
    target.balance += payload.amount

    masked = _mask_account(target.account_number)
    tx = Transaction(
        from_account_id=source.id,
        to_account_id=target.id,
        type=TransactionType.TRANSFER,
        amount=payload.amount,
        currency=source.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description=f"p2p_transfer_by_account:{source.currency.value}:{masked}",
        fee=Decimal("0"),
    )
    db.add(source)
    db.add(target)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


EXTERNAL_TRANSFER_FEE_RATE = Decimal("0.05")  # 5% — перевод по номеру счёта в другой банк
EXTERNAL_PHONE_FEE_RATE = Decimal("0.02")  # 2% — перевод по телефону в другой банк


@router.get(
    "/by-account/check",
    response_model=TransferByAccountCheckResponse,
    summary="Проверить, есть ли счёт в нашем банке",
)
def by_account_check(
    target_account_number: str,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Номер счёта 16 цифр. Возвращает found=true если счёт найден у нас, иначе found=false. masked — для отображения (••••1234)."""
    if len(target_account_number) != 16 or not target_account_number.isdigit():
        raise HTTPException(status_code=400, detail="invalid_account_number")
    target = db.scalar(select(Account).where(Account.account_number == target_account_number))
    masked = _mask_account(target_account_number)
    return TransferByAccountCheckResponse(found=target is not None, masked=masked)


@router.post(
    "/external-by-account",
    response_model=TransactionPublic,
    status_code=201,
    summary="Перевести на счёт в другом банке (с комиссией 5%)",
)
def create_transfer_external_by_account(
    payload: TransferByAccountRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Перевод на счёт, не найденный в нашем банке. Списывается сумма + 5% комиссия. OTP обязателен.
    Разовый лимит 300k относится только к сумме перевода; комиссия сверху (итого списание до 315k)."""
    if not validate_otp_for_user(current_user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    if payload.amount < MIN_TRANSFER_AMOUNT:
        raise HTTPException(status_code=400, detail="transfer_amount_too_small")
    if payload.amount > MAX_TRANSFER_AMOUNT:
        raise HTTPException(status_code=400, detail="transfer_amount_exceeds_single_limit")

    source = db.scalar(
        select(Account)
        .where(Account.id == payload.from_account_id, Account.user_id == current_user.id)
        .with_for_update()
    )
    if not source:
        raise HTTPException(status_code=404, detail="account_not_found")

    # Не переводим на счёт, который есть в нашем банке — только внешний
    target_in_our_bank = db.scalar(
        select(Account).where(Account.account_number == payload.target_account_number)
    )
    if target_in_our_bank:
        raise HTTPException(
            status_code=400,
            detail="account_found_in_bank",
        )

    if not source.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    if source.account_type == AccountType.SAVINGS:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_from_savings")

    fee = (payload.amount * EXTERNAL_TRANSFER_FEE_RATE).quantize(Decimal("0.01"))
    total_debit = payload.amount + fee

    if source.balance < total_debit:
        raise HTTPException(status_code=400, detail="insufficient_funds")

    used_per_currency = _calc_today_transfers_per_currency(current_user, db)
    _check_daily_limit(used_per_currency, source.currency, payload.amount)

    source.balance -= total_debit

    masked = _mask_account(payload.target_account_number)
    tx = Transaction(
        from_account_id=source.id,
        to_account_id=None,
        type=TransactionType.TRANSFER,
        amount=payload.amount,
        currency=source.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description=f"external_transfer:{source.currency.value}:{masked}:fee_{fee}",
        fee=fee,
    )
    db.add(source)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def _external_banks_list() -> list[dict]:
    """Список внешних банков для ответа (когда получатель не найден — показываем все)."""
    return [
        {"id": code, "label": label}
        for code, label in BANKS_CATALOG
        if code != OUR_BANK_CODE
    ]


@router.get(
    "/by-phone/check",
    response_model=TransferByPhoneCheckResponse,
    summary="Проверить телефон, получить банки",
)
def by_phone_check(
    phone: str,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Если получатель в нашем банке — возвращаем название нашего банка (ShlapaBank) + его 0–5 назначенных банков. Иначе — все внешние банки."""
    normalized = normalize_phone(phone)
    if not normalized:
        return TransferByPhoneCheckResponse(inOurBank=False, availableBanks=_external_banks_list())
    recipient = db.scalar(select(User).where(User.phone == normalized))
    if recipient:
        our_bank = next((b for b in BANKS_CATALOG if b[0] == OUR_BANK_CODE), None)
        options = [{"id": our_bank[0], "label": our_bank[1]}] if our_bank else []
        user_banks = db.scalars(
            select(Bank).join(UserBank, UserBank.bank_code == Bank.code).where(UserBank.user_id == recipient.id)
        ).all()
        for b in user_banks:
            options.append({"id": b.code, "label": b.label})
        return TransferByPhoneCheckResponse(inOurBank=True, availableBanks=options)
    return TransferByPhoneCheckResponse(inOurBank=False, availableBanks=_external_banks_list())


@router.post(
    "/by-phone",
    response_model=TransactionPublic,
    status_code=201,
    summary="Перевести по номеру телефона",
)
def create_transfer_by_phone(
    payload: TransferByPhoneRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not validate_otp_for_user(current_user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    amount = payload.amount
    if amount < MIN_TRANSFER_AMOUNT:
        raise HTTPException(status_code=400, detail="transfer_amount_too_small")
    if amount > MAX_TRANSFER_AMOUNT:
        raise HTTPException(status_code=400, detail="transfer_amount_exceeds_single_limit")

    source = db.scalar(
        select(Account)
        .where(Account.id == payload.from_account_id, Account.user_id == current_user.id)
        .with_for_update()
    )
    if not source:
        raise HTTPException(status_code=404, detail="account_not_found")
    if not source.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    if source.account_type == AccountType.SAVINGS:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_from_savings")

    used_per_currency = _calc_today_transfers_per_currency(current_user, db)
    _check_daily_limit(used_per_currency, source.currency, amount)

    if payload.recipient_bank_id == OUR_BANK_CODE:
        if source.balance < amount:
            raise HTTPException(status_code=400, detail="insufficient_funds")
        normalized_phone = normalize_phone(payload.phone) or payload.phone
        recipient = db.scalar(select(User).where(User.phone == normalized_phone))
        if not recipient:
            raise HTTPException(status_code=404, detail="recipient_not_found_in_our_bank")
        target = db.scalar(
            select(Account)
            .where(
                Account.user_id == recipient.id,
                Account.currency == source.currency,
                Account.account_type == AccountType.DEBIT,
                Account.is_active.is_(True),
            )
            .with_for_update()
        )
        if not target:
            raise HTTPException(status_code=400, detail="recipient_has_no_suitable_account")
        if source.id == target.id:
            raise HTTPException(status_code=400, detail="transfer_same_account")
        source.balance -= amount
        target.balance += amount
        masked = _mask_account(target.account_number)
        tx = Transaction(
            from_account_id=source.id,
            to_account_id=target.id,
            type=TransactionType.TRANSFER,
            amount=amount,
            currency=source.currency,
            status=TransactionStatus.COMPLETED,
            initiated_by=current_user.id,
            description=f"p2p_transfer_by_phone:{source.currency.value}:{masked}",
            fee=Decimal("0"),
        )
        db.add(source)
        db.add(target)
        db.add(tx)
        db.commit()
        db.refresh(tx)
        return tx

    # Перевод в другой банк: комиссия 2%, списание amount + fee
    fee = (amount * EXTERNAL_PHONE_FEE_RATE).quantize(Decimal("0.01"))
    total_debit = amount + fee
    if source.balance < total_debit:
        raise HTTPException(status_code=400, detail="insufficient_funds")
    source.balance -= total_debit
    tx = Transaction(
        from_account_id=source.id,
        to_account_id=None,
        type=TransactionType.TRANSFER,
        amount=amount,
        currency=source.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description=f"p2p_by_phone_external:{payload.recipient_bank_id}:{payload.phone}:fee_{fee}",
        fee=fee,
    )
    db.add(source)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.post(
    "/exchange",
    response_model=TransactionPublic,
    status_code=201,
    summary="Обменять валюту",
)
def exchange_currency(
    payload: ExchangeRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not validate_otp_for_user(current_user.id, payload.otp_code):
        raise HTTPException(status_code=400, detail="invalid_otp_code")

    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status_code=400, detail="transfer_same_account")

    if payload.amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="transfer_amount_too_small")

    account_ids = sorted([payload.from_account_id, payload.to_account_id])
    locked = db.scalars(select(Account).where(Account.id.in_(account_ids)).with_for_update()).all()
    by_id = {acc.id: acc for acc in locked}
    source = by_id.get(payload.from_account_id)
    target = by_id.get(payload.to_account_id)

    if not source or not target:
        raise HTTPException(status_code=404, detail="account_not_found")
    if source.user_id != current_user.id or target.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="forbidden_account_access")
    if not source.is_active or not target.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    if source.account_type == AccountType.SAVINGS:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_from_savings")
    if source.currency == target.currency:
        raise HTTPException(status_code=400, detail="currency_mismatch")

    source_rate = RATES_TO_RUB.get(source.currency)
    target_rate = RATES_TO_RUB.get(target.currency)
    if source_rate is None or target_rate is None:
        raise HTTPException(status_code=400, detail="currency_not_supported_for_exchange")

    if source.balance < payload.amount:
        raise HTTPException(status_code=400, detail="insufficient_funds")

    # Обмен учитывается в суточном лимите по валюте счёта списания
    used_per_currency = _calc_today_transfers_per_currency(current_user, db)
    _check_daily_limit(used_per_currency, source.currency, payload.amount)

    rub_equivalent = payload.amount * source_rate
    target_amount = rub_equivalent / target_rate

    source.balance -= payload.amount
    target.balance += target_amount

    tx = Transaction(
        from_account_id=source.id,
        to_account_id=target.id,
        type=TransactionType.TRANSFER,
        amount=payload.amount,
        currency=source.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description=f"fx_exchange:{source.currency.value}->{target.currency.value}:{target_amount}",
        fee=Decimal("0"),
    )
    db.add(source)
    db.add(target)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.get(
    "/daily-usage",
    summary="Получить остаток суточного лимита",
)
def daily_usage(
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Возвращает использовано/лимит по каждой валюте за сегодня."""
    used_per_currency = _calc_today_transfers_per_currency(current_user, db)
    per_currency = []
    for currency in Currency:
        limit = DAILY_TRANSFER_LIMIT.get(currency)
        if limit is None:
            continue
        used = used_per_currency.get(currency, Decimal("0.00"))
        remaining = max(limit - used, Decimal("0.00"))
        per_currency.append({
            "currency": currency.value,
            "dailyLimit": str(limit),
            "usedToday": str(used),
            "remaining": str(remaining),
        })
    return {"limits": {"perCurrency": per_currency}}


@router.get("/rates", summary="Получить курсы валют")
def exchange_rates(current_user: User = Depends(require_active_user)):
    return {
        "userId": current_user.id,
        "base": "RUB",
        "toRub": {currency.value: str(rate) for currency, rate in RATES_TO_RUB.items()},
    }
