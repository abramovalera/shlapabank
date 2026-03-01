from pathlib import Path

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse

from app.core.config import settings
from app.routes.accounts import router as accounts_router
from app.routes.admin import router as admin_router
from app.routes.auth import router as auth_router
from app.routes.helper import router as helper_router
from app.routes.health import router as health_router
from app.routes.payments import router as payments_router
from app.routes.profile import router as profile_router
from app.routes.settings import router as settings_router
from app.routes.transactions import router as transactions_router
from app.routes.transfers import router as transfers_router
from app.startup import init_db

openapi_tags = [
    {"name": "health", "description": "Проверка доступности."},
    {"name": "helper", "description": "OTP, баланс, очистка (для тестов)."},
    {"name": "admin", "description": "Администрирование (список пользователей, блокировка, банки)."},
    {"name": "auth", "description": "Регистрация и вход."},
    {"name": "profile", "description": "Профиль пользователя."},
    {"name": "accounts", "description": "Счета пользователя."},
    {"name": "transfers", "description": "Переводы и обмен валют."},
    {"name": "transactions", "description": "История операций."},
    {"name": "payments", "description": "Платежи (мобильная связь, поставщики)."},
    {"name": "settings", "description": "Настройки."},
]

app = FastAPI(title=settings.app_name, openapi_tags=openapi_tags)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
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

# Путь к UI (работает и в Docker, и при локальном запуске)
_ui_candidates = [
    Path(__file__).resolve().parent.parent / "ui-mockup",  # Docker: /app/ui-mockup
    Path(__file__).resolve().parent.parent.parent / "ui-mockup",  # Локально: project/ui-mockup
]
UI_DIR = next((p for p in _ui_candidates if p.exists()), _ui_candidates[0])


def _serve_index():
    """Страница входа/регистрации."""
    p = UI_DIR / "index.html"
    return FileResponse(p) if p.exists() else RedirectResponse(url="/ui/")


def _serve_dashboard():
    """Дашборд (главная, профиль, платежи и т.д.)."""
    p = UI_DIR / "dashboard.html"
    return FileResponse(p) if p.exists() else RedirectResponse(url="/ui/")


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/login")


@app.get("/login", include_in_schema=False)
def login_page():
    """Человекочитаемый URL: /login — экран входа."""
    return _serve_index()


@app.get("/register", include_in_schema=False)
def register_page():
    """Человекочитаемый URL: /register — экран регистрации."""
    return _serve_index()


@app.get("/dashboard", include_in_schema=False)
def dashboard_page():
    """Главная дашборда."""
    return _serve_dashboard()


@app.get("/profile", include_in_schema=False)
def profile_page():
    """Профиль пользователя."""
    return _serve_dashboard()


@app.get("/payments", include_in_schema=False)
def payments_page():
    """Платежи."""
    return _serve_dashboard()


@app.get("/chat", include_in_schema=False)
def chat_page():
    """Чат с поддержкой."""
    return _serve_dashboard()


@app.get("/confirm", include_in_schema=False)
def confirm_page():
    """Подтверждение OTP (модальное окно)."""
    return _serve_dashboard()


@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(health_router)
app.include_router(helper_router)
app.include_router(admin_router)
app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(accounts_router)
app.include_router(transfers_router)
app.include_router(transactions_router)
app.include_router(payments_router)
app.include_router(settings_router)

app.mount(
    "/ui",
    StaticFiles(directory=str(UI_DIR), html=True),
    name="ui",
)
