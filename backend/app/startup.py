"""Инициализация БД при старте приложения: создание таблиц, миграции, сидирование."""

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.banks import BANKS_CATALOG
from app.core.config import settings
from app.db import Base, SessionLocal, engine
from app.models import Bank, User, UserRole
from app.security import get_password_hash


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
