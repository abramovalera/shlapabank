from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session, aliased

from app import bugs
from app.banks import OUR_BANK_CODE, BANKS_CATALOG
from app.constants import DAILY_TRANSFER_LIMIT, MAX_TRANSFER_AMOUNT, MIN_TRANSFER_AMOUNT
from app.db import get_db
from app.phone_utils import normalize_phone
from app.models import (
    Account,
    AccountType,
    Bank,
    Card,
    CardStatus,
    Currency,
    Transaction,
    TransactionStatus,
    TransactionType,
    TransferContact,
    User,
    UserBank,
)
from app.otp import validate_otp_for_user
from app.schemas import (
    ExchangeRequest,
    RecentPhoneContact,
    TransferByAccountCheckResponse,
    TransferByAccountRequest,
    TransferByCardCheckResponse,
    TransferByCardRequest,
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


_CURRENCY_LOCK_KEY: dict[Currency, int] = {
    Currency.RUB: 1,
    Currency.USD: 2,
    Currency.EUR: 3,
    Currency.CNY: 4,
}


def _lock_daily_limit_bucket(db: Session, user_id: int, currency: Currency) -> None:
    """Advisory-лок Postgres на (user_id, currency) на время текущей транзакции.

    Без него конкурентные переводы с РАЗНЫХ своих счетов в одной валюте не блокируют
    друг друга через FOR UPDATE на счетах и могут оба посчитать "потрачено сегодня"
    до того, как любой из них закоммитится — суммарно превысив суточный лимит.
    Лок снимается автоматически при commit/rollback."""
    db.execute(
        text("SELECT pg_advisory_xact_lock(:uid, :cur)"),
        {"uid": user_id, "cur": _CURRENCY_LOCK_KEY[currency]},
    )


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
    if source.user_id != current_user.id or target.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="forbidden_account_access")
    if source.account_type == AccountType.SAVINGS:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_from_savings")
    if source.account_type == AccountType.BROKER:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_for_brokerage")
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

    source_id = db.scalar(
        select(Account.id).where(Account.id == payload.from_account_id, Account.user_id == current_user.id)
    )
    if not source_id:
        raise HTTPException(status_code=404, detail="account_not_found")

    target_id = db.scalar(select(Account.id).where(Account.account_number == payload.target_account_number))
    if not target_id:
        raise HTTPException(status_code=404, detail="account_not_found")

    # Оба счёта — одним запросом, в отсортированном по id порядке: чтобы
    # встречный перевод через любой другой transfer-эндпоинт не захватывал
    # блокировки в обратном порядке (deadlock).
    account_ids = sorted([source_id, target_id])
    locked = db.scalars(select(Account).where(Account.id.in_(account_ids)).with_for_update()).all()
    by_id = {acc.id: acc for acc in locked}
    source = by_id.get(source_id)
    target = by_id.get(target_id)
    if not source or not target:
        raise HTTPException(status_code=404, detail="account_not_found")

    if not source.is_active or not target.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    if source.account_type == AccountType.SAVINGS:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_from_savings")
    if source.account_type == AccountType.BROKER:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_for_brokerage")
    if source.id == target.id:
        raise HTTPException(status_code=400, detail="transfer_same_account")
    if source.currency != target.currency:
        raise HTTPException(status_code=400, detail="currency_mismatch")
    if source.balance < payload.amount:
        raise HTTPException(status_code=400, detail="insufficient_funds")

    # Проверка суточного лимита по валюте счёта списания
    _lock_daily_limit_bucket(db, current_user.id, source.currency)
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
    target = db.scalar(
        select(Account).where(
            Account.account_number == target_account_number,
            Account.is_active.is_(True),
        )
    )
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
    if source.account_type == AccountType.BROKER:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_for_brokerage")

    fee = (payload.amount * EXTERNAL_TRANSFER_FEE_RATE).quantize(Decimal("0.01"))
    total_debit = payload.amount + fee

    if source.balance < total_debit:
        raise HTTPException(status_code=400, detail="insufficient_funds")

    _lock_daily_limit_bucket(db, current_user.id, source.currency)
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
    phone: str = Query(
        ...,
        description="Телефон получателя в формате +7XXXXXXXXXX (только цифры принимаются тоже).",
        example="+79991234567",
    ),
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Проверка получателя по номеру:
    - Если найден в нашем банке — возвращаем ShlapaBank + его 0-5 доп. банков, подсказку-имя, основной банк.
    - Иначе — все внешние банки, без подсказки.
    """
    normalized = normalize_phone(phone)
    if not normalized:
        return TransferByPhoneCheckResponse(
            inOurBank=False, availableBanks=_external_banks_list()
        )
    recipient = db.scalar(select(User).where(User.phone == normalized))
    if recipient:
        our_bank = next((b for b in BANKS_CATALOG if b[0] == OUR_BANK_CODE), None)
        options = [{"id": our_bank[0], "label": our_bank[1]}] if our_bank else []
        user_banks = db.scalars(
            select(Bank).join(UserBank, UserBank.bank_code == Bank.code).where(UserBank.user_id == recipient.id)
        ).all()
        for b in user_banks:
            options.append({"id": b.code, "label": b.label})
        # Имя-подсказка: первая буква имени + фамилия целиком (Иван П.)
        hint_parts: list[str] = []
        if recipient.first_name:
            hint_parts.append(recipient.first_name)
        if recipient.last_name:
            hint_parts.append(f"{recipient.last_name[:1]}.")
        if not hint_parts:
            hint_parts.append(recipient.login)
        return TransferByPhoneCheckResponse(
            inOurBank=True,
            availableBanks=options,
            recipientHint=" ".join(hint_parts),
            primaryBankId=recipient.sbp_primary_bank,
        )
    return TransferByPhoneCheckResponse(
        inOurBank=False, availableBanks=_external_banks_list()
    )


@router.get(
    "/recent-phones",
    response_model=list[RecentPhoneContact],
    summary="Часто используемые получатели (top-3, порог 2+ переводов)",
)
def recent_phone_contacts(
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Top-3 получателей по числу переводов. Показываем только тех, кому переведено 2+ раза."""
    contacts = db.scalars(
        select(TransferContact)
        .where(TransferContact.user_id == current_user.id, TransferContact.transfers_count >= 2)
        .order_by(TransferContact.transfers_count.desc(), TransferContact.last_transfer_at.desc())
        .limit(3)
    ).all()
    return contacts


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

    # Источник: либо карта (тогда счёт — её account_id), либо явно счёт.
    source_account_id = payload.from_account_id
    source_card_id: int | None = None
    if payload.from_card_id:
        card = db.scalar(select(Card).where(Card.id == payload.from_card_id))
        if not card:
            raise HTTPException(status_code=404, detail="card_not_found")
        if card.status != CardStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="card_not_active")
        source_account_id = card.account_id
        source_card_id = card.id
    if not source_account_id:
        raise HTTPException(status_code=400, detail="source_required")

    # Не блокируем счета здесь: сначала читаем без лока, чтобы узнать оба id
    # (свой и получателя) и затем взять FOR UPDATE в едином порядке (по id) —
    # иначе конкурентные встречные переводы source<->target из разных
    # эндпоинтов рискуют захватывать блокировки в разном порядке (deadlock).
    source_check = db.scalar(
        select(Account).where(Account.id == source_account_id, Account.user_id == current_user.id)
    )
    if not source_check:
        raise HTTPException(status_code=404, detail="account_not_found")
    if not source_check.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    if source_check.account_type == AccountType.SAVINGS:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_from_savings")
    if source_check.account_type == AccountType.BROKER:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_for_brokerage")

    _lock_daily_limit_bucket(db, current_user.id, source_check.currency)
    used_per_currency = _calc_today_transfers_per_currency(current_user, db)
    _check_daily_limit(used_per_currency, source_check.currency, amount)

    if payload.recipient_bank_id == OUR_BANK_CODE:
        normalized_phone = normalize_phone(payload.phone) or payload.phone
        recipient = db.scalar(select(User).where(User.phone == normalized_phone))
        if not recipient:
            raise HTTPException(status_code=404, detail="recipient_not_found_in_our_bank")
        target_check = db.scalar(
            select(Account).where(
                Account.user_id == recipient.id,
                Account.currency == source_check.currency,
                Account.account_type == AccountType.DEBIT,
                Account.is_active.is_(True),
            )
        )
        if not target_check:
            raise HTTPException(status_code=400, detail="recipient_has_no_suitable_account")
        if source_check.id == target_check.id:
            raise HTTPException(status_code=400, detail="transfer_same_account")

        account_ids = sorted([source_check.id, target_check.id])
        locked = db.scalars(select(Account).where(Account.id.in_(account_ids)).with_for_update()).all()
        by_id = {acc.id: acc for acc in locked}
        source = by_id[source_check.id]
        target = by_id[target_check.id]

        if not source.is_active:
            raise HTTPException(status_code=400, detail="account_inactive")
        if source.balance < amount:
            raise HTTPException(status_code=400, detail="insufficient_funds")
        source.balance -= amount
        target.balance += amount
        masked = _mask_account(target.account_number)
        comment_suffix = f":comment_{payload.comment}" if payload.comment else ""
        tx = Transaction(
            from_account_id=source.id,
            to_account_id=target.id,
            card_id=source_card_id,
            type=TransactionType.TRANSFER,
            amount=amount,
            currency=source.currency,
            status=TransactionStatus.COMPLETED,
            initiated_by=current_user.id,
            description=f"p2p_transfer_by_phone:{source.currency.value}:{masked}{comment_suffix}",
            fee=Decimal("0"),
        )
        db.add(source)
        db.add(target)
        db.add(tx)
        _bump_phone_contact(db, current_user.id, normalized_phone, recipient)
        db.commit()
        db.refresh(tx)
        return tx

    # Перевод в другой банк: комиссия 2%, списание amount + fee.
    # Только один свой счёт участвует — блокируем его напрямую.
    source = db.scalar(
        select(Account).where(Account.id == source_check.id).with_for_update()
    )
    if not source.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    # BF-1 (bugs): фактическая ставка 2.5% вместо показанных на фронте 2%.
    _phone_fee_rate = Decimal("0.025") if bugs.on() else EXTERNAL_PHONE_FEE_RATE
    fee = (amount * _phone_fee_rate).quantize(Decimal("0.01"))
    total_debit = amount + fee
    # BE-2 (bugs): проверка баланса без учёта комиссии → возможен овердрафт.
    _balance_check = amount if bugs.on() else total_debit
    if source.balance < _balance_check:
        raise HTTPException(status_code=400, detail="insufficient_funds")
    source.balance -= total_debit
    comment_suffix = f":comment_{payload.comment}" if payload.comment else ""
    tx = Transaction(
        from_account_id=source.id,
        to_account_id=None,
        card_id=source_card_id,
        type=TransactionType.TRANSFER,
        amount=amount,
        currency=source.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description=f"p2p_by_phone_external:{payload.recipient_bank_id}:{payload.phone}:fee_{fee}{comment_suffix}",
        fee=fee,
    )
    db.add(source)
    db.add(tx)
    _bump_phone_contact(db, current_user.id, payload.phone, None)
    db.commit()
    db.refresh(tx)
    return tx


