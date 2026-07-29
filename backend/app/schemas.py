from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer, field_validator, model_validator

from app.models import (
    AccountType,
    CardDesign,
    CardPaymentSystem,
    CardStatus,
    CardType,
    Currency,
    TransactionStatus,
    TransactionType,
    UserRole,
    UserStatus,
)

# Общий тип для OTP (4 цифры) — используется во всех запросах с подтверждением
OtpCode = Annotated[str, Field(min_length=4, max_length=4, pattern=r"^\d{4}$")]


class RegisterRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "login": "ivanpetrov",
                "password": "StrongPass123!",
            }
        }
    )

    login: str = Field(min_length=6, max_length=20, pattern=r"^[A-Za-z0-9]+$")
    password: str = Field(min_length=8, max_length=30)


class LoginRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"login": "ivanpetrov", "password": "StrongPass123!"},
                {"login": "+79991234567", "password": "StrongPass123!"},
            ]
        }
    )

    login: str = Field(
        min_length=1,
        max_length=20,
        description="Логин пользователя (6–20 симв.) ИЛИ номер телефона в формате +7XXXXXXXXXX.",
    )
    password: str = Field(min_length=1, max_length=100)


class TokenResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "role": "CLIENT",
            }
        }
    )

    access_token: str
    token_type: str = "bearer"
    role: str | None = None  # ADMIN или CLIENT


class ActionResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"status": "ok", "detail": "account_closed"}})

    status: str = "ok"
    detail: str | None = None


class ApiErrorDetail(BaseModel):
    """Тело ошибки, которое вкладывается в ApiErrorResponse.error."""

    code: str = Field(description="Стабильный snake_case-код, для программной обработки клиентом.")
    message: str = Field(description="Человекочитаемое сообщение на русском для показа пользователю.")
    field: str | None = Field(
        default=None,
        description="Для валидационных ошибок — имя поля-виновника. Для бизнес-ошибок null.",
    )


class ApiErrorResponse(BaseModel):
    """Единый формат для всех ошибок API (4xx, 5xx).

    Пример: `{"error":{"code":"insufficient_funds","message":"Недостаточно средств","field":null}}`
    """

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "error": {
                    "code": "insufficient_funds",
                    "message": "Недостаточно средств",
                    "field": None,
                }
            }
        }
    )

    error: ApiErrorDetail


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    login: str
    email: EmailStr | None = None
    role: UserRole
    status: UserStatus
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    avatar_color: str | None = None
    date_of_birth: str | None = None
    theme: str = "dark"
    sbp_primary_bank: str = "SHLAPABANK"

    @field_validator("email", mode="before")
    @classmethod
    def empty_email_to_none(cls, v):
        if v is None:
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @field_serializer("first_name", "last_name")
    def serialize_empty_str(self, v: str | None) -> str:
        return v if v else ""


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "first_name": "Ivan",
                "last_name": "Petrov",
                "phone": "+79991234567",
                "email": "ivan.petrov@example.com",
                "current_password": "StrongPass123!",
                "new_password": "NewStrongPass123!",
            }
        }
    )

    first_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
        pattern=r"^[A-Za-zА-Яа-яЁё]+$",
    )
    last_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
        pattern=r"^[A-Za-zА-Яа-яЁё]+$",
    )
    phone: str | None = Field(default=None, pattern=r"^\+7\d{10}$")

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone_field(cls, v: str | None) -> str | None:
        if v is None:
            return v
        from app.phone_utils import normalize_phone
        return normalize_phone(v) or v

    email: EmailStr | None = None
    current_password: str | None = Field(default=None, min_length=8, max_length=30)
    new_password: str | None = Field(default=None, min_length=8, max_length=30)
    avatar_color: str | None = Field(default=None, max_length=20)
    date_of_birth: str | None = Field(default=None, max_length=10, pattern=r"^\d{4}-\d{2}-\d{2}$")
    theme: Literal["dark", "light"] | None = None
    sbp_primary_bank: str | None = Field(default=None, max_length=32)


class AdminCreditRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"amount": "10000.00"}})

    amount: Decimal = Field(gt=0)


class AccountTopupRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"example": {"amount": "1000.00", "otp_code": "1234", "purpose": "salary"}}
    )

    amount: Decimal = Field(gt=0)
    otp_code: OtpCode
    purpose: Literal["salary", "gift"] | None = None


class TransferCreateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"from_account_id": 1, "to_account_id": 2, "amount": "1500.00"}
        }
    )

    from_account_id: int
    to_account_id: int
    amount: Decimal = Field(gt=0)
    otp_code: OtpCode | None = None  # не требуется для перевода между своими счетами


class ExchangeRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "from_account_id": 1,
                "to_account_id": 2,
                "amount": "1000.00",
                "otp_code": "1234",
            }
        }
    )

    from_account_id: int
    to_account_id: int
    amount: Decimal = Field(gt=0)
    otp_code: OtpCode


class TransferByAccountRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "from_account_id": 1,
                "target_account_number": "2202000000000001",
                "amount": "1500.00",
                "otp_code": "1234",
            }
        }
    )

    from_account_id: int
    target_account_number: str = Field(min_length=16, max_length=16, pattern=r"^\d{16}$")
    amount: Decimal = Field(gt=0)
    otp_code: OtpCode


class TransferByAccountCheckResponse(BaseModel):
    """Результат проверки счёта: найден в нашем банке или нет."""

    found: bool
    masked: str  # например "••••1234"


class MobilePaymentRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "account_id": 1,
                "operator": "MTSha",
                "phone": "+79991234567",
                "amount": "300.00",
                "otp_code": "1234",
            }
        }
    )

    account_id: int
    operator: str
    phone: str = Field(pattern=r"^\+7\d{10}$")
    amount: Decimal = Field(gt=0)
    otp_code: OtpCode

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone_field(cls, v: str) -> str:
        if not v:
            return v
        from app.phone_utils import normalize_phone
        return normalize_phone(v) or v


class VendorPaymentRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "account_id": 1,
                "provider": "CityWater",
                "account_number": "123456789012345678",
                "amount": "1200.00",
                "otp_code": "1234",
            }
        }
    )

    account_id: int
    provider: str
    account_number: str = Field(min_length=1, max_length=30, pattern=r"^\d+$")
    amount: Decimal = Field(gt=0)
    otp_code: OtpCode
    # Свободная строка для дополнительных данных платежа:
    # показания счётчиков (ЖКХ), ФИО студента (образование), назначение (благотворительность) и т.п.
    # Не участвует в валидации бизнес-правил — просто дописывается в описание транзакции,
    # чтобы клиент видел контекст в истории и чеке.
    extras: str | None = Field(default=None, max_length=200)


class AccountCreateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"account_type": "DEBIT", "currency": "RUB", "name": "Зарплатный", "accept_terms": True}
        }
    )

    account_type: AccountType
    currency: Currency
    name: str | None = Field(default=None, max_length=60)
    accept_terms: bool = True


class AccountUpdateRequest(BaseModel):
    """Изменение полей счёта (сейчас — только имя)."""

    name: str = Field(min_length=1, max_length=60)


class PrimaryAccountsRequest(BaseModel):
    """Список ID счетов, помечаемых как приоритетные (по одному на валюту)."""

    account_ids: list[int] = Field(min_length=0, max_length=4, description="ID счетов (RUB, USD, EUR, CNY)")


class AccountPublic(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": 1,
                "name": "Зарплатный",
                "account_number": "2202000000004021",
                "account_type": "DEBIT",
                "currency": "RUB",
                "balance": "0.00",
                "is_primary": False,
                "cards_count": 1,
            }
        },
    )

    id: int
    name: str
    account_number: str
    account_type: AccountType
    currency: Currency
    balance: Decimal
    is_primary: bool = False
    cards_count: int = 0

    @model_validator(mode="before")
    @classmethod
    def compute_cards_count(cls, data: object):
        if hasattr(data, "cards"):
            try:
                # noinspection PyUnresolvedReferences
                cards = [c for c in data.cards if getattr(c, "status", None) != CardStatus.EXPIRED]
                setattr(data, "cards_count", len(cards))
            except Exception:
                pass
        return data


class CardPublic(BaseModel):
    """Публичное представление карты (без полного номера)."""

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": 1,
                "account_id": 1,
                "last4": "4021",
                "holder_name": "IVAN PETROV",
                "expiry_month": 9,
                "expiry_year": 2028,
                "card_type": "DEBIT",
                "payment_system": "VISA",
                "status": "ACTIVE",
                "is_contactless": True,
            }
        },
    )

    id: int
    account_id: int
    last4: str
    holder_name: str
    expiry_month: int
    expiry_year: int
    card_type: CardType
    payment_system: CardPaymentSystem
    status: CardStatus
    design: CardDesign = CardDesign.CLASSIC
    is_contactless: bool


class CardLimitEntry(BaseModel):
    """Один лимит: включён/выключен + сумма в валюте счёта карты."""

    enabled: bool
    amount: Decimal = Field(ge=0, description="Сумма лимита, не отрицательная")


class CardLimitsPayload(BaseModel):
    """Все 7 лимитов карты одним объектом.

    Клиент присылает всё скопом при сохранении, бэк перезаписывает целиком —
    так проще, чем PATCH с частичным обновлением.
    """

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "monthly":          {"enabled": True,  "amount": "500000"},
                "daily":            {"enabled": True,  "amount": "100000"},
                "online":           {"enabled": True,  "amount": "50000"},
                "atm":              {"enabled": True,  "amount": "100000"},
                "contactless":      {"enabled": True,  "amount": "5000"},
                "abroad":           {"enabled": False, "amount": "50000"},
                "online_purchases": {"enabled": True,  "amount": "30000"},
            }
        }
    )

    monthly: CardLimitEntry
    daily: CardLimitEntry
    online: CardLimitEntry
    atm: CardLimitEntry
    contactless: CardLimitEntry
    abroad: CardLimitEntry
    online_purchases: CardLimitEntry


