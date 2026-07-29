import time
from pathlib import Path

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from app.core.config import settings
from app.dev_trace import clear_request_context, record_http_event, reset_request_context, sanitize_correlation_id
from app.error_messages import message_for
from app.routes.accounts import router as accounts_router
from app.routes.admin import router as admin_router
from app.routes.auth import router as auth_router
from app.routes.cards import router as cards_router
from app.routes.dev_trace import router as dev_trace_router
from app.routes.helper import router as helper_router
from app.routes.health import router as health_router
from app.routes.payments import router as payments_router
from app.routes.profile import router as profile_router
from app.routes.statistics import router as statistics_router
from app.routes.transactions import router as transactions_router
from app.routes.transfers import router as transfers_router
from app.startup import init_db

openapi_tags = [
    {
        "name": "admin",
        "description": (
            "**Административные операции.** Логин: `admin`, пароль: `admin`. "
            "Залогиньтесь через `POST /auth/login`, скопируйте `access_token` и вставьте "
            "в «Authorize» вверху страницы."
        ),
    },
    {"name": "auth", "description": "Регистрация, вход, восстановление пароля."},
    {"name": "profile", "description": "Профиль текущего пользователя: получить, обновить, удалить."},
    {"name": "accounts", "description": "Счета пользователя: список, открытие, переименование, закрытие, пополнение."},
    {"name": "cards", "description": "Карты, привязанные к счетам. Выпуск, блокировка, смена дизайна, закрытие."},
    {"name": "transfers", "description": "Переводы: между своими, по номеру счёта, по телефону, по номеру карты. Обмен валют."},
    {"name": "payments", "description": "Платежи: мобильная связь, поставщики (ЖКХ, интернет, образование, благотворительность)."},
    {"name": "transactions", "description": "История операций и чеки."},
    {"name": "statistics", "description": "Статистика расходов по месяцам и категориям."},
    {"name": "helper", "description": "OTP: единая точка выдачи одноразовых кодов подтверждения."},
]

app = FastAPI(
    title=settings.app_name,
    openapi_tags=openapi_tags,
    description=(
        "**API учебного банка ShlapaBank.**\n\n"
        "Все ошибки возвращаются в едином формате:\n"
        "```json\n"
        "{\"error\":{\"code\":\"insufficient_funds\",\"message\":\"Недостаточно средств\",\"field\":null}}\n"
        "```\n"
        "- `code` — стабильный snake_case-код (используйте для программной обработки)\n"
        "- `message` — человекочитаемое сообщение\n"
        "- `field` — имя поля для валидационных ошибок (для бизнес-ошибок `null`)"
    ),
)


def _custom_openapi():
    """Кастомизируем OpenAPI-схему:
    - Убираем дефолтный HTTPValidationError у всех операций и подменяем на ApiErrorResponse.
    - Добавляем стандартный 4xx-ответ ApiErrorResponse во все операции.
    """
    if app.openapi_schema:
        return app.openapi_schema
    from fastapi.openapi.utils import get_openapi

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        tags=openapi_tags,
    )

    # Убираем встроенные HTTPValidationError / ValidationError из compenents/schemas —
    # они нам не нужны, заменяем на наш ApiErrorResponse.
    comps = schema.get("components", {}).get("schemas", {})
    comps.pop("HTTPValidationError", None)
    comps.pop("ValidationError", None)

    err_ref = {"$ref": "#/components/schemas/ApiErrorResponse"}
    for path_item in schema.get("paths", {}).values():
        for method_data in path_item.values():
            if not isinstance(method_data, dict):
                continue
            responses = method_data.get("responses", {})
            # Заменяем 422 на наш формат
            if "422" in responses:
                responses["422"] = {
                    "description": "Ошибка валидации входных данных",
                    "content": {"application/json": {"schema": err_ref}},
                }
            # Добавляем 400 если его нет (для бизнес-ошибок)
            if "400" not in responses and any(k.startswith("2") for k in responses.keys()):
                responses["400"] = {
                    "description": "Бизнес-ошибка (см. поле error.code)",
                    "content": {"application/json": {"schema": err_ref}},
                }
    app.openapi_schema = schema
    return schema


app.openapi = _custom_openapi  # type: ignore


# ==================== Единый формат ошибок ====================
# Всегда отдаём {"error": {"code": "...", "message": "...", "field": null}}.
# code — стабильный snake_case ID для программной обработки.
# message — русский текст для показа пользователю.
# field — имя поля-виновника (для валидационных ошибок), null для бизнес-ошибок.


