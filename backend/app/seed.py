"""Исходные данные стенда. Всё детерминировано: после сброса номера счетов и карт те же самые.

Таблицы с тестовыми данными — в документации: docs/guide/01-test-data.md.
"""

from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app import clock
from app.db import Base, SessionLocal, engine
from app.models import (
    Account, Card, ExternalCard, ExternalRecipient, Limit, MobileOperator, Operation, Provider, Tariff, User,
)
from app.rules import account_number_for, card_number_for, luhn_digit
from app.security import hash_password

D = Decimal

TARIFFS = [
    # тип, название, комиссия %, минимум комиссии, сумма от, сумма до, нужен код
    ("OWN_TRANSFER", "Между своими счетами", "0", "0", "1", "1000000", False),
    ("PHONE_OWN_BANK", "По телефону клиенту ShlapaBank", "0", "0", "10", "100000", True),
    ("PHONE_OTHER_BANK", "По телефону в другой банк", "1", "10", "10", "100000", True),
    ("CARD_OWN_BANK", "На карту ShlapaBank", "0", "0", "10", "100000", True),
    ("CARD_OTHER_BANK", "На карту другого банка", "1.5", "50", "100", "100000", True),
    ("MOBILE", "Мобильная связь", "0", "0", "100", "12000", True),
    ("UTILITY", "ЖКХ и услуги", "0", "0", "100", "100000", True),
    ("TOPUP", "Пополнение с карты другого банка", "0", "0", "100", "50000", False),
]

LIMITS = [("per_operation", "100000"), ("daily", "300000"), ("monthly", "1000000")]

PROVIDERS = [
    ("vodokanal", "Горводоканал", "ЖКХ", 10),
    ("energosbyt", "ЭнергоСбыт", "ЖКХ", 12),
    ("gasservice", "ГазСервис", "ЖКХ", 12),
    ("nash_dom", "УК «Наш дом»", "ЖКХ", 8),
    ("set_plus", "Сеть+", "Интернет и ТВ", 9),
    ("telecom_tv", "ТелеКом ТВ", "Интернет и ТВ", 9),
]

OPERATORS = [("900", "MTSha"), ("999", "MTSha"), ("916", "MegaFun"), ("925", "MegaFun"),
             ("903", "Babline"), ("985", "TelePanda"), ("996", "YotaLike")]

# Клиенты других банков (эмуляция СБП): телефон -> имя, банк, статус.
EXTERNAL_RECIPIENTS = [
    ("+79160000021", "Пётр Козлов", "Сберушка", "ACTIVE"),
    ("+79160000022", "Ольга Лебедева", "Пенькофф", "ACTIVE"),
    ("+79160000023", "Сергей Волков", "Бабальфа", "ACTIVE"),
    ("+79160000024", "Мария Орлова", "ВТБей", "BLOCKED"),
]

# Карты других банков: первые 15 цифр -> (банк, держатель, статус). 16-я цифра — контрольная (Луна).
EXTERNAL_CARDS = [
    # куда переводить
    ("427600000000201", "Сберушка", "Пётр Козлов", "ACTIVE", "TRANSFER"),
    ("521324000000202", "Пенькофф", "Ольга Лебедева", "ACTIVE", "TRANSFER"),
    ("415428000000203", "Бабальфа", "Сергей Волков", "BLOCKED", "TRANSFER"),
    ("418868000000204", "ВТБей", "Мария Орлова", "EXPIRED", "TRANSFER"),
    # с каких пополнять
    ("427600000000101", "Сберушка", "Иван Иванов", "ACTIVE", "TOPUP"),
    ("427600000000102", "Сберушка", "Иван Иванов", "NO_FUNDS", "TOPUP"),
    ("427600000000103", "Сберушка", "Иван Иванов", "BLOCKED", "TOPUP"),
    ("427600000000104", "Сберушка", "Иван Иванов", "EXPIRED", "TOPUP"),
]

# Клиенты ShlapaBank: телефон, пароль, имя, фамилия, статус, счета (название, баланс, открыт), статус карты (None — без карты)
CLIENTS = [
    ("+79991234567", "FullClient1!", "Иван", "Иванов", "ACTIVE",
     [("Основной", "150000.00", True), ("Накопления", "50000.00", True), ("На отпуск", "20000.00", True)], "ACTIVE"),
    ("+79000000001", "Test1234!", "Анна", "Смирнова", "ACTIVE", [("Основной", "25000.00", True)], "ACTIVE"),
    ("+79000000002", "Test1234!", "Борис", "Петров", "ACTIVE", [("Основной", "10000.00", True)], None),
    ("+79000000003", "Test1234!", "Вера", "Соколова", "ACTIVE", [("Основной", "5000.00", True)], "BLOCKED"),
    ("+79000000004", "Test1234!", "Глеб", "Морозов", "BLOCKED", [("Основной", "1000.00", True)], "ACTIVE"),
    ("+79000000005", "Test1234!", "Дарья", "Новикова", "ACTIVE", [("Основной", "0.00", False)], None),
]

TRANSLIT = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
                    ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s",
                     "t", "u", "f", "kh", "ts", "ch", "sh", "shch", "", "y", "", "e", "yu", "ya"]))


def holder_name(first: str, last: str) -> str:
    return "".join(TRANSLIT.get(ch, ch) for ch in f"{first} {last}".lower()).upper()


