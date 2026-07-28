"""Инициализация БД при старте приложения: создание таблиц, миграции, сидирование."""

import random
from collections import Counter
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.banks import BANKS_CATALOG, get_external_bank_codes
from app.core.config import settings
from app.db import Base, SessionLocal, engine
from app.models import (
    Account,
    AccountType,
    Bank,
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


# Тестовый клиент с полным набором счетов (логин/пароль/телефон — в docs/FULL_CLIENT_CREDENTIALS.md)
FULL_CLIENT_LOGIN = "fullclient"
FULL_CLIENT_PASSWORD = "FullClient1!"
FULL_CLIENT_PHONE = "+79991234567"


def init_db() -> None:
    """Создание таблиц, применение миграций (ALTER при необходимости), сидирование банков и админа."""
    Base.metadata.create_all(bind=engine)

    # Миграции: добавить колонки, если их нет
    with engine.connect() as conn:
        for stmt in (
            "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS name VARCHAR(60) NOT NULL DEFAULT 'Счёт'",
            "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee NUMERIC(14, 2) DEFAULT 0",
            "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_id INTEGER REFERENCES cards(id)",
            "DO $$ BEGIN CREATE TYPE carddesign AS ENUM ('CLASSIC','EMERALD','SUNSET','ROSE'); "
            "EXCEPTION WHEN duplicate_object THEN NULL; END $$",
            "ALTER TABLE cards ADD COLUMN IF NOT EXISTS design carddesign NOT NULL DEFAULT 'CLASSIC'",
            # Новые значения enum'ов — добавляем без пересоздания типа
            "ALTER TYPE carddesign ADD VALUE IF NOT EXISTS 'GRAPHITE'",
            "ALTER TYPE carddesign ADD VALUE IF NOT EXISTS 'GOLD_BAR'",
            "ALTER TYPE carddesign ADD VALUE IF NOT EXISTS 'GOLD_MARBLE'",
            "ALTER TYPE cardtype ADD VALUE IF NOT EXISTS 'REGULAR'",
            "ALTER TYPE cardtype ADD VALUE IF NOT EXISTS 'GOLD'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS sbp_primary_bank VARCHAR(32) NOT NULL DEFAULT 'SHLAPABANK'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(20)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth VARCHAR(10)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(10) NOT NULL DEFAULT 'dark'",
        ):
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                conn.rollback()

    _backfill_account_names()

    _seed_banks()
    _seed_admin()
    _seed_full_client()

    # Массовый сид — только если явно включён флагом (по-умолчанию 0).
    # Управляется env BULK_SEED_ENABLED / BULK_SEED_USERS.
    import os as _os
    if _os.environ.get("BULK_SEED_ENABLED", "0") == "1":
        from app.bulk_seed import bulk_seed_users
        bulk_seed_users()


def _seed_banks() -> None:
    db = SessionLocal()
    try:
        for code, label in BANKS_CATALOG:
            bank = db.scalar(select(Bank).where(Bank.code == code))
            if not bank:
                db.add(Bank(code=code, label=label))
            else:
                bank.label = label
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _seed_admin() -> None:
    from sqlalchemy import or_

    db = SessionLocal()
    try:
        admin = db.scalar(
            select(User).where(
                or_(
                    User.login == settings.default_admin_login,
                    User.email == settings.default_admin_email,
                )
            )
        )
        if not admin:
            admin = User(
                login=settings.default_admin_login,
                email=settings.default_admin_email,
                password_hash=settings.default_admin_password,
                role=UserRole.ADMIN,
            )
            db.add(admin)
        else:
            admin.role = UserRole.ADMIN
            admin.login = settings.default_admin_login
            email_conflict = db.scalar(
                select(User).where(
                    User.email == settings.default_admin_email,
                    User.id != admin.id,
                )
            )
            if not email_conflict:
                admin.email = settings.default_admin_email
            admin.password_hash = settings.default_admin_password
            db.add(admin)

        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            fallback_admin = db.scalar(
                select(User).where(
                    or_(
                        User.login == settings.default_admin_login,
                        User.email == settings.default_admin_email,
                    )
                )
            )
            if fallback_admin:
                fallback_admin.role = UserRole.ADMIN
                fallback_admin.password_hash = settings.default_admin_password
                db.add(fallback_admin)
                db.commit()
    finally:
        db.close()


def _account_number_for_currency(currency: Currency) -> str:
    """Генерация номера счёта по валюте (префикс + случайный суффикс)."""
    prefixes = {
        Currency.RUB: "2202",
        Currency.USD: "3202",
        Currency.EUR: "4202",
        Currency.CNY: "5202",
    }
    prefix = prefixes.get(currency, "9999")
    suffix_len = 16 - len(prefix)
    suffix = "".join(random.choices("0123456789", k=suffix_len))
    return f"{prefix}{suffix}"


def _seed_full_client() -> None:
    """Создать тестового клиента fullclient с полным набором счетов и балансами."""
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.login == FULL_CLIENT_LOGIN))
        if not user:
            user = User(
                login=FULL_CLIENT_LOGIN,
                password_hash=FULL_CLIENT_PASSWORD,
                role=UserRole.CLIENT,
                status=UserStatus.ACTIVE,
                phone=FULL_CLIENT_PHONE,
            )
            db.add(user)
            db.flush()
        elif not user.phone:
            user.phone = FULL_CLIENT_PHONE
            db.add(user)

        # Случайные внешние банки для переводов (если ещё нет)
        existing_banks = list(
            db.scalars(select(UserBank).where(UserBank.user_id == user.id))
        )
        if not existing_banks:
            external = get_external_bank_codes()
            n = random.randint(3, min(5, len(external)))
            for bank_code in random.sample(external, n):
                db.add(UserBank(user_id=user.id, bank_code=bank_code))

        existing_list = list(
            db.scalars(
                select(Account).where(Account.user_id == user.id, Account.is_active.is_(True))
            ).all()
        )
        # Сколько уже есть по (валюта, тип)
        existing_counts = Counter((a.currency, a.account_type) for a in existing_list)

        # 3 RUB (2 DEBIT + 1 SAVINGS), 1 USD, 1 EUR, 1 CNY (DEBIT)
        wanted = [
            (Currency.RUB, AccountType.DEBIT, 2),
            (Currency.RUB, AccountType.SAVINGS, 1),
            (Currency.USD, AccountType.DEBIT, 1),
            (Currency.EUR, AccountType.DEBIT, 1),
            (Currency.CNY, AccountType.DEBIT, 1),
        ]
        for currency, acc_type, need_count in wanted:
            have = existing_counts.get((currency, acc_type), 0)
            to_add = need_count - have
            for _ in range(to_add):
                for attempt in range(10):
                    num = _account_number_for_currency(currency)
                    if db.scalar(select(Account).where(Account.account_number == num)):
                        continue
                    balance = Decimal("50000.00") if currency == Currency.RUB else Decimal("1000.00")
                    db.add(
                        Account(
                            account_number=num,
                            user_id=user.id,
                            account_type=acc_type,
                            currency=currency,
                            balance=balance,
                        )
                    )
                    existing_counts[(currency, acc_type)] = existing_counts.get((currency, acc_type), 0) + 1
                    break
        db.flush()

        # ==== Карты ====
        # У каждого дебетового счёта — хотя бы одна карта; используем разные дизайны,
        # чтобы демонстрировать все варианты. У первого RUB-счёта дополнительно
        # виртуалка. Одну карту помечаем как BLOCKED — для демо статусов.
        from app.routes.cards import issue_card_for_account

        user_accounts = list(
            db.scalars(
                select(Account)
                .where(Account.user_id == user.id, Account.is_active.is_(True))
                .order_by(Account.id)
            )
        )
        debit_accounts = [a for a in user_accounts if a.account_type == AccountType.DEBIT]

        design_cycle = [
            CardDesign.CLASSIC,
            CardDesign.EMERALD,
            CardDesign.SUNSET,
            CardDesign.ROSE,
        ]
        for i, acc in enumerate(debit_accounts):
            existing_cards = db.scalars(select(Card).where(Card.account_id == acc.id)).all()
            if existing_cards:
                continue
            # Основная карта — под валюту счёта, дизайн по кругу
            issue_card_for_account(
                account=acc,
                user=user,
                db=db,
                card_type=CardType.DEBIT,
                payment_system=(
                    CardPaymentSystem.MIR if acc.currency == Currency.RUB else CardPaymentSystem.VISA
                ),
                design=design_cycle[i % len(design_cycle)],
            )
            # У первого RUB-счёта — ещё виртуалка (для демо мультикарточного счёта)
            if i == 0 and acc.currency == Currency.RUB:
                issue_card_for_account(
                    account=acc,
                    user=user,
                    db=db,
                    card_type=CardType.VIRTUAL,
                    payment_system=CardPaymentSystem.MIR,
                    design=CardDesign.EMERALD,
                )

        # Пометить последнюю карту как BLOCKED — для демо статусов, только один раз
        cards = db.scalars(select(Card).join(Account).where(Account.user_id == user.id)).all()
        if cards and not any(c.status == CardStatus.BLOCKED for c in cards):
            cards[-1].status = CardStatus.BLOCKED
            db.add(cards[-1])

        # ==== История операций ====
        # Идемпотентно: сеем только если у пользователя пока меньше 5 транзакций.
        existing_txs = db.scalars(
            select(Transaction).where(Transaction.initiated_by == user.id)
        ).all()
        if len(existing_txs) < 5 and debit_accounts:
            _seed_fullclient_transactions(db, user, debit_accounts)

        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _seed_fullclient_transactions(db, user: User, debit_accounts: list[Account]) -> None:
    """Богатая история за последние 30 дней: платежи по всем категориям, переводы, пополнения.

    Балансы уже установлены на этапе создания счетов, здесь только вставляем записи
    для истории и статистики. Description'ы соответствуют правилам классификации
    в app/routes/statistics.py.
    """
    rub_accounts = [a for a in debit_accounts if a.currency == Currency.RUB]
    if not rub_accounts:
        return
    main_rub = rub_accounts[0]
    second_rub = rub_accounts[1] if len(rub_accounts) > 1 else main_rub

    now = datetime.utcnow()

    def at(days_ago: int, hour: int = 12) -> datetime:
        return (now - timedelta(days=days_ago)).replace(hour=hour, minute=15, second=0, microsecond=0)

    seeds: list[tuple[datetime, str, Decimal, Account | None, Account | None, TransactionType, Decimal]] = [
        # ЖКХ
        (at(1, 9),  "vendor:CityWater:123456789012",   Decimal("1240.50"), main_rub, None, TransactionType.PAYMENT, Decimal("0")),
        (at(4, 11), "vendor:GasEnergy:987654321098",   Decimal("2815.40"), main_rub, None, TransactionType.PAYMENT, Decimal("0")),
        (at(12, 18),"vendor:ZhKH-Service:100200300",   Decimal("3210.00"), main_rub, None, TransactionType.PAYMENT, Decimal("0")),
        # Связь
        (at(2, 10), "mobile:MTSha:+79991234567",       Decimal("300.00"),  main_rub, None, TransactionType.PAYMENT, Decimal("0")),
        (at(16, 14),"mobile:MegaFun:+79161112233",     Decimal("500.00"),  main_rub, None, TransactionType.PAYMENT, Decimal("0")),
        # Интернет / ТВ
        (at(6, 15), "vendor:RostelCom+:5501234567",    Decimal("650.00"),  main_rub, None, TransactionType.PAYMENT, Decimal("0")),
        (at(20, 20),"vendor:TV360:8877665544",         Decimal("890.00"),  main_rub, None, TransactionType.PAYMENT, Decimal("0")),
        # Образование
        (at(8, 13), "vendor:UniEdu:2024STUD001",       Decimal("4500.00"), main_rub, None, TransactionType.PAYMENT, Decimal("0")),
        # Благотворительность
        (at(3, 16), "vendor:GoodHands:CHARITY01",      Decimal("500.00"),  main_rub, None, TransactionType.PAYMENT, Decimal("0")),
        (at(14, 12),"vendor:KindKids:HELP2024",        Decimal("1000.00"), main_rub, None, TransactionType.PAYMENT, Decimal("0")),
        # Внешние переводы (с комиссией)
        (at(5, 17), "external_transfer:RUB:••4455:fee_50.00", Decimal("3500.00"), main_rub, None, TransactionType.TRANSFER, Decimal("50.00")),
        (at(18, 19),"external_transfer:RUB:••8891:fee_50.00", Decimal("2000.00"), main_rub, None, TransactionType.TRANSFER, Decimal("50.00")),
        # Пополнения (доходы)
        (at(7, 10), "self_topup:salary", Decimal("65000.00"), None, main_rub, TransactionType.TOPUP, Decimal("0")),
        (at(21, 10),"self_topup:salary", Decimal("65000.00"), None, main_rub, TransactionType.TOPUP, Decimal("0")),
        (at(1, 18), "self_topup:gift",   Decimal("2000.00"),  None, main_rub, TransactionType.TOPUP, Decimal("0")),
        # P2P между своими (в статистику расходов не должно попадать)
        (at(10, 21),"p2p_transfer", Decimal("5000.00"), main_rub, second_rub, TransactionType.TRANSFER, Decimal("0")),
    ]

    for created_at, description, amount, from_acc, to_acc, tx_type, fee in seeds:
        tx = Transaction(
            from_account_id=from_acc.id if from_acc else None,
            to_account_id=to_acc.id if to_acc else None,
            type=tx_type,
            amount=amount,
            currency=Currency.RUB,
            status=TransactionStatus.COMPLETED,
            initiated_by=user.id,
            description=description,
            fee=fee,
            created_at=created_at,
        )
        db.add(tx)


def _backfill_account_names() -> None:
    """Присваивает имена «Счёт N» / «Накопительный N» существующим счетам с
    дефолтным именем. Идемпотентно — трогает только те, где name пустой или 'Счёт'."""
    from collections import defaultdict

    db = SessionLocal()
    try:
        accounts = list(
            db.scalars(select(Account).order_by(Account.user_id, Account.id))
        )
        counters: dict[tuple[int, str], int] = defaultdict(int)
        for a in accounts:
            prefix = "Накопительный" if a.account_type == AccountType.SAVINGS else "Счёт"
            counters[(a.user_id, prefix)] += 1
            if not a.name or a.name.strip() in {"", "Счёт", "Накопительный"}:
                a.name = f"{prefix} {counters[(a.user_id, prefix)]}"
                db.add(a)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
