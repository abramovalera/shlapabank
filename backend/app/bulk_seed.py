"""Массовое сидирование пользователей для нагрузки/автотестов.

При запуске проверяет число пользователей. Если меньше `TARGET_USERS` — добирает разницу
через bulk-insert батчами по 1000.

Каждый пользователь получает:
- случайное имя/фамилию/телефон (из справочника ниже),
- 1–4 счёта (RUB/USD/EUR/CNY) со случайным балансом,
- 0–3 карты (Regular/Gold, разные дизайны),
- 3–20 транзакций (topup + payments + transfers),
- случайный sbp_primary_bank.
"""

from __future__ import annotations

import os
import random
import string
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import (
    Account,
    AccountType,
    Card,
    CardDesign,
    CardPaymentSystem,
    CardStatus,
    CardType,
    Currency,
    Transaction,
    TransactionStatus,
    TransactionType,
    User,
    UserBank,
    UserRole,
    UserStatus,
)
from app.banks import get_external_bank_codes


TARGET_USERS = int(os.environ.get("BULK_SEED_USERS", "50000"))
BATCH_SIZE = 1000

FIRST_NAMES = [
    "Иван", "Пётр", "Мария", "Ольга", "Алексей", "Наталья", "Сергей", "Елена",
    "Дмитрий", "Анна", "Владимир", "Екатерина", "Николай", "Татьяна", "Андрей",
    "Ирина", "Михаил", "Светлана", "Артём", "Юлия", "Роман", "Дарья", "Максим",
    "Кристина", "Егор", "Полина", "Кирилл", "Виктория", "Илья", "Алина",
    "Валерий", "Ксения", "Антон", "Марина", "Григорий", "Вера", "Никита",
    "Людмила", "Павел", "Оксана",
]
LAST_NAMES = [
    "Иванов", "Петров", "Сидоров", "Смирнов", "Кузнецов", "Попов", "Соколов",
    "Лебедев", "Козлов", "Новиков", "Морозов", "Волков", "Соловьёв", "Васильев",
    "Зайцев", "Павлов", "Семёнов", "Голубев", "Виноградов", "Богданов", "Воробьёв",
    "Фёдоров", "Михайлов", "Беляев", "Тарасов", "Белов", "Комаров", "Орлов",
    "Киселёв", "Макаров", "Андреев", "Ковалёв", "Ильин", "Гусев", "Титов",
    "Кузьмин", "Кудрявцев", "Баранов", "Куликов", "Алексеев",
]
NAME_SUFFIXES_FOR_ACCOUNTS = [
    "Основной", "Зарплатный", "Кэшбек", "Резерв", "Отпуск", "Ремонт", "Инвестиции",
    "Учёба", "Семья", "Развлечения", "Подарки", "Тревел",
]

CARD_DESIGNS_REGULAR: list[CardDesign] = [CardDesign.CLASSIC, CardDesign.EMERALD, CardDesign.GRAPHITE]
CARD_DESIGNS_GOLD: list[CardDesign] = [
    CardDesign.SUNSET, CardDesign.ROSE, CardDesign.GOLD_BAR, CardDesign.GOLD_MARBLE,
]

# Категории для сгенерированных транзакций
TX_TEMPLATES = [
    ("mobile:MTSha:{phone}", TransactionType.PAYMENT, (100, 2000)),
    ("mobile:MegaFun:{phone}", TransactionType.PAYMENT, (100, 2000)),
    ("vendor:CityWater:{acc}", TransactionType.PAYMENT, (300, 5000)),
    ("vendor:GasEnergy:{acc}", TransactionType.PAYMENT, (500, 8000)),
    ("vendor:RostelCom+:{acc}", TransactionType.PAYMENT, (400, 2000)),
    ("vendor:UniEdu:{acc}", TransactionType.PAYMENT, (5000, 60000)),
    ("vendor:GoodHands:{acc}", TransactionType.PAYMENT, (100, 5000)),
    ("external_transfer:RUB:••{last4}:fee_50.00", TransactionType.TRANSFER, (500, 30000)),
    ("self_topup:salary", TransactionType.TOPUP, (30000, 120000)),
    ("self_topup:gift", TransactionType.TOPUP, (500, 10000)),
    ("self_deposit", TransactionType.TOPUP, (1000, 20000)),
]


def _rand_phone() -> str:
    """+7 9XX XXX XX XX (уникальность проверяется на уровне БД)."""
    return "+79" + "".join(random.choices(string.digits, k=9))


