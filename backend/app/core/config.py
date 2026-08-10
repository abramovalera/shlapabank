import os


def _env_bool(name: str, *, default: bool) -> bool:
    v = os.getenv(name)
    if v is None or v == "":
        return default
    return v.lower() in ("1", "true", "yes")


def _env_int(name: str, *, default: int) -> int:
    v = os.getenv(name)
    if v is None or v == "":
        return default
    try:
        return int(v)
    except ValueError:
        return default


def _env_float(name: str, *, default: float) -> float:
    v = os.getenv(name)
    if v is None or v == "":
        return default
    try:
        return float(v)
    except ValueError:
        return default


class Settings:
    app_name: str = os.getenv("APP_NAME", "ShlapaBank")
    app_env: str = os.getenv("APP_ENV", "dev")
    secret_key: str = os.getenv("SECRET_KEY", "change_me")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    # Ограничение нагрузки (учебный rate limit). 0 = отключено.
    register_rate_limit_per_minute: int = int(os.getenv("REGISTER_RATE_LIMIT_PER_MINUTE", "100"))
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://shlapabank:shlapabank@localhost:5432/shlapabank",
    )
    default_admin_login: str = os.getenv("DEFAULT_ADMIN_LOGIN", "admin")
    default_admin_password: str = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin")
    default_admin_email: str = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@shlapabank.com")
    operation_otp_code: str = os.getenv("OPERATION_OTP_CODE", "")  # Пусто = OTP только через GET /helper/otp/preview
    # Учебная трассировка API/БД и панель Log на UI; в проде задать ENABLE_DEV_TRACE=false
    enable_dev_trace: bool = _env_bool(
        "ENABLE_DEV_TRACE",
        default=os.getenv("APP_ENV", "dev").lower() != "production",
    )

    # ==================== Chaos: искусственные задержки API ====================
    # «Реализм» для автотестов: сервер отвечает не мгновенно, а с рандомным лагом,
    # иногда с «толстым хвостом» (изредка запрос висит заметно дольше обычного).
    # Ошибок и падений НЕ вносим — только задержки. По умолчанию ВКЛЮЧЕНО; при
    # старте бэка задержки уже активны. Отключить можно тумблером в админ-панели
    # (в рантайме) или ENABLE_CHAOS=false.
    enable_chaos: bool = _env_bool("ENABLE_CHAOS", default=True)
    # Сид для воспроизводимости «рандома». Пусто = недетерминированно.
    chaos_seed: str = os.getenv("CHAOS_SEED", "")
    # Базовая задержка (мс) — применяется почти ко всем запросам.
    chaos_base_min_ms: int = _env_int("CHAOS_BASE_MIN_MS", default=120)
    chaos_base_max_ms: int = _env_int("CHAOS_BASE_MAX_MS", default=450)
    # Доп. задержка (мс) для «тяжёлых» операций (переводы, выпуск карты, статистика, проверки).
    chaos_heavy_min_ms: int = _env_int("CHAOS_HEAVY_MIN_MS", default=300)
    chaos_heavy_max_ms: int = _env_int("CHAOS_HEAVY_MAX_MS", default=900)
    # «Толстый хвост»: с этой вероятностью (0..1) к запросу добавляется большой лаг.
    chaos_tail_probability: float = _env_float("CHAOS_TAIL_PROBABILITY", default=0.12)
    chaos_tail_min_ms: int = _env_int("CHAOS_TAIL_MIN_MS", default=1500)
    chaos_tail_max_ms: int = _env_int("CHAOS_TAIL_MAX_MS", default=4000)

    # ==================== Bugs: намеренно внедрённые дефекты ====================
    # Тренажёр «найди баг» для автотестов и ручного тестирования. При ВЫКЛ (по
    # умолчанию) приложение работает корректно; при ВКЛ активируется набор из 10
    # багов (см. админ-панель и скачиваемый отчёт). Переключается тумблером в
    # рантайме или ENABLE_BUGS=true.
    enable_bugs: bool = _env_bool("ENABLE_BUGS", default=False)


settings = Settings()
