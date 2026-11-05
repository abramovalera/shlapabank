"""Переводы, платежи и пополнение. Жизненный цикл операции:

создание (все проверки, ошибка = 4xx, операция не создаётся)
  → без кода: сразу проведение → DONE / DECLINED
  → с кодом: WAITING_CODE → подтверждение кодом → повторные проверки → DONE / DECLINED
                          → отмена → CANCELLED; 3 неверных кода → DECLINED
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import clock, rules, sms
from app.db import get_db
from app.errors import MESSAGES, ApiError
from app.models import (
    Account, Card, ExternalCard, ExternalRecipient, MobileOperator, Operation, Provider, User,
)
from app.routes.accounts import own_open_account
from app.schemas import (
    AccountRef, CardTransferIn, CodeInfo, ConfirmIn, Counterparty, DeclineReason, MobileIn, OperationOut,
    OperationsPage, OwnTransferIn, PhoneTransferIn, RecipientOut, TopupIn, UtilityIn,
)
from app.security import current_user

router = APIRouter(tags=["Операции"])

TYPES = ("OWN_TRANSFER", "PHONE_TRANSFER", "CARD_TRANSFER", "INCOMING_TRANSFER", "MOBILE", "UTILITY", "TOPUP")
STATUSES = ("WAITING_CODE", "DONE", "DECLINED", "CANCELLED")


# ---------- получатели ----------

@dataclass
class Target:
    name: str
    bank_name: str
    own_bank: bool
    tariff_key: str
    user: User | None = None
    account: Account | None = None
    phone: str | None = None
    card_masked: str | None = None
    card_id: int | None = None  # карта ShlapaBank получателя


def receiving_account(db: Session, user: User) -> Account | None:
    """Куда зачислять клиенту ShlapaBank: счёт карты, иначе самый старый открытый."""
    card = db.scalar(select(Card).where(Card.user_id == user.id))
    if card:
        acc = db.get(Account, card.account_id)
        if acc and acc.is_open:
            return acc
    return db.scalar(select(Account).where(Account.user_id == user.id, Account.is_open.is_(True)).order_by(Account.id))


def resolve_phone(db: Session, user: User, phone: str) -> Target:
    if phone == user.phone:
        raise ApiError(400, "self_transfer", field="phone")
    client = db.scalar(select(User).where(User.phone == phone))
    if client:
        if client.status == "BLOCKED":
            raise ApiError(400, "recipient_blocked", field="phone")
        account = receiving_account(db, client)
        if not account:
            raise ApiError(400, "recipient_no_account", field="phone")
        return Target(rules.short_name(client.first_name, client.last_name), rules.OWN_BANK, True, "PHONE_OWN_BANK",
                      user=client, account=account, phone=phone)
    ext = db.get(ExternalRecipient, phone)
    if ext:
        if ext.status == "BLOCKED":
            raise ApiError(400, "recipient_blocked", field="phone")
        return Target(rules.full_name_short(ext.name), ext.bank_name, False, "PHONE_OTHER_BANK", phone=phone)
    raise ApiError(404, "recipient_not_found", field="phone")


def check_card_number(number: str, field: str = "card_number") -> None:
    if not rules.luhn_ok(number):
        raise ApiError(422, "invalid_card_number", field=field)


def resolve_card(db: Session, user: User, number: str) -> Target:
    check_card_number(number)
    card = db.scalar(select(Card).where(Card.number == number))
    if card:
        owner = db.get(User, card.user_id)
        if owner.id == user.id:
            raise ApiError(400, "self_transfer", field="card_number")
        if card.status == "BLOCKED":
            raise ApiError(400, "card_blocked", field="card_number")
        if owner.status == "BLOCKED":
            raise ApiError(400, "recipient_blocked", field="card_number")
        return Target(rules.short_name(owner.first_name, owner.last_name), rules.OWN_BANK, True, "CARD_OWN_BANK",
                      user=owner, account=db.get(Account, card.account_id), card_masked=rules.short_card(number),
                      card_id=card.id)
    ext = db.get(ExternalCard, number)
    if not ext or ext.purpose != "TRANSFER":
        raise ApiError(404, "card_not_found", field="card_number")
    if ext.status == "BLOCKED":
        raise ApiError(400, "card_blocked", field="card_number")
    if ext.status == "EXPIRED":
        raise ApiError(400, "card_expired", field="card_number")
    return Target(rules.full_name_short(ext.holder_name), ext.bank_name, False, "CARD_OTHER_BANK",
                  card_masked=rules.short_card(number))


def recipient_out(db: Session, target: Target) -> RecipientOut:
    t = rules.tariff(db, target.tariff_key)
    return RecipientOut(name=target.name, bank_name=target.bank_name, own_bank=target.own_bank,
                        fee_percent=str(t.fee_percent.normalize()), fee_min=rules.money(t.fee_min))


@router.get("/recipients/phone", response_model=RecipientOut, summary="Найти получателя по телефону")
def recipient_by_phone(phone: str = Query(examples=["9160000021"], description="Телефон в любом виде"), user: User = Depends(current_user),
                       db: Session = Depends(get_db)):
    """Банк получателя определяется по номеру сам."""
    # Телефон в любом виде: «+» в адресе без %2B превращается в пробел — это тоже допустимо.
    return recipient_out(db, resolve_phone(db, user, rules.normalize_phone(phone)))


@router.get("/recipients/card", response_model=RecipientOut, summary="Найти получателя по номеру карты")
def recipient_by_card(number: str = Query(examples=["4276000000002013"], description="16 цифр, можно с пробелами"),
                      user: User = Depends(current_user), db: Session = Depends(get_db)):
    number = number.replace(" ", "")
    if not number:
        raise ApiError(422, "validation_error", "Обязательное поле", field="number")
    if not number.isascii() or not number.isdigit():
        raise ApiError(422, "validation_error", "Только цифры", field="number")
    try:
        return recipient_out(db, resolve_card(db, user, number))
    except ApiError as e:
        # Здесь поле называется number, а не card_number, как в переводе.
        e.field = "number" if e.field == "card_number" else e.field
        raise


# ---------- представление операции ----------

def _account_ref(acc: Account | None) -> AccountRef | None:
    return None if acc is None else AccountRef(id=acc.id, name=acc.name, number_masked=rules.mask_account(acc.number))


def _fmt_phone(phone: str | None) -> str:
    if not phone:
        return ""
    return f"+7 {phone[2:5]} {phone[5:8]}-{phone[8:10]}-{phone[10:12]}"


def _titles(op: Operation, account: Account, to_account: Account | None) -> tuple[str, str]:
    match op.type:
        case "OWN_TRANSFER":
            return "Между своими", f"{account.name} → {to_account.name if to_account else ''}"
        case "PHONE_TRANSFER":
            return op.cp_name, f"Перевод по телефону · {op.cp_bank}"
        case "CARD_TRANSFER":
            return op.cp_name, f"Перевод на карту · {op.cp_bank} · {op.cp_card}"
        case "INCOMING_TRANSFER":
            return op.cp_name, f"Входящий перевод · {op.cp_bank}"
        case "MOBILE":
            return "Мобильная связь", f"{op.cp_operator} · {_fmt_phone(op.cp_phone)}"
        case "UTILITY":
            return op.cp_provider, f"ЖКХ и услуги · лицевой счёт {op.cp_payer_account}"
        case "TOPUP":
            return "Пополнение с карты", f"{op.cp_bank} · {op.cp_card}"
    return op.type, ""


def present(db: Session, op: Operation) -> OperationOut:
    account = db.get(Account, op.account_id)
    to_account = db.get(Account, op.to_account_id) if op.to_account_id else None
    title, subtitle = _titles(op, account, to_account)
    code = None
    if op.status == "WAITING_CODE":
        info = sms.code_info(sms.active_for_operation(db, op.id))
        code = CodeInfo(**info) if info else None
    total = op.amount + op.fee
    return OperationOut(
        id=op.id, number=f"OP-{op.id:06d}", type=op.type, status=op.status, direction=op.direction,
        amount=rules.money(op.amount), fee=rules.money(op.fee), total=rules.money(total),
        title=title or "", subtitle=subtitle,
        account=_account_ref(account), to_account=_account_ref(to_account),
        counterparty=Counterparty(name=op.cp_name, phone=op.cp_phone, bank_name=op.cp_bank, card_masked=op.cp_card,
                                  provider_name=op.cp_provider, payer_account=op.cp_payer_account,
                                  operator_name=op.cp_operator),
        message=op.message,
        decline_reason=DeclineReason(code=op.decline_code, message=op.decline_message) if op.decline_code else None,
        code=code, created_at=sms.iso(op.created_at), completed_at=sms.iso(op.completed_at),
    )


# ---------- проведение ----------

def _decline(op: Operation, code: str, message: str | None = None) -> None:
    op.status = "DECLINED"
    op.decline_code = code
    op.decline_message = message or MESSAGES.get(code, code)
    op.completed_at = clock.now()


def _lock(db: Session, *ids: int) -> dict[int, Account]:
    # Блокируем строки счетов в порядке id, чтобы два встречных перевода не заблокировали друг друга.
    # NO KEY UPDATE: вставка операции со ссылкой на счёт (KEY SHARE) не ждёт и не даёт взаимной блокировки.
    rows = db.scalars(select(Account).where(Account.id.in_(ids)).order_by(Account.id).with_for_update(key_share=True))
    return {a.id: a for a in rows}


def _precheck(db: Session, user: User, account: Account, amount: Decimal, fee: Decimal, op_type: str) -> None:
    """Проверки при создании: ошибка — 4xx, операция не создаётся."""
    if amount + fee > account.balance:
        raise ApiError(400, "insufficient_funds", field="amount")
    if op_type in rules.LIMITED_TYPES:
        error = rules.check_limits(db, user.id, amount + fee)
        if error:
            raise ApiError(400, error, field="amount")


def _recipient_target(db: Session, op: Operation) -> tuple[int | None, str | None]:
    """Куда зачислять клиенту ShlapaBank — определяется заново в момент проведения:
    между созданием и кодом получатель мог закрыть счёт, перепривязать или заблокировать карту.
    Возвращает (id счёта, код причины отказа)."""
    recipient = db.get(User, op.recipient_user_id)
    if recipient.status == "BLOCKED":
        return None, "recipient_blocked"
    if op.recipient_card_id:
        card = db.get(Card, op.recipient_card_id)
        if card is None or card.status == "BLOCKED":
            return None, "card_blocked"
        return card.account_id, None
    account = receiving_account(db, recipient)
    return (account.id, None) if account else (None, "recipient_no_account")


def _execute(db: Session, op: Operation) -> None:
    """Проводит операцию. Повторяет проверки (между созданием и кодом могло всё измениться)."""
    target_id = op.to_account_id
    if op.recipient_user_id:
        target_id, reason = _recipient_target(db, op)
        if reason:
            return _decline(op, reason)
        op.recipient_account_id = target_id
    accounts = _lock(db, *[i for i in (op.account_id, target_id) if i])
    source = accounts[op.account_id]
    total = op.amount + op.fee
    if not source.is_open:
        return _decline(op, "account_not_found")
    if total > source.balance:
        return _decline(op, "insufficient_funds")
    if op.type in rules.LIMITED_TYPES:
        error = rules.check_limits(db, op.user_id, total)
        if error:
            return _decline(op, error)
    target = accounts.get(target_id or 0)
    if op.recipient_user_id and (not target or not target.is_open):
        return _decline(op, "recipient_no_account")
    if op.type == "OWN_TRANSFER" and (not target or not target.is_open):
        return _decline(op, "account_not_found")

    now = clock.now()
    source.balance -= total
    if target:
        target.balance += op.amount
    op.status, op.completed_at = "DONE", now
    if op.recipient_user_id:
        sender = db.get(User, op.user_id)
        incoming = Operation(
            user_id=op.recipient_user_id, account_id=target.id, type="INCOMING_TRANSFER", status="DONE",
            direction="in", amount=op.amount, cp_name=rules.short_name(sender.first_name, sender.last_name),
            cp_phone=sender.phone, cp_bank=rules.OWN_BANK, message=op.message, related_operation_id=op.id,
            created_at=now, completed_at=now,
        )
        db.add(incoming)
        db.flush()
        op.related_operation_id = incoming.id


def _start(db: Session, user: User, op: Operation, needs_code: bool, sms_text: str) -> OperationOut:
    db.add(op)
    db.flush()
    if needs_code:
        op.status = "WAITING_CODE"
        sms.send_operation_code(db, user.id, user.phone, op.id, sms_text)
    else:
        _execute(db, op)
    db.commit()
    return present(db, op)


def _rub(amount: Decimal) -> str:
    """1234567.5 -> «1 234 567,50 ₽» — как в интерфейсе."""
    whole, cents = rules.money(amount).split(".")
    return f"{int(whole):,}".replace(",", " ") + f",{cents} ₽"


# ---------- создание ----------

@router.post("/operations/own-transfer", status_code=201, response_model=OperationOut,
             summary="Перевод между своими счетами")
def own_transfer(body: OwnTransferIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Без кода из SMS и без комиссии, в лимиты не входит."""
    if body.from_account_id == body.to_account_id:
        raise ApiError(400, "same_account", field="to_account_id")
    source = own_open_account(db, user, body.from_account_id, "from_account_id")
    own_open_account(db, user, body.to_account_id, "to_account_id")
    rules.check_amount(rules.tariff(db, "OWN_TRANSFER"), body.amount)
    _precheck(db, user, source, body.amount, Decimal(0), "OWN_TRANSFER")
    op = Operation(user_id=user.id, type="OWN_TRANSFER", status="WAITING_CODE", direction="internal",
                   amount=body.amount, account_id=source.id, to_account_id=body.to_account_id)
    return _start(db, user, op, False, "")