def _rand_login(existing: set[str]) -> str:
    while True:
        login = "u" + "".join(random.choices(string.digits, k=8))
        if login not in existing:
            existing.add(login)
            return login


def password_for_login(login: str) -> str:
    """Детерминированный пароль по логину.

    Формула: `<Login>A1!` — например для `u12345678` пароль будет `U12345678A1!`.
    Так у каждого пользователя пароль свой, но его можно вычислить в тестах и в UI-подсказках.

    Правила безопасности `validate_password_rules` проходят:
    - латиница в верхнем регистре (`U`) и в нижнем (внутри логина цифры не влияют — но
      добавляем гарантированную нижнюю букву `a` через хвост `A1!` для строгих валидаторов
      в других местах),
    - цифра (`1` в хвосте, плюс цифры логина),
    - спецсимвол (`!`),
    - длина > 8, без пробелов, ≠ логину.
    """
    return f"{login.capitalize()}A1a!"


def _rand_acc_number(currency: Currency) -> str:
    prefixes = {
        Currency.RUB: "2202",
        Currency.USD: "3202",
        Currency.EUR: "4202",
        Currency.CNY: "5202",
    }
    prefix = prefixes.get(currency, "9999")
    return prefix + "".join(random.choices(string.digits, k=12))


def _rand_card_number(system: CardPaymentSystem) -> str:
    bins = {
        CardPaymentSystem.MIR: "2200",
        CardPaymentSystem.VISA: "4000",
        CardPaymentSystem.MASTERCARD: "5100",
    }
    return bins[system] + "".join(random.choices(string.digits, k=12))


def bulk_seed_users() -> None:
    """Наполняет БД случайными пользователями до TARGET_USERS.

    Идемпотентно: если уже есть — ничего не делает. Только досаживает недостающих.
    Тяжёлая операция — при первом запуске может занять 30–90 секунд.
    """
    db = SessionLocal()
    try:
        current = db.scalar(select(func.count(User.id))) or 0
        needed = TARGET_USERS - current
        if needed <= 0:
            return
        print(f"[bulk_seed] будем добавить {needed} пользователей (сейчас {current})")

        external_banks = get_external_bank_codes()
        existing_logins = set(db.scalars(select(User.login)).all())

        added = 0
        while added < needed:
            batch = min(BATCH_SIZE, needed - added)
            _seed_batch(db, batch, existing_logins, external_banks)
            added += batch
            print(f"[bulk_seed] прогресс {added}/{needed}")
        print(f"[bulk_seed] готово, добавлено {added}")
    except Exception as e:
        db.rollback()
        print(f"[bulk_seed] ошибка: {e}")
    finally:
        db.close()


