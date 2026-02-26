from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import AccountType, Currency, TransactionStatus, TransactionType, UserRole, UserStatus


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

    login: str
    password: str


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
    email: EmailStr | None = None
    current_password: str | None = Field(default=None, min_length=8, max_length=30)
    new_password: str | None = Field(default=None, min_length=8, max_length=30)


class AdminCreditRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"amount": "10000.00", "otp_code": "0000"}})

    amount: Decimal = Field(gt=0)
    otp_code: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class AccountTopupRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"amount": "1000.00", "otp_code": "0000"}})

    amount: Decimal = Field(gt=0)
    otp_code: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class TransferCreateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {"from_account_id": 1, "to_account_id": 2, "amount": "1500.00", "otp_code": "0000"}
        }
    )

    from_account_id: int
    to_account_id: int
    amount: Decimal = Field(gt=0)
    otp_code: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class ExchangeRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "from_account_id": 1,
                "to_account_id": 2,
                "amount": "1000.00",
                "otp_code": "0000",
            }
        }
    )

    from_account_id: int
    to_account_id: int
    amount: Decimal = Field(gt=0)
    otp_code: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class TransferByAccountRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "from_account_id": 1,
                "target_account_number": "22020000000000000001",
                "amount": "1500.00",
                "otp_code": "0000",
            }
        }
    )

    from_account_id: int
    target_account_number: str = Field(min_length=1, max_length=32)
    amount: Decimal = Field(gt=0)
    otp_code: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class MobilePaymentRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "account_id": 1,
                "operator": "MTSha",
                "phone": "+79991234567",
                "amount": "300.00",
                "otp_code": "0000",
            }
        }
    )

    account_id: int
    operator: str
    phone: str = Field(pattern=r"^\+7\d{10}$")
    amount: Decimal = Field(gt=0)
    otp_code: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class VendorPaymentRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "account_id": 1,
                "provider": "CityWater",
                "account_number": "123456789012345678",
                "amount": "1200.00",
                "otp_code": "0000",
            }
        }
    )

    account_id: int
    provider: str
    account_number: str
    amount: Decimal = Field(gt=0)
    otp_code: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class AccountCreateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"example": {"account_type": "DEBIT", "currency": "RUB"}}
    )

    account_type: AccountType
    currency: Currency


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
            }
        },
    )

    id: int
    account_number: str
    account_type: AccountType
    currency: Currency
    balance: Decimal


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
