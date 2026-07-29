"""Карты (Cards) — привязаны к счетам."""

import random
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_own_account
from app.models import (
    Account,
    Card,
    CardDesign,
    CardLimit,
    CardPaymentSystem,
    CardStatus,
    CardType,
    Currency,
    User,
)
from pydantic import BaseModel, ConfigDict, Field

from app.schemas import (
    ActionResponse,
    CardCreateRequest,
    CardLimitEntry,
    CardLimitsPayload,
    CardPublic,
    CardUpdateRequest,
)
from app.security import require_active_user

router = APIRouter(prefix="/api/v1/cards", tags=["cards"])

# Ограничение на количество активных карт на один счёт (учебный проект)
MAX_CARDS_PER_ACCOUNT = 5


def _generate_card_number(payment_system: CardPaymentSystem) -> str:
    """Генерирует 16-значный номер карты с BIN'ом под платёжную систему.

    Учебный проект — префиксы условные, не совпадают с реальными BIN.
    """
    prefixes = {
        CardPaymentSystem.VISA: "4000",
        CardPaymentSystem.MIR: "2200",
        CardPaymentSystem.MASTERCARD: "5100",
    }
    prefix = prefixes.get(payment_system, "9999")
    suffix = "".join(random.choices("0123456789", k=16 - len(prefix)))
    return f"{prefix}{suffix}"


def _default_holder_name(user: User) -> str:
    """Имя держателя латиницей — как на реальной карте. Если нет имени/фамилии — CARD HOLDER."""
    first = (user.first_name or "").strip()
    last = (user.last_name or "").strip()
    if first and last:
        return f"{first} {last}".upper()
    if user.login:
        return f"{user.login}".upper()
    return "CARD HOLDER"


def _default_payment_system(currency: Currency) -> CardPaymentSystem:
    """RUB → MIR, всё остальное → VISA."""
    return CardPaymentSystem.MIR if currency == Currency.RUB else CardPaymentSystem.VISA


def issue_card_for_account(
    account: Account,
    user: User,
    db: Session,
    card_type: CardType = CardType.DEBIT,
    payment_system: CardPaymentSystem | None = None,
    design: CardDesign = CardDesign.CLASSIC,
) -> Card:
    """Выпустить карту к счёту. Используется и из API, и из автосидирования."""
    if payment_system is None:
        payment_system = _default_payment_system(account.currency)
    now = datetime.utcnow()
    for _ in range(10):
        number = _generate_card_number(payment_system)
        exists = db.scalar(select(Card).where(Card.number == number))
        if exists:
            continue
        card = Card(
            account_id=account.id,
            number=number,
            last4=number[-4:],
            holder_name=_default_holder_name(user),
            expiry_month=now.month,
            expiry_year=now.year + 4,
            card_type=card_type,
            payment_system=payment_system,
            status=CardStatus.ACTIVE,
            design=design,
            is_contactless=True,
        )
        db.add(card)
        db.flush()
        return card
    raise HTTPException(status_code=500, detail="card_number_generation_failed")


