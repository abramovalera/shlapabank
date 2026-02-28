from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer, field_validator

from app.models import AccountType, Currency, TransactionStatus, TransactionType, UserRole, UserStatus

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
        json_schema_extra={"example": {"login": "ivanpetrov", "password": "StrongPass123!"}}
    )

    login: str = Field(min_length=1, max_length=20)
    password: str = Field(min_length=1, max_length=100)


class TokenResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
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


class AdminCreditRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"amount": "10000.00"}})

    amount: Decimal = Field(gt=0)


class AccountTopupRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"example": {"amount": "1000.00", "otp_code": "1234", "purpose": "salary"}}
    )

    amount: Decimal = Field(gt=0)
    otp_code: OtpCode
    purpose: str | None = Field(default=None, max_length=32, pattern=r"^[a-z_]+$")


class TransferCreateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"from_account_id": 1, "to_account_id": 2, "amount": "1500.00", "otp_code": "1234"}
        }
    )

    from_account_id: int
    to_account_id: int
    amount: Decimal = Field(gt=0)
    otp_code: OtpCode


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
                "target_account_number": "22020000000000000001",
                "amount": "1500.00",
                "otp_code": "1234",
            }
        }
    )

    from_account_id: int
    target_account_number: str = Field(min_length=1, max_length=32)
    amount: Decimal = Field(gt=0)
    otp_code: OtpCode


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


class AccountCreateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"example": {"account_type": "DEBIT", "currency": "RUB"}}
    )

    account_type: AccountType
    currency: Currency


class PrimaryAccountsRequest(BaseModel):
    """Список ID счетов, помечаемых как приоритетные (по одному на валюту)."""

    account_ids: list[int] = Field(min_length=0, max_length=4, description="ID счетов (RUB, USD, EUR, CNY)")


class AccountPublic(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": 1,
                "account_number": "0f3d2a9b84c5d1e7a6f2",
                "account_type": "DEBIT",
                "currency": "RUB",
                "balance": "0.00",
                "is_primary": False,
            }
        },
    )

    id: int
    account_number: str
    account_type: AccountType
    currency: Currency
    balance: Decimal
    is_primary: bool = False


class UserBanksUpdateRequest(BaseModel):
    """Список кодов банков для перевода (0–5, только внешние из справочника)."""
    bank_codes: list[str] = Field(max_length=5, min_length=0)


class BankOption(BaseModel):
    id: str
    label: str


class TransferByPhoneCheckResponse(BaseModel):
    """Если получатель в нашем банке — availableBanks содержит название банка (ShlapaBank) и 0–5 назначенных банков. Иначе — все внешние банки."""

    inOurBank: bool
    availableBanks: list[BankOption]


class TransferByPhoneRequest(BaseModel):
    from_account_id: int
    phone: str = Field(pattern=r"^\+7\d{10}$")
    amount: Decimal = Field(gt=0)
    recipient_bank_id: str = Field(min_length=1, max_length=32)
    otp_code: OtpCode

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_phone_field(cls, v: str) -> str:
        if not v:
            return v
        from app.phone_utils import normalize_phone
        return normalize_phone(v) or v


class TransactionPublic(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": 15,
                "from_account_id": 1,
                "to_account_id": 2,
                "type": "TRANSFER",
                "amount": "1500.00",
                "currency": "RUB",
                "status": "COMPLETED",
                "initiated_by": 7,
                "description": "p2p_transfer",
                "created_at": "2026-02-26T12:34:56.000000",
            }
        },
    )

    id: int
    from_account_id: int | None
    to_account_id: int | None
    type: TransactionType
    amount: Decimal
    currency: Currency
    status: TransactionStatus
    initiated_by: int
    description: str | None = None
    created_at: datetime