def new_card(db: Session, user: User, account: Account, status: str = "ACTIVE") -> Card:
    card = Card(user_id=user.id, account_id=account.id, number="0" * 16, expiry="11/29", cvv="000",
                holder=holder_name(user.first_name, user.last_name), status=status)
    db.add(card)
    db.flush()
    card.number = card_number_for(card.id)
    card.cvv = f"{(card.id * 137) % 900 + 100}"
    return card


def new_account(db: Session, user: User, name: str, balance: Decimal = D("0.00")) -> Account:
    account = Account(user_id=user.id, number="0" * 20, name=name, balance=balance)
    db.add(account)
    db.flush()
    account.number = account_number_for(account.id)
    return account


def _dictionaries(db: Session) -> None:
    for i, (t, title, pct, fmin, amin, amax, code) in enumerate(TARIFFS):
        db.add(Tariff(operation_type=t, title=title, fee_percent=D(pct), fee_min=D(fmin),
                      amount_min=D(amin), amount_max=D(amax), needs_code=code, sort=i))
    for name, amount in LIMITS:
        db.add(Limit(name=name, amount=D(amount)))
    for i, (code, name, cat, length) in enumerate(PROVIDERS):
        db.add(Provider(code=code, name=name, category=cat, payer_account_length=length, sort=i))
    for prefix, name in OPERATORS:
        db.add(MobileOperator(prefix=prefix, name=name))
    for phone, name, bank, status in EXTERNAL_RECIPIENTS:
        db.add(ExternalRecipient(phone=phone, name=name, bank_name=bank, status=status))
    for body, bank, holder, status, purpose in EXTERNAL_CARDS:
        db.add(ExternalCard(number=body + luhn_digit(body), bank_name=bank, holder_name=holder, status=status,
                            purpose=purpose))


def _clients(db: Session) -> dict[str, tuple[User, list[Account]]]:
    result = {}
    for phone, password, first, last, status, accounts, card_status in CLIENTS:
        user = User(phone=phone, password_hash=hash_password(password), first_name=first, last_name=last, status=status)
        db.add(user)
        db.flush()
        accs = []
        for name, balance, is_open in accounts:
            acc = new_account(db, user, name, D(balance))
            if not is_open:
                acc.is_open = False
                acc.closed_at = clock.now()
            accs.append(acc)
        if card_status:
            new_card(db, user, accs[0], card_status)
        result[phone] = (user, accs)
    return result


def _history(db: Session, clients: dict) -> None:
    """Немного истории у демо-клиента, чтобы главная и история не были пустыми."""
    ivan, (main, savings, _) = clients["+79991234567"]
    anna, (anna_main,) = clients["+79000000001"]
    now = clock.now().replace(microsecond=0)

    def op(user, account, days, **kw):
        at = now - timedelta(days=days)
        o = Operation(user_id=user.id, account_id=account.id, created_at=at,
                      completed_at=at if kw.get("status", "DONE") == "DONE" else None, **{"status": "DONE", **kw})
        db.add(o)
        db.flush()
        return o

    out = op(anna, anna_main, 9, type="PHONE_TRANSFER", direction="out", amount=D("2000.00"),
             cp_name="Иван И.", cp_phone=ivan.phone, cp_bank="ShlapaBank",
             recipient_user_id=ivan.id, recipient_account_id=main.id, message="За билеты")
    inc = op(ivan, main, 9, type="INCOMING_TRANSFER", direction="in", amount=D("2000.00"),
             cp_name="Анна С.", cp_phone=anna.phone, cp_bank="ShlapaBank", message="За билеты",
             related_operation_id=out.id)
    out.related_operation_id = inc.id
    op(ivan, main, 7, type="TOPUP", direction="in", amount=D("10000.00"),
       cp_bank="Сберушка", cp_card="4276 •• 0101")
    op(ivan, main, 7, type="TOPUP", direction="in", amount=D("10000.00"), status="DECLINED",
       cp_bank="Сберушка", cp_card="4276 •• 0102",
       decline_code="card_no_funds", decline_message="Банк отправителя отклонил операцию: недостаточно средств на карте")
    op(ivan, main, 5, type="OWN_TRANSFER", direction="internal", amount=D("5000.00"), to_account_id=savings.id)
    op(ivan, main, 3, type="UTILITY", direction="out", amount=D("1240.50"),
       cp_provider="Горводоканал", cp_payer_account="1002003001")
    op(ivan, main, 2, type="MOBILE", direction="out", amount=D("300.00"),
       cp_phone="+79160000021", cp_operator="MegaFun")
    op(ivan, main, 1, type="PHONE_TRANSFER", direction="out", amount=D("1500.00"), fee=D("15.00"),
       cp_name="Пётр К.", cp_phone="+79160000021", cp_bank="Сберушка")


def reset() -> None:
    """Полностью пересоздаёт таблицы и заливает исходные данные."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        _dictionaries(db)
        clients = _clients(db)
        _history(db, clients)
        db.commit()


def _schema_outdated() -> bool:
    """В базе нет таблицы или колонки, которая есть в моделях (код обновился, а база старая)."""
    insp = inspect(engine)
    existing = set(insp.get_table_names())
    for table in Base.metadata.sorted_tables:
        if table.name not in existing:
            return True
        if {c.name for c in table.columns} - {c["name"] for c in insp.get_columns(table.name)}:
            return True
    return False


def init() -> None:
    """При старте: база пустая или устарела — заливаем данные заново; иначе ничего не трогаем."""
    if _schema_outdated():
        reset()
        return
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)) is None:
            db.close()
            reset()
