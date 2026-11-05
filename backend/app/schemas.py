"""Запросы и ответы API. Проверки формата — здесь (ошибка 422 с полем), бизнес-правила — в роутах."""

import re
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field

from app.rules import PHONE_MESSAGE, parse_phone

NAME_RE = re.compile(r"^[A-Za-zА-Яа-яЁё]+(?:[ -][A-Za-zА-Яа-яЁё]+)*$")
# Спецсимвол — не буква (ни латинская, ни русская), не цифра и не пробел — так же считает интерфейс.
PASSWORD_RE = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-zА-Яа-яЁё0-9\s])\S{8,30}$")
AMOUNT_RE = re.compile(r"^[0-9]+(\.[0-9]+)?$")
DIGITS_RE = re.compile(r"^[0-9]+$")  # только 0–9: «полноширинные» и арабские цифры не подходят
MAX_AMOUNT = Decimal("10000000000")  # заведомо больше любого тарифа; дальше — «слишком большая сумма»


def _required(v):
    """Пустая строка или одни пробелы — «Обязательное поле», как у всех полей (до проверки формата)."""
    if isinstance(v, str) and not v.strip():
        raise ValueError("Обязательное поле")
    return v


def _phone(v: str) -> str:
    # Тот же разбор, что в поиске получателя: +79001234567, 89001234567, 9001234567, «900 123-45-67».
    phone = parse_phone(v)
    if phone is None:
        raise ValueError(PHONE_MESSAGE)
    return phone


