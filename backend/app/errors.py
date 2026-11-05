"""Единый формат ошибок: {"error": {"code", "message", "field", ...}}."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

MESSAGES: dict[str, str] = {
    # общие
    "validation_error": "Проверьте введённые данные",
    "invalid_token": "Нужно войти заново",
    "token_expired": "Сессия истекла, войдите снова",
    "invalid_body": "Некорректное тело запроса: нужен JSON в кодировке UTF-8",
    "not_found": "Не найдено",
    "method_not_allowed": "Метод не поддерживается",
    "internal_error": "Внутренняя ошибка сервера",
    # вход и регистрация
    "client_not_found": "Клиент с таким телефоном не найден",
    "phone_taken": "Этот номер уже зарегистрирован",
    "invalid_credentials": "Неверный телефон или пароль",
    "user_blocked": "Пользователь заблокирован",
    "challenge_not_found": "Запрос на вход не найден, начните заново",
    "invalid_code": "Неверный код",
    "code_expired": "Срок действия кода истёк, запросите новый",
    "code_attempts_exceeded": "Превышено число попыток ввода кода",
    "resend_too_early": "Новый код можно запросить чуть позже",
    # счета и карта
    "account_not_found": "Счёт не найден",
    "accounts_limit": "Можно открыть не больше 3 счетов",
    "account_name_taken": "Счёт с таким названием уже есть",
    "account_not_empty": "Закрыть можно только счёт с нулевым балансом",
    "account_has_card": "К счёту привязана карта — сначала привяжите её к другому счёту",
    "last_account": "Нельзя закрыть единственный счёт",
    "card_not_found": "Карта не найдена",
    "card_already_exists": "Виртуальная карта уже выпущена",
    # получатели
    "recipient_not_found": "Получатель с таким номером не найден",
    "recipient_blocked": "Получатель не может принимать переводы",
    "self_transfer": "Для перевода себе используйте «Между своими»",
    "invalid_card_number": "Неверный номер карты",
    "card_blocked": "Карта заблокирована",
    "card_expired": "Срок действия карты истёк",
    "recipient_no_account": "У получателя нет открытого счёта",
    # операции
    "operation_not_found": "Операция не найдена",
    "operation_not_waiting": "Операция уже завершена",
    "insufficient_funds": "Недостаточно средств",
    "amount_out_of_range": "Сумма вне допустимого диапазона",
    "limit_per_operation": "Превышен лимит на одну операцию",
    "limit_daily": "Превышен дневной лимит",
    "limit_monthly": "Превышен месячный лимит",
    "same_account": "Счета списания и зачисления совпадают",
    "operator_not_found": "Оператор для этого номера не найден",
    "provider_not_found": "Поставщик не найден",
    "invalid_payer_account": "Неверный номер лицевого счёта",
    "own_bank_card": "Пополнить можно только с карты другого банка",
    "card_no_funds": "Банк отправителя отклонил операцию: недостаточно средств на карте",
    "card_expiry_mismatch": "Неверный срок действия карты",
    "cancelled_by_user": "Операция отменена",
}


_RESPONSE_TEXT = {400: "Бизнес-ошибка", 401: "Нет токена, токен испорчен или истёк", 403: "Пользователь заблокирован",
                  404: "Не найдено", 409: "Конфликт с текущим состоянием", 422: "Неверный формат поля",
                  429: "Слишком часто — новый код из SMS ещё нельзя запросить"}


# Статус, поле и доп. поля ответа для примеров в Swagger (текст — из MESSAGES, кроме случаев с подстановкой).
_EXAMPLES: dict[str, tuple[int, str | None, dict]] = {
    "validation_error": (422, None, {"message": "Обязательное поле"}),
    "invalid_token": (401, None, {}),
    "token_expired": (401, None, {}),
    "user_blocked": (403, None, {}),
    "client_not_found": (404, None, {}),
    "phone_taken": (409, "phone", {}),
    "invalid_credentials": (400, None, {}),
    "challenge_not_found": (404, None, {}),
    "invalid_code": (400, "code", {"message": "Неверный код. Осталось попыток: 2", "attempts_left": 2}),
    "code_expired": (400, "code", {"attempts_left": 3}),
    "code_attempts_exceeded": (400, "code", {"attempts_left": 0}),
    "resend_too_early": (429, None, {"resend_available_at": "2026-11-05T10:01:00Z", "resend_in_seconds": 42}),
    "account_not_found": (404, "from_account_id", {}),
    "accounts_limit": (409, None, {}),
    "account_name_taken": (409, "name", {}),
    "account_not_empty": (409, None, {}),
    "account_has_card": (409, None, {}),
    "last_account": (409, None, {}),
    "card_not_found": (404, None, {}),
    "card_already_exists": (409, None, {}),
    "recipient_not_found": (404, "phone", {}),
    "recipient_blocked": (400, "phone", {}),
    "self_transfer": (400, "phone", {}),
    "invalid_card_number": (422, "card_number", {}),
    "card_blocked": (400, "card_number", {}),
    "card_expired": (400, "card_number", {}),
    "recipient_no_account": (400, "phone", {}),
    "operation_not_found": (404, None, {}),
    "operation_not_waiting": (409, None, {}),
    "insufficient_funds": (400, "amount", {}),
    "amount_out_of_range": (400, "amount", {"message": "Сумма должна быть от 10,00 ₽ до 100 000,00 ₽",
                                             "amount_min": "10.00", "amount_max": "100000.00"}),
    "limit_per_operation": (400, "amount", {}),
    "limit_daily": (400, "amount", {}),
    "limit_monthly": (400, "amount", {}),
    "same_account": (400, "to_account_id", {}),
    "operator_not_found": (404, "phone", {}),
    "provider_not_found": (404, "provider_code", {}),
    "invalid_payer_account": (422, "payer_account", {"message": "Лицевой счёт — 10 цифр"}),
    "own_bank_card": (400, "card_number", {}),
}


def errors_for(*codes: str) -> dict:
    """Ответы-ошибки для Swagger: только коды, которые реально бывают у адреса, по примеру на каждый.
    Запись `код:поле` — пример с другим полем, `код@статус` — с другим статусом (card_expired бывает 400 и 422)."""
    from app.schemas import ErrorResponse  # здесь, чтобы не было циклического импорта
    responses: dict[int, dict] = {}
    for item in codes:
        item, _, status_override = item.partition("@")
        code, _, field_override = item.partition(":")
        status, field, extra = _EXAMPLES[code]
        status = int(status_override) if status_override else status
        extra = dict(extra)
        message = extra.pop("message", MESSAGES.get(code, code))
        body = _body(code, message, field_override or field, **extra)
        resp = responses.setdefault(status, {"model": ErrorResponse, "description": _RESPONSE_TEXT[status],
                                             "content": {"application/json": {"examples": {}}}})
        resp["content"]["application/json"]["examples"][code] = {"summary": message, "value": body}
    return responses


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str | None = None, field: str | None = None, **extra):
        self.status = status
        self.code = code
        self.message = message or MESSAGES.get(code, code)
        self.field = field
        self.extra = extra


def _body(code: str, message: str, field: str | None = None, **extra) -> dict:
    return {"error": {"code": code, "message": message, "field": field, **extra}}


# Понятные тексты для типовых ошибок формата (pydantic). {ge}, {le}, {max_length} — из контекста ошибки.
_PYDANTIC_MESSAGES = {
    "missing": "Обязательное поле",
    "string_too_short": "Обязательное поле",
    "string_too_long": "Не больше {max_length} символов",
    "string_pattern_mismatch": "Неверный формат",
    "string_type": "Должно быть строкой",
    "decimal_parsing": "Должно быть числом",
    "decimal_type": "Должно быть числом",
    "finite_number": "Должно быть числом",
    "int_parsing": "Должно быть целым числом",
    "int_type": "Должно быть целым числом",
    "int_from_float": "Должно быть целым числом",
    "greater_than": "Должно быть больше {gt}",
    "greater_than_equal": "Должно быть не меньше {ge}",
    "less_than_equal": "Должно быть не больше {le}",
    "decimal_max_places": "Не больше двух знаков после запятой",
    "date_parsing": "Дата в формате ГГГГ-ММ-ДД",
    "date_from_datetime_parsing": "Дата в формате ГГГГ-ММ-ДД",
    "date_type": "Дата в формате ГГГГ-ММ-ДД",
    "json_invalid": "Некорректный JSON",
    "model_type": "Тело запроса — JSON-объект",
    "model_attributes_type": "Тело запроса — JSON-объект",
    "dict_type": "Тело запроса — JSON-объект",
    "extra_forbidden": "Лишнее поле",
    "enum": "Недопустимое значение",
    "literal_error": "Недопустимое значение",
    "bool_parsing": "Должно быть true или false",
}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status, content=_body(exc.code, exc.message, exc.field, **exc.extra))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        err = exc.errors()[0]
        kind = err.get("type", "")
        # В loc могут быть служебные части и номера позиций (битый JSON) — полем они не являются.
        loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path") and not isinstance(p, int)]
        field = None if kind == "json_invalid" else (".".join(loc) or None)
        if kind == "value_error":
            # Свои проверки в схемах: текст после «Value error, ».
            msg = err.get("msg", "").removeprefix("Value error, ")
        elif kind in _PYDANTIC_MESSAGES:
            ctx = {k: v for k, v in (err.get("ctx") or {}).items()}
            try:
                msg = _PYDANTIC_MESSAGES[kind].format(**ctx)
            except (KeyError, IndexError):
                msg = _PYDANTIC_MESSAGES[kind].split(" {")[0]
        else:
            msg = MESSAGES["validation_error"]
        return JSONResponse(status_code=422, content=_body("validation_error", msg, field))

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        # 400 от самого FastAPI — тело не разобралось (например, не UTF-8).
        code = {400: "invalid_body", 404: "not_found", 405: "method_not_allowed",
                401: "invalid_token"}.get(exc.status_code, "error")
        return JSONResponse(status_code=exc.status_code, content=_body(code, MESSAGES.get(code, str(exc.detail))))

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception):
        return JSONResponse(status_code=500, content=_body("internal_error", MESSAGES["internal_error"]))
