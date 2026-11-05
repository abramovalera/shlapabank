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

ROUTERS = [
    (auth, {}),  # у адресов входа — свои наборы ответов
    (accounts, errors_for(401, 403)),
    (operations, errors_for(401, 403)),
    (info, errors_for(401, 403)),
    (test, {}),
]
# Какие ещё ошибки бывают у адреса — чтобы в Swagger не было ответов, которых на деле нет.
ROUTE_ERRORS = {
    "POST /accounts": (409, 422),
    "PATCH /accounts/{account_id}": (404, 409, 422),
    "DELETE /accounts/{account_id}": (404, 409, 422),
    "GET /card": (404,),
    "POST /card": (404, 409, 422),
    "PATCH /card": (404, 422),
    "GET /card/requisites": (404,),
    "GET /recipients/phone": (400, 404, 422),
    "GET /recipients/card": (400, 404, 422),
    "POST /operations/own-transfer": (400, 404, 422),
    "POST /operations/phone-transfer": (400, 404, 422),
    "POST /operations/card-transfer": (400, 404, 422),
    "POST /operations/mobile": (400, 404, 422),
    "POST /operations/utility": (400, 404, 422),
    "POST /operations/topup": (400, 404, 422),
    "POST /operations/{operation_id}/confirm": (400, 404, 409, 422),
    "POST /operations/{operation_id}/resend-code": (404, 409, 422, 429),
    "POST /operations/{operation_id}/cancel": (404, 409, 422),
    "GET /operations": (404, 422),
    "GET /operations/{operation_id}": (404, 422),
    "GET /test/sms": (422,),
    "POST /test/time/add-minutes": (422,),
    "POST /test/users/{phone}/block": (404, 422),
    "POST /test/users/{phone}/unblock": (404, 422),
    "POST /test/cards/{number}/block": (404, 422),
    "POST /test/cards/{number}/unblock": (404, 422),
}
for module, responses in ROUTERS:
    for route in module.router.routes:
        for method in route.methods:
            route.responses.update(errors_for(*ROUTE_ERRORS.get(f"{method} {route.path}", ())))
    app.include_router(module.router, prefix="/api/v1", responses=responses)


@app.get("/health", tags=["Служебное"], summary="Сервис жив")
def health():
    return {"status": "ok"}