def _person_name(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("Обязательное поле")
    if len(v) > 30:
        raise ValueError("Не больше 30 символов")
    if not NAME_RE.match(v):
        raise ValueError("Только буквы, пробел и дефис")
    return v


def _password(v: str) -> str:
    if not PASSWORD_RE.match(v):
        raise ValueError("Пароль: 8–30 символов без пробелов, строчная и заглавная латинская буква, цифра "
                         "и спецсимвол")
    return v


def _account_name(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("Обязательное поле")
    if len(v) > 30:
        raise ValueError("Не больше 30 символов")
    return v


def _amount_raw(v):
    """До разбора в Decimal: только обычная запись числа, без экспоненты, NaN и бесконечности."""
    _required(v)
    if isinstance(v, bool):
        raise ValueError("Сумма — число, например 1500 или 1500.50")
    if isinstance(v, (int, float)):
        v = repr(v) if isinstance(v, float) else str(v)
    if not isinstance(v, str) or not AMOUNT_RE.match(v.strip().lstrip("-")):
        raise ValueError("Сумма — число, например 1500 или 1500.50")
    if v.strip().startswith("-"):
        raise ValueError("Сумма должна быть больше нуля")
    return v.strip()


def _amount(v: Decimal) -> Decimal:
    if v <= 0:
        raise ValueError("Сумма должна быть больше нуля")
    if v.as_tuple().exponent < -2:
        raise ValueError("Не больше двух знаков после запятой")
    if v >= MAX_AMOUNT:
        raise ValueError("Слишком большая сумма")
    return v.quantize(Decimal("0.01"))


def _digits(v: str) -> str:
    v = v.replace(" ", "")
    if not v:
        raise ValueError("Обязательное поле")
    if not DIGITS_RE.match(v):
        raise ValueError("Только цифры")
    return v


def _trimmed(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("Обязательное поле")
    return v


def _expiry(v: str) -> str:
    v = _required(v).strip()
    if not re.fullmatch(r"(0[1-9]|1[0-2])/[0-9]{2}", v):
        raise ValueError("Срок действия — ММ/ГГ, например 12/30")
    return v


def _cvc(v: str) -> str:
    v = _required(v).strip()
    if not re.fullmatch(r"[0-9]{3}", v):
        raise ValueError("CVC — 3 цифры")
    return v


def _code(v: str) -> str:
    v = _required(v).strip()
    if not re.fullmatch(r"[0-9]{4}", v):
        raise ValueError("Код — 4 цифры")
    return v


PHONE_HELP = "Телефон: +79001234567, 89001234567, 9001234567 или с пробелами и дефисами"
Phone = Annotated[str, Field(examples=["+79991234567"], description=PHONE_HELP), AfterValidator(_required),
                  AfterValidator(_phone)]
PersonName = Annotated[str, Field(description="1–30 символов: буквы, пробел, дефис"), AfterValidator(_person_name)]
Password = Annotated[str, Field(examples=["Start1234!"],
                                description="8–30 символов без пробелов: строчная и заглавная латинская буква, "
                                            "цифра, спецсимвол"), AfterValidator(_password)]
AccountName = Annotated[str, Field(examples=["Ремонт"], description="1–30 символов, не повторяется у клиента"),
                        AfterValidator(_account_name)]
AccountId = Annotated[int, Field(examples=[1], description="id своего открытого счёта (GET /accounts)")]
Amount = Annotated[Decimal, Field(examples=["1500.00"], description="Больше 0, не больше 2 знаков после точки; "
                                                                     "границы — в GET /tariffs"), BeforeValidator(_amount_raw), AfterValidator(_amount)]
Digits = Annotated[str, AfterValidator(_digits)]
Code = Annotated[str, Field(examples=["1234"], description="4 цифры из SMS"), AfterValidator(_code)]


class ErrorBody(BaseModel):
    code: str = Field(description="Постоянный код ошибки — по нему проверять в автотестах")
    message: str = Field(description="Текст для пользователя")
    field: str | None = Field(None, description="Поле запроса, к которому относится ошибка, или null")


class ErrorResponse(BaseModel):
    """Формат любой ошибки. В `error` бывают доп. поля: attempts_left, resend_available_at, amount_min, amount_max."""
    error: ErrorBody


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------- вход ----------

class RegisterIn(Strict):
    phone: Phone = Field(examples=["+79005550123"], description="Свободный номер. " + PHONE_HELP)
    password: Password
    first_name: PersonName = Field(examples=["Иван"])
    last_name: PersonName = Field(examples=["Иванов"])


class LoginIn(Strict):
    phone: Phone
    password: str = Field(min_length=1, max_length=30, examples=["FullClient1!"])


class LoginConfirmIn(Strict):
    challenge_id: str = Field(min_length=1, max_length=36, description="Из ответа POST /auth/login")
    code: Code


class ChallengeIn(Strict):
    challenge_id: str = Field(min_length=1, max_length=36)


class ChallengeOut(BaseModel):
    challenge_id: str
    phone_masked: str
    expires_at: str
    resend_available_at: str
    resend_in_seconds: int = Field(description="Через сколько секунд можно запросить новый код")
    expires_in_seconds: int = Field(description="Через сколько секунд код истечёт")


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    phone: str
    first_name: str
    last_name: str
    status: str


# ---------- счета и карта ----------

class AccountIn(Strict):
    name: AccountName


class AccountOut(BaseModel):
    id: int
    number: str
    name: str
    balance: str
    has_card: bool
    created_at: str


class CardIn(Strict):
    account_id: AccountId


class CardOut(BaseModel):
    id: int
    number_masked: str
    last4: str
    expiry: str
    holder: str
    account_id: int
    status: str


class CardRequisitesOut(BaseModel):
    number: str
    expiry: str
    cvv: str
    holder: str


class RecipientOut(BaseModel):
    name: str
    bank_name: str
    own_bank: bool
    fee_percent: str
    fee_min: str


# ---------- операции ----------

class OwnTransferIn(Strict):
    from_account_id: AccountId
    to_account_id: int = Field(examples=[2], description="id другого своего счёта")
    amount: Amount


class PhoneTransferIn(Strict):
    from_account_id: AccountId
    phone: Phone = Field(examples=["+79000000001"], description="Телефон получателя. " + PHONE_HELP)
    amount: Amount
    message: str | None = Field(default=None, max_length=70, examples=["За обед"], description="До 70 символов")


class CardTransferIn(Strict):
    from_account_id: AccountId
    card_number: Digits = Field(examples=["4276000000002013"], description="16 цифр, можно с пробелами")
    amount: Amount


class MobileIn(Strict):
    from_account_id: AccountId
    phone: Phone = Field(examples=["+79161234567"], description="Номер для пополнения. " + PHONE_HELP)
    amount: Amount


class UtilityIn(Strict):
    from_account_id: AccountId
    provider_code: Annotated[str, AfterValidator(_trimmed)] = Field(max_length=20, examples=["vodokanal"],
                               description="Код из GET /dictionary/providers")
    payer_account: Digits = Field(examples=["1002003001"], description="Лицевой счёт: только цифры, длина — у поставщика")
    amount: Amount


class TopupIn(Strict):
    to_account_id: AccountId
    card_number: Digits = Field(examples=["4276000000001015"], description="Карта другого банка, 16 цифр")
    expiry: Annotated[str, AfterValidator(_expiry)] = Field(examples=["12/30"], description="ММ/ГГ, не в прошлом")
    cvc: Annotated[str, AfterValidator(_cvc)] = Field(examples=["123"], description="3 цифры")
    amount: Amount


class ConfirmIn(Strict):
    code: Code


class AccountRef(BaseModel):
    id: int
    name: str
    number_masked: str


class Counterparty(BaseModel):
    name: str | None = None
    phone: str | None = None
    bank_name: str | None = None
    card_masked: str | None = None
    provider_name: str | None = None
    payer_account: str | None = None
    operator_name: str | None = None


class DeclineReason(BaseModel):
    code: str
    message: str


class CodeInfo(BaseModel):
    expires_at: str
    attempts_left: int
    resend_available_at: str
    resend_in_seconds: int = Field(description="Через сколько секунд можно запросить новый код")
    expires_in_seconds: int = Field(description="Через сколько секунд код истечёт")


class OperationOut(BaseModel):
    id: int
    number: str
    type: str
    status: str
    direction: str
    amount: str
    fee: str
    total: str
    title: str
    subtitle: str
    account: AccountRef
    to_account: AccountRef | None
    counterparty: Counterparty
    message: str | None
    decline_reason: DeclineReason | None
    code: CodeInfo | None
    created_at: str
    completed_at: str | None


class OperationsPage(BaseModel):
    items: list[OperationOut]
    total: int


# ---------- тарифы и справочники ----------

class TariffOut(BaseModel):
    operation_type: str
    title: str
    fee_percent: str
    fee_min: str
    amount_min: str
    amount_max: str
    needs_code: bool


class LimitUsage(BaseModel):
    limit: str
    used: str
    left: str


class LimitsOut(BaseModel):
    per_operation: str
    daily: LimitUsage
    monthly: LimitUsage


class ProviderOut(BaseModel):
    code: str
    name: str
    category: str
    payer_account_length: int


class OperatorOut(BaseModel):
    name: str
    prefixes: list[str]


# ---------- тестовое API ----------

class SmsOut(BaseModel):
    phone: str
    text: str
    code: str
    purpose: str
    operation_id: int | None
    created_at: str


class AddMinutesIn(Strict):
    minutes: int = Field(strict=True, ge=1, le=10080, examples=[6], description="Сколько минут прибавить (до недели)")


class TimeOut(BaseModel):
    now_msk: str = Field(examples=["2026-11-03 17:30:00"], description="Время банка по Москве")
    now_utc: str = Field(examples=["2026-11-03T14:30:00Z"], description="Время банка в UTC, как во всех ответах API")
    shifted: bool = Field(description="Время банка отличается от настоящего")
