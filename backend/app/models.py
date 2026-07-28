import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class UserRole(str, enum.Enum):
    CLIENT = "CLIENT"
    ADMIN = "ADMIN"


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    BLOCKED = "BLOCKED"


class AccountType(str, enum.Enum):
    DEBIT = "DEBIT"
    SAVINGS = "SAVINGS"


class Currency(str, enum.Enum):
    RUB = "RUB"
    USD = "USD"
    EUR = "EUR"
    CNY = "CNY"


class TransactionType(str, enum.Enum):
    TOPUP = "TOPUP"
    TRANSFER = "TRANSFER"
    PAYMENT = "PAYMENT"


class TransactionStatus(str, enum.Enum):
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class CardType(str, enum.Enum):
    DEBIT = "DEBIT"       # оставляем для совместимости старых записей
    VIRTUAL = "VIRTUAL"   # оставляем для совместимости старых записей
    CREDIT = "CREDIT"     # оставляем для совместимости старых записей
    REGULAR = "REGULAR"   # обычная дебетовая — 3 базовых цвета
    GOLD = "GOLD"         # премиум — золотые дизайны


class CardPaymentSystem(str, enum.Enum):
    VISA = "VISA"
    MIR = "MIR"
    MASTERCARD = "MASTERCARD"


class CardStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    BLOCKED = "BLOCKED"
    EXPIRED = "EXPIRED"


class CardDesign(str, enum.Enum):
    """Визуальный дизайн карты. Regular использует базовые (CLASSIC/EMERALD/GRAPHITE),
    Gold — премиум (SUNSET/ROSE/GOLD_BAR/GOLD_MARBLE)."""

    CLASSIC = "CLASSIC"          # тёмно-синий (Regular)
    EMERALD = "EMERALD"          # изумрудный (Regular)
    GRAPHITE = "GRAPHITE"        # графитовый (Regular)
    SUNSET = "SUNSET"            # янтарный (Gold)
    ROSE = "ROSE"                # розово-малиновый (Gold)
    GOLD_BAR = "GOLD_BAR"        # чистое золото (Gold)
    GOLD_MARBLE = "GOLD_MARBLE"  # мраморное золото (Gold)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    login: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    # Учебный проект: пароль хранится открытым текстом (имя колонки историческое). Не использовать в продакшене.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.CLIENT, nullable=False)
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus), default=UserStatus.ACTIVE, nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(12), nullable=True)
    # Код банка, который пользователь пометил основным для СБП. По умолчанию — наш.
    sbp_primary_bank: Mapped[str] = mapped_column(String(32), default="SHLAPABANK", nullable=False)
    # Цвет фона для аватара-инициалов (hex или ключ из палитры)
    avatar_color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Дата рождения (опциональная, строка ISO YYYY-MM-DD для простоты)
    date_of_birth: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Тема интерфейса: dark / light (пока храним только для будущей миграции)
    theme: Mapped[str] = mapped_column(String(10), default="dark", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    accounts: Mapped[list["Account"]] = relationship(back_populates="owner")
    transfer_banks: Mapped[list["UserBank"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    transfer_contacts: Mapped[list["TransferContact"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class TransferContact(Base):
    """Счётчик переводов пользователю по номеру телефона.
    Инкрементируется после каждого успешного перевода. Используется, чтобы
    в UI показывать «недавние» получателей (top-3, порог >= 2)."""

    __tablename__ = "transfer_contacts"
    __table_args__ = (UniqueConstraint("user_id", "phone", name="uq_user_phone_contact"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False, default="Получатель")
    transfers_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_transfer_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="transfer_contacts")


class Bank(Base):
    """Справочник банков для переводов по номеру телефона (наш банк + внешние)."""
    __tablename__ = "banks"

    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    label: Mapped[str] = mapped_column(String(100), nullable=False)


class UserBank(Base):
    """Банки, на которые можно переводить этому клиенту (0–5 внешних банков)."""
    __tablename__ = "user_banks"
    __table_args__ = (UniqueConstraint("user_id", "bank_code", name="uq_user_bank"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    bank_code: Mapped[str] = mapped_column(ForeignKey("banks.code", ondelete="CASCADE"), nullable=False, index=True)

    user: Mapped["User"] = relationship(back_populates="transfer_banks")


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (CheckConstraint("balance >= 0", name="ck_account_balance_non_negative"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    account_number: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    # Пользовательское название счёта: авто-«Счёт N», может быть переименован.
    name: Mapped[str] = mapped_column(String(60), nullable=False, default="Счёт")
    account_type: Mapped[AccountType] = mapped_column(Enum(AccountType), nullable=False)
    currency: Mapped[Currency] = mapped_column(Enum(Currency), nullable=False)
    balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    owner: Mapped["User"] = relationship(back_populates="accounts")
    cards: Mapped[list["Card"]] = relationship(back_populates="account", cascade="all, delete-orphan")


class Card(Base):
    """Пластиковая/виртуальная карта, привязанная к счёту.

    Одна карта = один способ доступа к счёту. У счёта может быть несколько карт
    (например, основная дебетовая + виртуальная для интернет-покупок).
    """

    __tablename__ = "cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    # Полный номер карты храним для совместимости с потенциальными автотестами.
    # Учебный проект — не для продакшена.
    number: Mapped[str] = mapped_column(String(19), unique=True, nullable=False)
    last4: Mapped[str] = mapped_column(String(4), nullable=False, index=True)
    holder_name: Mapped[str] = mapped_column(String(80), nullable=False)
    expiry_month: Mapped[int] = mapped_column(Integer, nullable=False)
    expiry_year: Mapped[int] = mapped_column(Integer, nullable=False)
    card_type: Mapped[CardType] = mapped_column(Enum(CardType), nullable=False, default=CardType.DEBIT)
    payment_system: Mapped[CardPaymentSystem] = mapped_column(
        Enum(CardPaymentSystem), nullable=False, default=CardPaymentSystem.VISA
    )
    status: Mapped[CardStatus] = mapped_column(Enum(CardStatus), nullable=False, default=CardStatus.ACTIVE)
    design: Mapped[CardDesign] = mapped_column(
        Enum(CardDesign), nullable=False, default=CardDesign.CLASSIC
    )
    is_contactless: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    account: Mapped["Account"] = relationship(back_populates="cards")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    from_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True, index=True)
    to_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"), nullable=True, index=True)
    card_id: Mapped[int | None] = mapped_column(ForeignKey("cards.id"), nullable=True, index=True)
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[Currency] = mapped_column(Enum(Currency), nullable=False)
    status: Mapped[TransactionStatus] = mapped_column(
        Enum(TransactionStatus), default=TransactionStatus.COMPLETED, nullable=False
    )
    initiated_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fee: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
