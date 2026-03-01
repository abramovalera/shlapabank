"""Инициализация БД при старте приложения: создание таблиц, миграции, сидирование."""

import random
from collections import Counter
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.banks import BANKS_CATALOG, get_external_bank_codes
from app.core.config import settings
from app.db import Base, SessionLocal, engine
from app.models import Account, AccountType, Bank, Currency, User, UserBank, UserRole, UserStatus
from app.security import get_password_hash


# Тестовый клиент с полным набором счетов (логин/пароль/телефон — в docs/FULL_CLIENT_CREDENTIALS.md)
FULL_CLIENT_LOGIN = "fullclient"
FULL_CLIENT_PASSWORD = "FullClient1!"
FULL_CLIENT_PHONE = "+79991234567"


def init_db() -> None:
    """Создание таблиц, применение миграций (ALTER при необходимости), сидирование банков и админа."""
    Base.metadata.create_all(bind=engine)

    # Миграции: добавить колонки, если их нет (is_primary, fee)
    with engine.connect() as conn:
        for stmt in (
            "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee NUMERIC(14, 2) DEFAULT 0",
        ):
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                conn.rollback()

    _seed_banks()
    _seed_admin()
    _seed_full_client()


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
                password_hash=get_password_hash(settings.default_admin_password),
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
            admin.password_hash = get_password_hash(settings.default_admin_password)
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
                fallback_admin.password_hash = get_password_hash(settings.default_admin_password)
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
                password_hash=get_password_hash(FULL_CLIENT_PASSWORD),
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
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