def _bump_phone_contact(db: Session, user_id: int, phone: str, recipient: User | None) -> None:
    """Инкрементирует счётчик TransferContact или создаёт новую запись."""
    contact = db.scalar(
        select(TransferContact).where(
            TransferContact.user_id == user_id, TransferContact.phone == phone
        )
    )
    display = (
        f"{recipient.first_name or ''} {recipient.last_name or ''}".strip() or (recipient.login if recipient else phone)
    ) if recipient else phone
    now = datetime.utcnow()
    if contact:
        contact.transfers_count += 1
        contact.last_transfer_at = now
        contact.display_name = display
    else:
        contact = TransferContact(
            user_id=user_id,
            phone=phone,
            display_name=display,
            transfers_count=1,
            last_transfer_at=now,
        )
    db.add(contact)


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
    if source.user_id != current_user.id or target.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="forbidden_account_access")
    if not source.is_active or not target.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    if source.account_type == AccountType.SAVINGS:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_from_savings")
    if source.account_type == AccountType.BROKER:
        raise HTTPException(status_code=400, detail="transfer_not_allowed_for_brokerage")
    if source.currency == target.currency:
        raise HTTPException(status_code=400, detail="currency_mismatch")

    source_rate = RATES_TO_RUB.get(source.currency)
    target_rate = RATES_TO_RUB.get(target.currency)
    if source_rate is None or target_rate is None:
        raise HTTPException(status_code=400, detail="currency_not_supported_for_exchange")

    if source.balance < payload.amount:
        raise HTTPException(status_code=400, detail="insufficient_funds")

    # Обмен учитывается в суточном лимите по валюте счёта списания
    _lock_daily_limit_bucket(db, current_user.id, source.currency)
    used_per_currency = _calc_today_transfers_per_currency(current_user, db)
    _check_daily_limit(used_per_currency, source.currency, payload.amount)

    rub_equivalent = payload.amount * source_rate
    target_amount = (rub_equivalent / target_rate).quantize(Decimal("0.01"))

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