@router.get(
    "/{card_id}",
    response_model=CardPublic,
    summary="Получить одну свою карту по id",
    description="Возвращает детали одной карты. Доступно только владельцу привязанного счёта.",
)
def get_card(
    card_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    return _get_own_card(card_id, current_user, db)


@router.get("", response_model=list[CardPublic], summary="Получить все карты пользователя")
def list_all_cards(
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    account_ids = db.scalars(
        select(Account.id).where(Account.user_id == current_user.id, Account.is_active.is_(True))
    ).all()
    if not account_ids:
        return []
    return db.scalars(
        select(Card).where(Card.account_id.in_(account_ids)).order_by(Card.created_at.desc())
    ).all()


@router.get(
    "/by-account/{account_id}",
    response_model=list[CardPublic],
    summary="Получить карты конкретного счёта",
)
def list_cards_for_account(
    account_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    account = get_own_account(account_id, current_user, db)
    return db.scalars(
        select(Card).where(Card.account_id == account.id).order_by(Card.created_at.desc())
    ).all()


@router.post(
    "",
    response_model=CardPublic,
    status_code=201,
    summary="Выпустить новую карту к своему счёту",
    description=(
        "Выпуск карты. Обязательное поле — `account_id` (карта привязывается к нему).\n\n"
        "**Логика подстановки платёжной системы:**\n"
        "- Если `payment_system` не указан — подбирается автоматически по валюте счёта:\n"
        "  RUB → MIR, USD/EUR/CNY → VISA.\n\n"
        "**Типы карт:**\n"
        "- `REGULAR` — обычная, поддерживает дизайны CLASSIC/EMERALD/GRAPHITE.\n"
        "- `GOLD` — премиум, поддерживает дизайны SUNSET/ROSE/GOLD_BAR/GOLD_MARBLE.\n\n"
        "**Ограничения:**\n"
        "- Максимум 5 активных карт на один счёт.\n"
        "- Счёт должен быть активным.\n"
        "- `accept_terms=true` обязательно.\n\n"
        "Карту нельзя перенести на другой счёт — она привязана к тому, к которому выпущена."
    ),
)
def issue_card(
    payload: CardCreateRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    if not payload.accept_terms:
        raise HTTPException(status_code=400, detail="terms_not_accepted")

    account = get_own_account(payload.account_id, current_user, db)
    if not account.is_active:
        raise HTTPException(status_code=400, detail="account_closed")

    all_active = db.scalars(
        select(Card).where(Card.account_id == account.id, Card.status != CardStatus.EXPIRED)
    ).all()
    if len(all_active) >= MAX_CARDS_PER_ACCOUNT:
        raise HTTPException(status_code=400, detail="card_limit_exceeded")

    card = issue_card_for_account(
        account=account,
        user=current_user,
        db=db,
        card_type=payload.card_type,
        payment_system=payload.payment_system,
        design=payload.design,
    )
    db.commit()
    db.refresh(card)
    return card


@router.patch(
    "/{card_id}",
    response_model=CardPublic,
    summary="Изменить карту: статус (блок/разблок) и/или дизайн",
    description=(
        "Частичное обновление карты. Оба поля опциональные — присылайте только те, что меняете.\n\n"
        "**Примеры:**\n"
        "- Заблокировать карту: `{\"status\":\"BLOCKED\"}`\n"
        "- Разблокировать карту: `{\"status\":\"ACTIVE\"}`\n"
        "- Сменить дизайн: `{\"design\":\"GOLD_BAR\"}`\n"
        "- Одновременно: `{\"status\":\"BLOCKED\",\"design\":\"CLASSIC\"}`\n\n"
        "**Ограничения:**\n"
        "- Нельзя вручную ставить `EXPIRED`.\n"
        "- Дизайн должен подходить типу: Regular → CLASSIC/EMERALD/GRAPHITE; Gold → SUNSET/ROSE/GOLD_BAR/GOLD_MARBLE."
    ),
)
def update_card_status(
    card_id: int,
    payload: CardUpdateRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    card = _get_own_card(card_id, current_user, db)
    if card.status == CardStatus.EXPIRED:
        raise HTTPException(status_code=400, detail="card_expired")
    if payload.status is not None:
        if payload.status == CardStatus.EXPIRED:
            raise HTTPException(status_code=400, detail="cannot_set_expired_manually")
        card.status = payload.status
    if payload.design is not None:
        card.design = payload.design
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


class CardReissueRequest(BaseModel):
    """Причина перевыпуска. Влияет только на историю операции — поведение одинаковое."""

    model_config = ConfigDict(json_schema_extra={"example": {"reason": "damaged"}})

    reason: str = Field(default="other", max_length=30)


@router.post(
    "/{card_id}/reissue",
    response_model=CardPublic,
    status_code=201,
    summary="Перевыпустить карту",
    description=(
        "Атомарно: удаляет старую карту и создаёт **новую** с:\n"
        "- тем же типом (REGULAR/GOLD) и дизайном,\n"
        "- тем же счётом,\n"
        "- **новым** номером, CVV и датой (сегодняшняя),\n"
        "- новым сроком действия (текущий месяц + 4 года).\n\n"
        "Причина сохраняется только для истории. Старая карта удаляется полностью — если по ней "
        "были транзакции, их `card_id` обнулится."
    ),
)
def reissue_card(
    card_id: int,
    payload: CardReissueRequest,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    old = _get_own_card(card_id, current_user, db)
    if old.status == CardStatus.EXPIRED:
        # У истёкшей карты не блокируем перевыпуск — наоборот его основная цель
        pass

    account = db.scalar(select(Account).where(Account.id == old.account_id))
    if not account or not account.is_active:
        raise HTTPException(status_code=400, detail="account_inactive")

    old_type = old.card_type
    old_design = old.design
    old_payment_system = old.payment_system

    # Обнуляем card_id у транзакций старой карты, потом удаляем
    from app.models import Transaction

    db.query(Transaction).filter(Transaction.card_id == old.id).update({Transaction.card_id: None})
    db.delete(old)
    db.flush()

    # Выпускаем новую с теми же параметрами
    new_card = issue_card_for_account(
        account=account,
        user=current_user,
        db=db,
        card_type=old_type,
        payment_system=old_payment_system,
        design=old_design,
    )
    db.commit()
    db.refresh(new_card)
    return new_card


@router.delete(
    "/{card_id}",
    response_model=ActionResponse,
    summary="Закрыть карту",
)
def close_card(
    card_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    card = _get_own_card(card_id, current_user, db)
    db.delete(card)
    db.commit()
    return ActionResponse(detail="card_closed")


class CardRevealResponse(BaseModel):
    """Полные реквизиты карты: номер + CVV. Учебный проект — CVV генерируется
    детерминированно из id карты, чтобы не хранить его в БД."""

    number: str
    cvv: str
    holder_name: str
    expiry_month: int
    expiry_year: int


def _generate_cvv(card_id: int) -> str:
    """Псевдо-случайный CVV: остаток от простого хеша card_id, 3 цифры."""
    seed = (card_id * 2654435761) & 0xFFFFFFFF
    return f"{seed % 1000:03d}"


def _format_pan(number: str) -> str:
    """Красивое форматирование PAN: 4 группы по 4 цифры."""
    n = number.strip()
    return " ".join(n[i : i + 4] for i in range(0, len(n), 4))


@router.get(
    "/{card_id}/reveal",
    response_model=CardRevealResponse,
    summary="Показать полные реквизиты карты (номер, CVV, срок)",
    description=(
        "**Учебный проект:** CVV генерируется детерминированно из id карты — то есть каждый "
        "раз получите один и тот же код. В реальном банке CVV хранится в HSM/зашифрованный и "
        "раскрывается только по особому запросу с многофакторным подтверждением.\n\n"
        "Этот эндпоинт удобен для тестирования оплат: показал карту → скопировал номер/CVV → "
        "использовал в тестовом магазине."
    ),
)
def reveal_card(
    card_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    card = _get_own_card(card_id, current_user, db)
    return CardRevealResponse(
        number=_format_pan(card.number),
        cvv=_generate_cvv(card.id),
        holder_name=card.holder_name,
        expiry_month=card.expiry_month,
        expiry_year=card.expiry_year,
    )


def _get_own_card(card_id: int, current_user: User, db: Session) -> Card:
    """Найти карту пользователя (через счёт) или 404."""
    card = db.scalar(select(Card).where(Card.id == card_id))
    if not card:
        raise HTTPException(status_code=404, detail="card_not_found")
    account = db.scalar(select(Account).where(Account.id == card.account_id))
    if not account or account.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="card_not_found")
    return card


# =========================================================================
# Пользовательские лимиты по карте
# =========================================================================


def _limits_to_payload(limit: CardLimit) -> CardLimitsPayload:
    """ORM-запись → API-формат (сгруппированные пары enabled/amount)."""
    return CardLimitsPayload(
        monthly=CardLimitEntry(enabled=limit.monthly_enabled, amount=limit.monthly_amount),
        daily=CardLimitEntry(enabled=limit.daily_enabled, amount=limit.daily_amount),
        online=CardLimitEntry(enabled=limit.online_enabled, amount=limit.online_amount),
        atm=CardLimitEntry(enabled=limit.atm_enabled, amount=limit.atm_amount),
        contactless=CardLimitEntry(enabled=limit.contactless_enabled, amount=limit.contactless_amount),
        abroad=CardLimitEntry(enabled=limit.abroad_enabled, amount=limit.abroad_amount),
        online_purchases=CardLimitEntry(
            enabled=limit.online_purchases_enabled, amount=limit.online_purchases_amount
        ),
    )


def _get_or_create_limits(card: Card, db: Session) -> CardLimit:
    """Возвращает запись лимитов карты, создавая с дефолтами при первом обращении."""
    limit = db.scalar(select(CardLimit).where(CardLimit.card_id == card.id))
    if limit:
        return limit
    limit = CardLimit(card_id=card.id)
    db.add(limit)
    db.commit()
    db.refresh(limit)
    return limit


@router.get(
    "/{card_id}/limits",
    response_model=CardLimitsPayload,
    summary="Получить лимиты карты",
    description=(
        "Возвращает текущие лимиты по 7 категориям (месяц/день/онлайн/банкомат/бесконтакт/за границей/онлайн-покупки). "
        "Если ещё не настраивались — вернутся значения по умолчанию."
    ),
)
def get_card_limits(
    card_id: int,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    card = _get_own_card(card_id, current_user, db)
    limit = _get_or_create_limits(card, db)
    return _limits_to_payload(limit)


@router.put(
    "/{card_id}/limits",
    response_model=CardLimitsPayload,
    summary="Обновить лимиты карты",
    description=(
        "Полностью заменяет набор лимитов. Клиент должен прислать все 7 пар (enabled + amount). "
        "Значения хранятся в валюте счёта карты."
    ),
)
def update_card_limits(
    card_id: int,
    payload: CardLimitsPayload,
    current_user: User = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    card = _get_own_card(card_id, current_user, db)
    limit = _get_or_create_limits(card, db)

    limit.monthly_enabled = payload.monthly.enabled
    limit.monthly_amount = payload.monthly.amount
    limit.daily_enabled = payload.daily.enabled
    limit.daily_amount = payload.daily.amount
    limit.online_enabled = payload.online.enabled
    limit.online_amount = payload.online.amount
    limit.atm_enabled = payload.atm.enabled
    limit.atm_amount = payload.atm.amount
    limit.contactless_enabled = payload.contactless.enabled
    limit.contactless_amount = payload.contactless.amount
    limit.abroad_enabled = payload.abroad.enabled
    limit.abroad_amount = payload.abroad.amount
    limit.online_purchases_enabled = payload.online_purchases.enabled
    limit.online_purchases_amount = payload.online_purchases.amount

    db.add(limit)
    db.commit()
    db.refresh(limit)
    return _limits_to_payload(limit)