@router.post("/operations/phone-transfer", status_code=201, response_model=OperationOut,
             summary="Перевод по номеру телефона")
def phone_transfer(body: PhoneTransferIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    source = own_open_account(db, user, body.from_account_id, "from_account_id")
    target = resolve_phone(db, user, body.phone)
    t = rules.tariff(db, target.tariff_key)
    rules.check_amount(t, body.amount)
    fee = rules.fee_for(t, body.amount)
    _precheck(db, user, source, body.amount, fee, "PHONE_TRANSFER")
    message = (body.message or "").strip() or None
    op = Operation(user_id=user.id, type="PHONE_TRANSFER", status="WAITING_CODE", direction="out",
                   amount=body.amount, fee=fee, account_id=source.id, cp_name=target.name, cp_phone=body.phone,
                   cp_bank=target.bank_name, message=message,
                   recipient_user_id=target.user.id if target.user else None,
                   recipient_account_id=target.account.id if target.account else None)
    return _start(db, user, op, t.needs_code,
                  f"Перевод {_rub(body.amount)} получателю {target.name}, {target.bank_name}")


@router.post("/operations/card-transfer", status_code=201, response_model=OperationOut,
             summary="Перевод на карту")
def card_transfer(body: CardTransferIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    source = own_open_account(db, user, body.from_account_id, "from_account_id")
    target = resolve_card(db, user, body.card_number)
    t = rules.tariff(db, target.tariff_key)
    rules.check_amount(t, body.amount)
    fee = rules.fee_for(t, body.amount)
    _precheck(db, user, source, body.amount, fee, "CARD_TRANSFER")
    op = Operation(user_id=user.id, type="CARD_TRANSFER", status="WAITING_CODE", direction="out",
                   amount=body.amount, fee=fee, account_id=source.id, cp_name=target.name,
                   cp_bank=target.bank_name, cp_card=target.card_masked,
                   recipient_user_id=target.user.id if target.user else None,
                   recipient_account_id=target.account.id if target.account else None,
                   recipient_card_id=target.card_id)
    return _start(db, user, op, t.needs_code, f"Перевод {_rub(body.amount)} на карту {target.card_masked}")


@router.post("/operations/mobile", status_code=201, response_model=OperationOut, summary="Оплата мобильной связи")
def pay_mobile(body: MobileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Оператор определяется по первым трём цифрам номера после +7."""
    source = own_open_account(db, user, body.from_account_id, "from_account_id")
    operator = db.get(MobileOperator, body.phone[2:5])
    if not operator:
        raise ApiError(404, "operator_not_found", field="phone")
    t = rules.tariff(db, "MOBILE")
    rules.check_amount(t, body.amount)
    _precheck(db, user, source, body.amount, Decimal(0), "MOBILE")
    op = Operation(user_id=user.id, type="MOBILE", status="WAITING_CODE", direction="out", amount=body.amount,
                   account_id=source.id, cp_phone=body.phone, cp_operator=operator.name)
    return _start(db, user, op, t.needs_code, f"Оплата {_rub(body.amount)} за связь {_fmt_phone(body.phone)}")


@router.post("/operations/utility", status_code=201, response_model=OperationOut, summary="Оплата ЖКХ и услуг")
def pay_utility(body: UtilityIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    source = own_open_account(db, user, body.from_account_id, "from_account_id")
    provider = db.get(Provider, body.provider_code)
    if not provider:
        raise ApiError(404, "provider_not_found", field="provider_code")
    if len(body.payer_account) != provider.payer_account_length:
        raise ApiError(422, "invalid_payer_account",
                       f"Лицевой счёт — {provider.payer_account_length} цифр", field="payer_account")
    t = rules.tariff(db, "UTILITY")
    rules.check_amount(t, body.amount)
    _precheck(db, user, source, body.amount, Decimal(0), "UTILITY")
    op = Operation(user_id=user.id, type="UTILITY", status="WAITING_CODE", direction="out", amount=body.amount,
                   account_id=source.id, cp_provider=provider.name, cp_payer_account=body.payer_account)
    return _start(db, user, op, t.needs_code, f"Оплата {_rub(body.amount)}, {provider.name}")


@router.post("/operations/topup", status_code=201, response_model=OperationOut,
             summary="Пополнение с карты другого банка")
def topup(body: TopupIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Эмуляция: результат зависит от карты (успех, нет денег, заблокирована, истёк срок)."""
    account = own_open_account(db, user, body.to_account_id, "to_account_id")
    check_card_number(body.card_number)
    if body.card_number.startswith(rules.OWN_BIN):
        raise ApiError(400, "own_bank_card", field="card_number")
    month, year = int(body.expiry[:2]), 2000 + int(body.expiry[3:])
    today = clock.today_utc()
    if (year, month) < (today.year, today.month):
        raise ApiError(422, "card_expired", field="expiry")
    ext = db.get(ExternalCard, body.card_number)
    if not ext or ext.purpose != "TOPUP":
        raise ApiError(404, "card_not_found", field="card_number")
    rules.check_amount(rules.tariff(db, "TOPUP"), body.amount)
    op = Operation(user_id=user.id, type="TOPUP", status="WAITING_CODE", direction="in", amount=body.amount,
                   account_id=account.id, cp_bank=ext.bank_name, cp_card=rules.short_card(body.card_number))
    db.add(op)
    db.flush()
    decline = {"NO_FUNDS": "card_no_funds", "BLOCKED": "card_blocked", "EXPIRED": "card_expired"}.get(ext.status)
    if decline:
        _decline(op, decline)
    else:
        _lock(db, account.id)
        account.balance += body.amount
        op.status, op.completed_at = "DONE", clock.now()
    db.commit()
    return present(db, op)


# ---------- подтверждение, отмена, история ----------

def own_operation(db: Session, user: User, operation_id: int) -> Operation:
    op = db.scalar(select(Operation).where(Operation.id == operation_id, Operation.user_id == user.id))
    if not op:
        raise ApiError(404, "operation_not_found")
    return op


def waiting_operation(db: Session, user: User, operation_id: int) -> Operation:
    op = own_operation(db, user, operation_id)
    if op.status != "WAITING_CODE":
        raise ApiError(409, "operation_not_waiting")
    return op


@router.post("/operations/{operation_id}/confirm", response_model=OperationOut, summary="Подтвердить кодом из SMS")
def confirm(operation_id: int, body: ConfirmIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Неверный код — 400 `invalid_code` с `attempts_left`. Третий неверный код — 400 `code_attempts_exceeded`,
    операция при этом отклоняется (`DECLINED`, её видно в `GET /operations/{id}` и в истории)."""
    op = waiting_operation(db, user, operation_id)
    code = sms.active_for_operation(db, op.id)
    error = sms.verify(code, body.code) if code else "code_expired"
    if error is None:
        _execute(db, op)
    elif error == "code_attempts_exceeded":
        _decline(op, "code_attempts_exceeded")
    db.commit()
    if error == "invalid_code":
        raise ApiError(400, "invalid_code", f"Неверный код. Осталось попыток: {code.attempts_left}",
                       field="code", attempts_left=code.attempts_left)
    if error == "code_expired":
        raise ApiError(400, "code_expired", field="code", attempts_left=code.attempts_left if code else 0)
    if error == "code_attempts_exceeded":
        raise ApiError(400, "code_attempts_exceeded", field="code", attempts_left=0, operation_status=op.status)
    return present(db, op)


@router.post("/operations/{operation_id}/resend-code", response_model=OperationOut, summary="Отправить код ещё раз")
def resend_code(operation_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    op = waiting_operation(db, user, operation_id)
    old = sms.active_for_operation(db, op.id)
    if old:
        sms.check_resend(old)
        text = old.text.split(". ", 1)[1].rsplit(". Никому", 1)[0]
    else:
        text = "Подтверждение операции"
    sms.send_operation_code(db, user.id, user.phone, op.id, text)
    db.commit()
    return present(db, op)


@router.post("/operations/{operation_id}/cancel", response_model=OperationOut, summary="Отменить операцию")
def cancel(operation_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    op = waiting_operation(db, user, operation_id)
    code = sms.active_for_operation(db, op.id)
    if code:
        code.used = True
    op.status, op.completed_at = "CANCELLED", clock.now()
    db.commit()
    return present(db, op)


def _csv(values: list[str] | None, allowed: tuple[str, ...], field: str) -> list[str] | None:
    """Принимает и `type=A,B`, и `type=A&type=B`."""
    if not values:
        return None
    items = [v.strip().upper() for value in values for v in value.split(",") if v.strip()]
    bad = [v for v in items if v not in allowed]
    if bad:
        raise ApiError(422, "validation_error", f"Допустимые значения: {', '.join(allowed)}", field=field)
    return items


@router.get("/operations", response_model=OperationsPage, summary="История операций")
def list_operations(
    type: list[str] | None = Query(None, description="Типы через запятую или повтором параметра: " + ", ".join(TYPES)),
    status: list[str] | None = Query(None, description="Статусы через запятую или повтором: " + ", ".join(STATUSES)),
    direction: str | None = Query(None, description="in, out или internal"),
    account_id: int | None = Query(None, description="id своего счёта: только его операции"),
    date_from: date | None = Query(None, description="YYYY-MM-DD, включительно (московское время)"),
    date_to: date | None = Query(None, description="YYYY-MM-DD, включительно (московское время)"),
    limit: int = Query(20, ge=1, le=100, description="Сколько вернуть, 1–100"),
    offset: int = Query(0, ge=0, description="Сколько пропустить с начала"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Новые сверху. Неподтверждённые (`WAITING_CODE`) показываются, только если запросить их статусом явно."""
    q = select(Operation).where(Operation.user_id == user.id)
    types = _csv(type, TYPES, "type")
    statuses = _csv(status, STATUSES, "status")
    if types:
        q = q.where(Operation.type.in_(types))
    q = q.where(Operation.status.in_(statuses)) if statuses else q.where(Operation.status != "WAITING_CODE")
    if direction:
        direction = direction.strip().lower()
        if direction not in ("in", "out", "internal"):
            raise ApiError(422, "validation_error", "Допустимые значения: in, out, internal", field="direction")
        q = q.where(Operation.direction == direction)
    if account_id:
        # Счёт — свой (открытый или уже закрытый), иначе 404, как в остальных адресах.
        if not db.scalar(select(Account.id).where(Account.id == account_id, Account.user_id == user.id)):
            raise ApiError(404, "account_not_found", field="account_id")
        q = q.where((Operation.account_id == account_id) | (Operation.to_account_id == account_id))
    if date_from:
        q = q.where(Operation.created_at >= datetime.combine(date_from, datetime.min.time()) - rules.MSK)
    if date_to:
        q = q.where(Operation.created_at < datetime.combine(date_to, datetime.min.time()) + timedelta(days=1) - rules.MSK)
    if date_from and date_to and date_from > date_to:
        raise ApiError(422, "validation_error", "Дата начала позже даты конца", field="date_from")
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(Operation.created_at.desc(), Operation.id.desc()).limit(limit).offset(offset))
    return OperationsPage(items=[present(db, op) for op in rows], total=total)


@router.get("/operations/{operation_id}", response_model=OperationOut, summary="Операция")
def get_operation(operation_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return present(db, own_operation(db, user, operation_id))