class CardCreateRequest(BaseModel):
    """Заявка на выпуск новой карты, привязанной к существующему счёту.

    payment_system опциональна — если не указана, подбирается по валюте счёта
    (RUB → MIR, иначе → VISA).
    """

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "account_id": 1,
                "card_type": "VIRTUAL",
                "design": "EMERALD",
                "accept_terms": True,
            }
        }
    )

    account_id: int
    card_type: CardType = CardType.DEBIT
    payment_system: CardPaymentSystem | None = None
    design: CardDesign = CardDesign.CLASSIC
    accept_terms: bool = True


class CardUpdateRequest(BaseModel):
    """Частичное изменение карты. Все поля опциональные:
    - status: блокировка/разблокировка
    - design: смена оформления
    """

    status: CardStatus | None = None
    design: CardDesign | None = None


class UserBanksUpdateRequest(BaseModel):
    """Список кодов банков для перевода (0–5, только внешние из справочника)."""
    bank_codes: list[str] = Field(min_length=0)


class BankOption(BaseModel):
    id: str
    label: str


class TransferByPhoneCheckResponse(BaseModel):
    """Если получатель в нашем банке — availableBanks содержит ShlapaBank и его 0–5 назначенных банков.
    Иначе — все внешние банки. primary_bank_id — «основной» банк получателя (для отображения бейджа)."""

    inOurBank: bool
    availableBanks: list[BankOption]
    recipientHint: str | None = None  # Имя-подсказка получателя (маскированное)
    primaryBankId: str | None = None  # Код банка, отмеченного получателем как основной


class TransferByPhoneRequest(BaseModel):
    from_account_id: int | None = None
    from_card_id: int | None = None
    phone: str = Field(pattern=r"^\+7\d{10}$")
    amount: Decimal = Field(gt=0)
    recipient_bank_id: str = Field(min_length=1, max_length=32)
    otp_code: OtpCode
    comment: str | None = Field(default=None, max_length=70)

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone_field(cls, v: str) -> str:
        if not v:
            return v
        from app.phone_utils import normalize_phone
        return normalize_phone(v) or v


class TransferByCardCheckResponse(BaseModel):
    """Проверка карты получателя.
    in_our_bank=true — карта найдена в ShlapaBank. Остальные поля заполнены в этом случае.
    """

    found: bool
    in_our_bank: bool
    masked: str
    holder_hint: str | None = None
    currency: str | None = None
    is_own: bool = False
    is_blocked: bool = False


class TransferByCardRequest(BaseModel):
    from_card_id: int
    to_card_number: str = Field(min_length=16, max_length=19, pattern=r"^\d{16,19}$")
    amount: Decimal = Field(gt=0)
    otp_code: OtpCode
    comment: str | None = Field(default=None, max_length=70)


class RecentPhoneContact(BaseModel):
    """Часто используемый получатель по номеру телефона (для авто-подстановки)."""

    phone: str
    display_name: str
    transfers_count: int
    last_transfer_at: datetime | None = None


class TransactionMoney(BaseModel):
    """Сумма операции: основная сумма, комиссия, итого и валюта."""

    amount: str = Field(description="Сумма операции")
    fee: str = Field(description="Комиссия (0 если нет)")
    total: str = Field(description="Итого (amount + fee)")
    currency: str = Field(description="Код валюты (RUB, USD, ...)")


class TransactionPublic(BaseModel):
    """Ответ по операции: минимум полей, деньги во вложенном объекте money."""

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": 15,
                "type": "TRANSFER",
                "money": {
                    "amount": "1500.00",
                    "fee": "0.00",
                    "total": "1500.00",
                    "currency": "RUB",
                },
                "description": "p2p_transfer",
                "created_at": "2026-02-26T12:34:56.000000",
                "from_account_id": 1,
                "to_account_id": 2,
                "status": "COMPLETED",
            }
        },
    )

    id: int
    type: TransactionType
    money: TransactionMoney
    description: str | None = None
    created_at: datetime
    from_account_id: int | None
    to_account_id: int | None
    status: TransactionStatus

    @model_validator(mode="before")
    @classmethod
    def from_orm_build_money(cls, data: object):
        """Строит ответ из ORM: считает money из amount/fee/currency, убирает initiated_by."""
        if not hasattr(data, "amount"):
            return data
        orm = data
        amount = Decimal(orm.amount)
        fee = Decimal(orm.fee) if getattr(orm, "fee", None) is not None else Decimal("0")
        total = amount + fee
        currency = getattr(orm.currency, "value", None) or str(orm.currency)
        q = Decimal("0.01")
        return {
            "id": orm.id,
            "type": orm.type,
            "money": {
                "amount": str(amount.quantize(q)),
                "fee": str(fee.quantize(q)),
                "total": str(total.quantize(q)),
                "currency": currency,
            },
            "description": getattr(orm, "description", None),
            "created_at": orm.created_at,
            "from_account_id": orm.from_account_id,
            "to_account_id": orm.to_account_id,
            "status": orm.status,
        }
