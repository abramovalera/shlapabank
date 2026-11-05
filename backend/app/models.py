"""Таблицы банка. Статусы и типы хранятся строками — их видно в БД как есть."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app import clock
from app.db import Base

MONEY = Numeric(14, 2)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone: Mapped[str] = mapped_column(String(12), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(100), nullable=False)
    first_name: Mapped[str] = mapped_column(String(30), nullable=False)
    last_name: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(10), default="ACTIVE", nullable=False)  # ACTIVE / BLOCKED
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now, nullable=False)


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(30), nullable=False)
    balance: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0.00"), nullable=False)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now, nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)


class Card(Base):
    """Виртуальная карта: у клиента не больше одной."""

    __tablename__ = "cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), nullable=False)
    number: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    expiry: Mapped[str] = mapped_column(String(5), nullable=False)  # MM/YY
    cvv: Mapped[str] = mapped_column(String(3), nullable=False)
    holder: Mapped[str] = mapped_column(String(60), nullable=False)
    status: Mapped[str] = mapped_column(String(10), default="ACTIVE", nullable=False)  # ACTIVE / BLOCKED
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now, nullable=False)


class Operation(Base):
    __tablename__ = "operations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(15), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # out / in / internal
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    fee: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0.00"), nullable=False)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), nullable=False, index=True)
    to_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    # Получатель — клиент ShlapaBank. Счёт зачисления окончательно выбирается при проведении.
    recipient_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    recipient_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id"))
    recipient_card_id: Mapped[int | None] = mapped_column(ForeignKey("cards.id"))  # перевод на карту ShlapaBank
    related_operation_id: Mapped[int | None] = mapped_column(ForeignKey("operations.id"))
    cp_name: Mapped[str | None] = mapped_column(String(60))
    cp_phone: Mapped[str | None] = mapped_column(String(12))
    cp_bank: Mapped[str | None] = mapped_column(String(40))
    cp_card: Mapped[str | None] = mapped_column(String(25))
    cp_provider: Mapped[str | None] = mapped_column(String(60))
    cp_payer_account: Mapped[str | None] = mapped_column(String(30))
    cp_operator: Mapped[str | None] = mapped_column(String(30))
    message: Mapped[str | None] = mapped_column(String(70))
    decline_code: Mapped[str | None] = mapped_column(String(40))
    decline_message: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now, nullable=False, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)


class SmsCode(Base):
    """Отправленная SMS с кодом: для входа (challenge_id) или для операции (operation_id)."""

    __tablename__ = "sms_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(10), nullable=False)  # LOGIN / OPERATION
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    challenge_id: Mapped[str | None] = mapped_column(String(36), index=True)
    operation_id: Mapped[int | None] = mapped_column(ForeignKey("operations.id"), index=True)
    code: Mapped[str] = mapped_column(String(4), nullable=False)
    text: Mapped[str] = mapped_column(String(200), nullable=False)
    attempts_left: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # подтверждён или заменён новым
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now, nullable=False)


class Tariff(Base):
    __tablename__ = "tariffs"

    operation_type: Mapped[str] = mapped_column(String(20), primary_key=True)
    title: Mapped[str] = mapped_column(String(60), nullable=False)
    fee_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    fee_min: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    amount_min: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    amount_max: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    needs_code: Mapped[bool] = mapped_column(Boolean, nullable=False)
    sort: Mapped[int] = mapped_column(Integer, nullable=False)


class Limit(Base):
    __tablename__ = "limits"

    name: Mapped[str] = mapped_column(String(20), primary_key=True)  # per_operation / daily / monthly
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)


class ExternalRecipient(Base):
    """Справочник «телефон → клиент другого банка» (эмуляция СБП)."""

    __tablename__ = "external_recipients"

    phone: Mapped[str] = mapped_column(String(12), primary_key=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    bank_name: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(10), default="ACTIVE", nullable=False)  # ACTIVE / BLOCKED


class ExternalCard(Base):
    """Карты других банков: куда переводить и с каких пополнять."""

    __tablename__ = "external_cards"

    number: Mapped[str] = mapped_column(String(16), primary_key=True)
    bank_name: Mapped[str] = mapped_column(String(40), nullable=False)
    holder_name: Mapped[str] = mapped_column(String(60), nullable=False)
    # ACTIVE / BLOCKED / EXPIRED / NO_FUNDS (NO_FUNDS — с неё не пополнить: «недостаточно средств»)
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    # TRANSFER — на неё переводят, TOPUP — с неё пополняют; другим способом карта «не найдена»
    purpose: Mapped[str] = mapped_column(String(10), nullable=False)


class Provider(Base):
    __tablename__ = "providers"

    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    payer_account_length: Mapped[int] = mapped_column(Integer, nullable=False)
    sort: Mapped[int] = mapped_column(Integer, nullable=False)


class MobileOperator(Base):
    __tablename__ = "mobile_operators"

    prefix: Mapped[str] = mapped_column(String(3), primary_key=True)  # первые 3 цифры после +7
    name: Mapped[str] = mapped_column(String(30), nullable=False)