def _error_body(code: str, message: str | None = None, field: str | None = None) -> dict:
    return {
        "error": {
            "code": code,
            "message": message or message_for(code),
            "field": field,
        }
    }


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    # Строковый detail — стандартный случай (raise HTTPException(400, detail="code"))
    if isinstance(detail, str):
        # Формат "code: text" — берём код до ":"
        code = detail.split(":", 1)[0].strip() or "error"
        return JSONResponse(status_code=exc.status_code, content=_error_body(code))
    # Уже структурированный detail — используем как есть
    if isinstance(detail, dict) and "error" in detail:
        return JSONResponse(status_code=exc.status_code, content=detail)
    # Что-то нестандартное — оборачиваем
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body("error", message=str(detail)),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Pydantic-валидация — возвращаем первую ошибку с полем."""
    errors = exc.errors()
    if errors:
        err = errors[0]
        field = ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query", "path"))
        msg = err.get("msg", "Invalid value")
        return JSONResponse(
            status_code=422,
            content=_error_body("validation_error", message=msg, field=field or None),
        )
    return JSONResponse(status_code=422, content=_error_body("validation_error"))


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    """Отключает кеш для UI — чтобы при обновлениях не показывались старые CSS/JS."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/ui"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


class NoCacheApiMiddleware(BaseHTTPMiddleware):
    """Отключает кеш для API — чтобы браузер не кешировал ответы и не показывал устаревшие данные при переключении вкладок."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


app.add_middleware(NoCacheStaticMiddleware)
app.add_middleware(NoCacheApiMiddleware)


def _dev_trace_skip_path(path: str) -> bool:
    if not path.startswith("/api/"):
        return True
    if path.startswith("/api/v1/dev/trace"):
        return True
    return False


class DevTraceMiddleware(BaseHTTPMiddleware):
    """Фиксирует метод, путь, статус, длительность и сводку ORM (см. панель Log на UI)."""

    async def dispatch(self, request: Request, call_next):
        if not settings.enable_dev_trace or _dev_trace_skip_path(request.url.path):
            return await call_next(request)
        reset_request_context()
        response = None
        t0 = time.perf_counter()
        try:
            response = await call_next(request)
            return response
        finally:
            try:
                ms = (time.perf_counter() - t0) * 1000
                status = getattr(response, "status_code", 500) if response is not None else 500
                record_http_event(
                    method=request.method,
                    path=request.url.path,
                    query=request.url.query or "",
                    status_code=status,
                    duration_ms=ms,
                    correlation_id=sanitize_correlation_id(request.headers.get("X-SB-Correlation-Id")),
                )
            finally:
                clear_request_context()


app.add_middleware(DevTraceMiddleware)

# Путь к UI (работает и в Docker, и при локальном запуске)
_ui_candidates = [
    Path(__file__).resolve().parent.parent / "ui-mockup",  # Docker: /app/ui-mockup
    Path(__file__).resolve().parent.parent.parent / "ui-mockup",  # Локально: project/ui-mockup
]
UI_DIR = next((p for p in _ui_candidates if p.exists()), _ui_candidates[0])


_NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


def _serve_index():
    """Страница входа/регистрации."""
    p = UI_DIR / "index.html"
    return FileResponse(p, headers=_NO_CACHE_HEADERS) if p.exists() else RedirectResponse(url="/ui/")


def _serve_dashboard():
    """Дашборд (главная, профиль, платежи и т.д.)."""
    p = UI_DIR / "dashboard.html"
    return FileResponse(p, headers=_NO_CACHE_HEADERS) if p.exists() else RedirectResponse(url="/ui/")


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    """Корень бэкенда: редирект на UI (nginx на 8080)."""
    return RedirectResponse(url="http://localhost:8080/")


# Легаси: старые /login, /dashboard и т.д. отдают mockup для обратной совместимости.
# Основной UI теперь — http://localhost:8080 (React + nginx).
@app.get("/login", include_in_schema=False)
def login_page():
    return _serve_index()


@app.get("/register", include_in_schema=False)
def register_page():
    return _serve_index()


@app.get("/dashboard", include_in_schema=False)
def dashboard_page():
    return _serve_dashboard()


@app.on_event("startup")
def startup() -> None:
    init_db()
    from app.dev_trace import install_db_hooks

    install_db_hooks()


app.include_router(health_router)
app.include_router(dev_trace_router)
app.include_router(helper_router)
app.include_router(admin_router)
app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(accounts_router)
app.include_router(transfers_router)
app.include_router(transactions_router)
app.include_router(payments_router)
app.include_router(cards_router)
app.include_router(statistics_router)

app.mount(
    "/ui",
    StaticFiles(directory=str(UI_DIR), html=True),
    name="ui",
)