def _seed_batch(
    db: Session,
    batch_size: int,
    existing_logins: set[str],
    external_banks: list[str],
) -> None:
    """Создаёт batch_size пользователей одной транзакцией.

    Использует Core-инсерты через session.add + один commit на весь батч — SA автоматически
    группирует в bulk-insert при большом объёме.
    """
    users: list[User] = []
    for _ in range(batch_size):
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        phone = _rand_phone()
        login = _rand_login(existing_logins)
        # 60% пользователей имеют ShlapaBank как основной, остальные — случайный
        primary = "SHLAPABANK" if random.random() < 0.6 else random.choice(external_banks)
        u = User(
            login=login,
            # Пароль детерминированно вычисляется из логина — см. password_for_login().
            # Тесты и автотесты умеют его пересобрать: `{Login}A1a!`.
            password_hash=password_for_login(login),
            first_name=first,
            last_name=last,
            phone=phone,
            role=UserRole.CLIENT,
            status=UserStatus.ACTIVE if random.random() < 0.97 else UserStatus.BLOCKED,
            sbp_primary_bank=primary,
        )
        users.append(u)
    db.add_all(users)
    db.flush()  # получаем id'шники

    # Внешние банки в UserBank (0-3 случайных)
    ub_batch: list[UserBank] = []
    for u in users:
        n = random.randint(0, min(3, len(external_banks)))
        for code in random.sample(external_banks, n):
            ub_batch.append(UserBank(user_id=u.id, bank_code=code))
    if ub_batch:
        db.add_all(ub_batch)

    # Счета: 1-4 на пользователя
    accounts_batch: list[Account] = []
    account_counter: dict[int, int] = {}
    for u in users:
        num_accounts = random.choices([1, 2, 3, 4], weights=[30, 40, 20, 10])[0]
        for i in range(num_accounts):
            currency = random.choices(
                [Currency.RUB, Currency.USD, Currency.EUR, Currency.CNY],
                weights=[70, 12, 12, 6],
            )[0]
            acc_type = random.choices(
                [AccountType.DEBIT, AccountType.SAVINGS], weights=[85, 15]
            )[0]
            # 20% пустые, 40% средний баланс, 30% крупный, 10% очень крупный
            r = random.random()
            if r < 0.2:
                balance = Decimal("0.00")
            elif r < 0.6:
                balance = Decimal(random.randint(1000, 50000))
            elif r < 0.9:
                balance = Decimal(random.randint(50000, 500000))
            else:
                balance = Decimal(random.randint(500000, 5000000))
            if currency != Currency.RUB:
                balance = balance / Decimal("80")  # приблизительная конвертация
            name = f"{random.choice(NAME_SUFFIXES_FOR_ACCOUNTS)} {i + 1}"
            account_counter[u.id] = account_counter.get(u.id, 0) + 1
            accounts_batch.append(
                Account(
                    account_number=_rand_acc_number(currency),
                    user_id=u.id,
                    account_type=acc_type,
                    currency=currency,
                    balance=balance,
                    name=name,
                )
            )
    db.add_all(accounts_batch)
    db.flush()

    # Карты — 0-3 на каждый DEBIT счёт
    cards_batch: list[Card] = []
    now = datetime.utcnow()
    for acc in accounts_batch:
        if acc.account_type != AccountType.DEBIT:
            continue
        num_cards = random.choices([0, 1, 2, 3], weights=[25, 55, 15, 5])[0]
        for _ in range(num_cards):
            is_gold = random.random() < 0.15
            design = random.choice(CARD_DESIGNS_GOLD if is_gold else CARD_DESIGNS_REGULAR)
            payment = (
                CardPaymentSystem.MIR
                if acc.currency == Currency.RUB
                else CardPaymentSystem.VISA
            )
            status_r = random.random()
            status = (
                CardStatus.BLOCKED if status_r < 0.05
                else CardStatus.EXPIRED if status_r < 0.08
                else CardStatus.ACTIVE
            )
            first = next((u.first_name for u in users if u.id == acc.user_id), "USER")
            last = next((u.last_name for u in users if u.id == acc.user_id), "CLIENT")
            cards_batch.append(
                Card(
                    account_id=acc.id,
                    number=_rand_card_number(payment),
                    last4=None,  # populate after
                    holder_name=f"{first} {last}".upper(),
                    expiry_month=now.month,
                    expiry_year=now.year + 4,
                    card_type=CardType.GOLD if is_gold else CardType.REGULAR,
                    payment_system=payment,
                    status=status,
                    design=design,
                    is_contactless=True,
                )
            )
    # заполняем last4
    for c in cards_batch:
        c.last4 = c.number[-4:]
    if cards_batch:
        db.add_all(cards_batch)
        db.flush()

    # Транзакции: 0-15 на пользователя, за последние 90 дней
    txs_batch: list[Transaction] = []
    for u in users:
        user_accounts = [a for a in accounts_batch if a.user_id == u.id]
        if not user_accounts:
            continue
        n_tx = random.randint(0, 15)
        for _ in range(n_tx):
            tpl, tx_type, (mn, mx) = random.choice(TX_TEMPLATES)
            amount = Decimal(random.randint(mn, mx))
            days_ago = random.randint(0, 90)
            when = now - timedelta(days=days_ago, hours=random.randint(0, 23))
            acc = random.choice(user_accounts)
            desc = tpl.format(
                phone="+79" + "".join(random.choices(string.digits, k=9)),
                acc=acc.account_number,
                last4=acc.account_number[-4:],
            )
            fee = Decimal("50") if "fee_50.00" in desc else Decimal("0")
            txs_batch.append(
                Transaction(
                    from_account_id=None if tx_type == TransactionType.TOPUP else acc.id,
                    to_account_id=acc.id if tx_type == TransactionType.TOPUP else None,
                    type=tx_type,
                    amount=amount,
                    currency=acc.currency,
                    status=TransactionStatus.COMPLETED,
                    initiated_by=u.id,
                    description=desc,
                    fee=fee,
                    created_at=when,
                )
            )
    if txs_batch:
        db.add_all(txs_batch)

    db.commit()