# ================================================================
# Переводы по номеру карты
# ================================================================


EXTERNAL_CARD_FEE_RATE = Decimal("0.015")  # 1.5% для внешних карт


def _luhn_valid(number: str) -> bool:
    """Классическая проверка Luhn — используем для базовой валидации карт."""
    digits = [int(d) for d in number if d.isdigit()]
    if len(digits) < 12:
        return False
    checksum = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


@router.get(
    "/by-card/check",
    response_model=TransferByCardCheckResponse,
    summary="Проверить карту получателя по номеру",
)
def by_card_check(
    number: str = Query(
        ...,
        description="Полный номер карты получателя (16 цифр, можно с пробелами).",
        example="2200400012345678",
    ),
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    clean = "".join(c for c in number if c.isdigit())
    if len(clean) < 16 or len(clean) > 19:
        raise HTTPException(status_code=400, detail="invalid_card_length")
    # Luhn — рекомендательная проверка (для учебного проекта не блокируем)
    masked = f"•• {clean[-4:]}"
    card = db.scalar(select(Card).where(Card.number == clean))
    if not card:
        # Не наша карта — считаем как внешнюю
        return TransferByCardCheckResponse(
            found=True, in_our_bank=False, masked=masked
        )
    account = db.scalar(select(Account).where(Account.id == card.account_id))
    if not account or not account.is_active:
        raise HTTPException(status_code=400, detail="recipient_account_inactive")
    owner = db.scalar(select(User).where(User.id == account.user_id))
    holder_hint = None
    if owner:
        first = (owner.first_name or "").strip()
        last = (owner.last_name or "").strip()
        holder_hint = f"{first} {last[:1] + '.' if last else ''}".strip() or owner.login
    is_own = account.user_id == current_user.id
    is_blocked = card.status != CardStatus.ACTIVE
    return TransferByCardCheckResponse(
        found=True,
        in_our_bank=True,
        masked=masked,
        holder_hint=holder_hint,
        currency=account.currency.value,
        is_own=is_own,
        is_blocked=is_blocked,
    )


@router.post(
    "/by-card",
    response_model=TransactionPublic,
    status_code=201,
    summary="Перевод с карты на карту (по номеру)",
)
def create_transfer_by_card(
    payload: TransferByCardRequest,
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

    clean = "".join(c for c in payload.to_card_number if c.isdigit())
    if len(clean) < 16 or len(clean) > 19:
        raise HTTPException(status_code=400, detail="invalid_card_length")

    # Карта-источник
    src_card = db.scalar(select(Card).where(Card.id == payload.from_card_id))
    if not src_card:
        raise HTTPException(status_code=404, detail="card_not_found")
    # Без лока: только чтобы узнать id счёта и провалидировать владение/статус.
    src_account_check = db.scalar(
        select(Account).where(Account.id == src_card.account_id, Account.user_id == current_user.id)
    )
    if not src_account_check:
        raise HTTPException(status_code=404, detail="account_not_found")
    if not src_account_check.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    if src_card.status != CardStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="card_not_active")

    _lock_daily_limit_bucket(db, current_user.id, src_account_check.currency)
    used_per_currency = _calc_today_transfers_per_currency(current_user, db)
    _check_daily_limit(used_per_currency, src_account_check.currency, amount)

    comment_suffix = f":comment_{payload.comment}" if payload.comment else ""

    # Проверяем, наша ли карта получатель
    dst_card = db.scalar(select(Card).where(Card.number == clean))
    if dst_card:
        dst_account_check = db.scalar(select(Account).where(Account.id == dst_card.account_id))
        if not dst_account_check or not dst_account_check.is_active:
            raise HTTPException(status_code=400, detail="recipient_account_inactive")
        if dst_card.status != CardStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="recipient_card_not_active")
        if dst_account_check.id == src_account_check.id:
            raise HTTPException(status_code=400, detail="transfer_same_account")
        if dst_account_check.currency != src_account_check.currency:
            raise HTTPException(status_code=400, detail="currency_mismatch")

        # Оба счёта блокируем одним запросом в отсортированном порядке id —
        # чтобы не деднуться со встречным переводом, идущим в обратную сторону.
        account_ids = sorted([src_account_check.id, dst_account_check.id])
        locked = db.scalars(select(Account).where(Account.id.in_(account_ids)).with_for_update()).all()
        by_id = {acc.id: acc for acc in locked}
        src_account = by_id[src_account_check.id]
        dst_account = by_id[dst_account_check.id]

        if not src_account.is_active or not dst_account.is_active:
            raise HTTPException(status_code=400, detail="recipient_account_inactive")
        if src_account.balance < amount:
            raise HTTPException(status_code=400, detail="insufficient_funds")

        src_account.balance -= amount
        dst_account.balance += amount
        tx = Transaction(
            from_account_id=src_account.id,
            to_account_id=dst_account.id,
            card_id=src_card.id,
            type=TransactionType.TRANSFER,
            amount=amount,
            currency=src_account.currency,
            status=TransactionStatus.COMPLETED,
            initiated_by=current_user.id,
            description=f"card_to_card:{src_account.currency.value}:•• {clean[-4:]}{comment_suffix}",
            fee=Decimal("0"),
        )
        db.add(src_account)
        db.add(dst_account)
        db.add(tx)
        db.commit()
        db.refresh(tx)
        return tx

    # Внешняя карта — списание amount + fee, без реального target-account.
    # Только один свой счёт участвует — блокируем его напрямую.
    src_account = db.scalar(
        select(Account).where(Account.id == src_account_check.id).with_for_update()
    )
    if not src_account.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")
    fee = (amount * EXTERNAL_CARD_FEE_RATE).quantize(Decimal("0.01"))
    total_debit = amount + fee
    if src_account.balance < total_debit:
        raise HTTPException(status_code=400, detail="insufficient_funds")
    src_account.balance -= total_debit
    tx = Transaction(
        from_account_id=src_account.id,
        to_account_id=None,
        card_id=src_card.id,
        type=TransactionType.TRANSFER,
        amount=amount,
        currency=src_account.currency,
        status=TransactionStatus.COMPLETED,
        initiated_by=current_user.id,
        description=f"external_card:{src_account.currency.value}:•• {clean[-4:]}:fee_{fee}{comment_suffix}",
        fee=fee,
    )
    db.add(src_account)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx
