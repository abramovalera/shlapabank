import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app import errors, seed
from app.errors import errors_for
from app.db import ensure_database
from app.routes import accounts, auth, info, operations, test


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_database()
    seed.init()
    yield


DOCS = "http://localhost:8090"

DESCRIPTION = f"""
**API учебного банка ShlapaBank.** Документация, тестовые данные и подробные описания: [{DOCS}]({DOCS}/)

**Как войти:**
1. `POST /api/v1/auth/login` — телефон и пароль, в ответе `challenge_id`.
2. `GET /api/v1/test/sms?phone=9991234567` — код из SMS (или страница [SMS]({DOCS}/tools/01-sms.html)).
3. `POST /api/v1/auth/login/confirm` — `challenge_id` и код, в ответе `access_token`.
4. Нажмите **Authorize** и вставьте токен.

Ошибки всегда в одном формате: `{{"error": {{"code", "message", "field"}}}}` — [все коды]({DOCS}/03-errors.html).
"""

# В Swagger — по одной фразе на раздел, подробности — в документации.
TAGS = [
    {"name": "Вход и регистрация",
     "description": f"Регистрация и вход в два шага с кодом из SMS. [Подробно]({DOCS}/04-api.html#вход)"},
    {"name": "Счета и карта",
     "description": f"До 3 рублёвых счетов и одна виртуальная карта. [Подробно]({DOCS}/04-api.html#счета-и-карта)"},
    {"name": "Операции",
     "description": f"Переводы, платежи, пополнение, история. Статусы и фильтры — [в документации]({DOCS}/04-api.html#операции)"},
    {"name": "Тарифы, лимиты, справочники",
     "description": f"Комиссии, лимиты и справочники. [Подробно]({DOCS}/04-api.html#тарифы-и-лимиты)"},
    {"name": "Вспомогательные действия",
     "description": f"Без авторизации — то, что обычными запросами не сделать: код из SMS, время банка, блокировки, сброс. "
                    f"Как ими пользоваться — [в документации]({DOCS}/tools/03-test-api.html)"},
    {"name": "Служебное", "description": "Проверка, что сервис жив."},
]

app = FastAPI(title="ShlapaBank API", version="1.0", description=DESCRIPTION, openapi_tags=TAGS, lifespan=lifespan,
              docs_url="/docs", openapi_url="/openapi.json")
errors.install(app)

# Сумма числом в записи с экспонентой (1e3) после разбора JSON неотличима от 1000.0 — ловим по тексту тела.
EXPONENT_AMOUNT = re.compile(rb'"amount"\s*:\s*-?[0-9.]+[eE]')


@app.middleware("http")
async def reject_exponent_amount(request: Request, call_next):
    if request.method == "POST" and request.url.path.startswith("/api/v1/operations/"):
        if EXPONENT_AMOUNT.search(await request.body()):
            return JSONResponse(status_code=422, content={"error": {
                "code": "validation_error", "message": "Сумма — число, например 1500 или 1500.50", "field": "amount"}})
    return await call_next(request)

ROUTERS = [auth, accounts, operations, info, test]

# Какие ошибки бывают у адреса — по ним Swagger показывает примеры (у каждого адреса только свои).
AUTHED = ("invalid_token", "token_expired", "user_blocked")  # у всех адресов, где нужен вход
AMOUNT = ("validation_error:amount", "amount_out_of_range", "insufficient_funds")
LIMITS = ("limit_per_operation", "limit_daily", "limit_monthly")
CODE = ("validation_error:code", "invalid_code", "code_expired", "code_attempts_exceeded")
ROUTE_ERRORS = {
    "POST /auth/register": ("validation_error:phone", "phone_taken"),
    "POST /auth/login": ("validation_error:phone", "invalid_credentials", "user_blocked"),
    "POST /auth/login/confirm": (*CODE, "user_blocked", "challenge_not_found"),
    "POST /auth/login/resend": ("validation_error:challenge_id", "user_blocked", "challenge_not_found",
                                "resend_too_early"),
    "GET /auth/login/{challenge_id}": ("challenge_not_found",),
    "GET /me": AUTHED,
    "GET /accounts": AUTHED,
    "POST /accounts": (*AUTHED, "validation_error:name", "accounts_limit", "account_name_taken"),
    "PATCH /accounts/{account_id}": (*AUTHED, "validation_error:name", "account_not_found:account_id",
                                     "account_name_taken"),
    "DELETE /accounts/{account_id}": (*AUTHED, "validation_error:account_id", "account_not_found:account_id",
                                      "account_not_empty", "account_has_card", "last_account"),
    "GET /card": (*AUTHED, "card_not_found"),
    "POST /card": (*AUTHED, "validation_error:account_id", "account_not_found:account_id", "card_already_exists"),
    "PATCH /card": (*AUTHED, "validation_error:account_id", "card_not_found", "account_not_found:account_id"),
    "GET /card/requisites": (*AUTHED, "card_not_found"),
    "GET /recipients/phone": (*AUTHED, "validation_error:phone", "self_transfer", "recipient_blocked",
                              "recipient_no_account", "recipient_not_found"),
    "GET /recipients/card": (*AUTHED, "validation_error:number", "invalid_card_number:number",
                             "self_transfer:number", "card_blocked:number", "card_expired:number",
                             "recipient_blocked:number", "card_not_found:number"),
    "POST /operations/own-transfer": (*AUTHED, *AMOUNT, "same_account", "account_not_found"),
    "POST /operations/phone-transfer": (*AUTHED, *AMOUNT, *LIMITS, "self_transfer", "recipient_blocked",
                                       "recipient_no_account", "account_not_found", "recipient_not_found"),
    "POST /operations/card-transfer": (*AUTHED, *AMOUNT, *LIMITS, "invalid_card_number", "self_transfer:card_number",
                                      "card_blocked", "card_expired", "recipient_blocked:card_number",
                                      "account_not_found", "card_not_found:card_number"),
    "POST /operations/mobile": (*AUTHED, *AMOUNT, *LIMITS, "account_not_found", "operator_not_found"),
    "POST /operations/utility": (*AUTHED, *AMOUNT, *LIMITS, "invalid_payer_account", "account_not_found",
                                 "provider_not_found"),
    "POST /operations/topup": (*AUTHED, "validation_error:amount", "amount_out_of_range", "own_bank_card",
                               "invalid_card_number", "card_expired:expiry@422", "account_not_found:to_account_id",
                               "card_not_found:card_number"),
    "POST /operations/{operation_id}/confirm": (*AUTHED, *CODE, "operation_not_found", "operation_not_waiting"),
    "POST /operations/{operation_id}/resend-code": (*AUTHED, "validation_error:operation_id", "operation_not_found",
                                                    "operation_not_waiting", "resend_too_early"),
    "POST /operations/{operation_id}/cancel": (*AUTHED, "validation_error:operation_id", "operation_not_found",
                                               "operation_not_waiting"),
    "GET /operations": (*AUTHED, "validation_error:type", "account_not_found:account_id"),
    "GET /operations/{operation_id}": (*AUTHED, "validation_error:operation_id", "operation_not_found"),
    "GET /tariffs": AUTHED,
    "GET /limits": AUTHED,
    "GET /dictionary/providers": AUTHED,
    "GET /dictionary/mobile-operators": AUTHED,
    "GET /test/sms": ("validation_error:limit",),
    "POST /test/time/add-minutes": ("validation_error:minutes",),
    "POST /test/users/{phone}/block": ("client_not_found",),
    "POST /test/users/{phone}/unblock": ("client_not_found",),
    "POST /test/cards/{number}/block": ("card_not_found",),
    "POST /test/cards/{number}/unblock": ("card_not_found",),
}
for module in ROUTERS:
    for route in module.router.routes:
        for method in route.methods:
            route.responses.update(errors_for(*ROUTE_ERRORS.get(f"{method} {route.path}", ())))
    app.include_router(module.router, prefix="/api/v1")


def _openapi():
    """Стандартная схема, но без 422 HTTPValidationError, который FastAPI сам дописывает адресам
    со строковыми параметрами пути: у них такой ошибки не бывает, а наши 422 описаны своим форматом."""
    if app.openapi_schema:
        return app.openapi_schema
    from fastapi.openapi.utils import get_openapi
    schema = get_openapi(title=app.title, version=app.version, description=app.description, routes=app.routes,
                         tags=app.openapi_tags)
    for path in schema["paths"].values():
        for op in path.values():
            resp = op.get("responses", {}).get("422")
            if resp and "HTTPValidationError" in str(resp):
                del op["responses"]["422"]
            # FastAPI выкидывает null из примеров — возвращаем "field": null, как в настоящих ответах.
            for r in op.get("responses", {}).values():
                for ex in r.get("content", {}).get("application/json", {}).get("examples", {}).values():
                    ex["value"]["error"].setdefault("field", None)
    app.openapi_schema = schema
    return schema


app.openapi = _openapi


@app.get("/health", tags=["Служебное"], summary="Сервис жив")
def health():
    return {"status": "ok"}
