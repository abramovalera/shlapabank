"""Chaos-middleware: искусственные задержки ответов API.

Цель — «реализм» для автотестов: сервер отвечает не мгновенно, а с рандомным
лагом, иногда с «толстым хвостом» (изредка запрос висит заметно дольше). Это
заставляет писать ожидания по состоянию UI, а не по фиксированному sleep.

Осознанно НЕ вносим ошибок/падений — только задержки (см. настройки в config).

Управление:
- ENABLE_CHAOS=true — включить.
- CHAOS_SEED=<любая строка> — воспроизводимый «рандом» (best-effort, порядок
  конкурентных запросов не гарантируется).
- Заголовок запроса ``X-SB-No-Chaos: 1`` — обойти задержку для служебных проверок.
"""

import asyncio
import random

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import settings

# Отдельный генератор, чтобы не влиять на глобальный random приложения.
_rng = random.Random(settings.chaos_seed) if settings.chaos_seed else random.Random()


class ChaosState:
    """Рантайм-состояние: можно включать/выключать задержки на лету (без рестарта),
    например тумблером в админ-панели. Стартовое значение берётся из ENABLE_CHAOS
    (по умолчанию False — задержек нет)."""

    def __init__(self, enabled: bool) -> None:
        self.enabled = enabled


# In-memory (один процесс uvicorn). Для многопроцессного деплоя вынести во внешнее хранилище.
state = ChaosState(enabled=settings.enable_chaos)

# «Тяжёлые» операции — куски пути, для которых добавляем дополнительную задержку.
_HEAVY_MARKERS = (
    "/transfers",
    "/exchange",
    "/statistics",
    "/payments",
    "/cards",
    "/by-phone/check",
    "/invest",
)

# Пути, которые никогда не тормозим (техника, а не пользовательские сценарии).
_SKIP_PREFIXES = (
    "/health",
    "/api/v1/dev/trace",
    "/api/v1/helper/otp",
    "/api/v1/admin/chaos",  # сам тумблер задержек всегда должен отвечать мгновенно
)


def _should_skip(path: str) -> bool:
    if not path.startswith("/api/"):
        return True
    return any(path.startswith(p) for p in _SKIP_PREFIXES)


def _is_heavy(path: str) -> bool:
    return any(m in path for m in _HEAVY_MARKERS)


def _compute_delay_ms(path: str) -> float:
    """Считает суммарную задержку в миллисекундах по профилю пути."""
    delay = _rng.uniform(settings.chaos_base_min_ms, settings.chaos_base_max_ms)
    if _is_heavy(path):
        delay += _rng.uniform(settings.chaos_heavy_min_ms, settings.chaos_heavy_max_ms)
    # «Толстый хвост» — изредка большой лаг поверх базового.
    if _rng.random() < settings.chaos_tail_probability:
        delay += _rng.uniform(settings.chaos_tail_min_ms, settings.chaos_tail_max_ms)
    return delay


class ChaosMiddleware(BaseHTTPMiddleware):
    """Добавляет случайную задержку перед обработкой API-запроса."""

    async def dispatch(self, request: Request, call_next):
        # Рантайм-тумблер: если выключено — работаем как обычно, без задержек.
        if not state.enabled:
            return await call_next(request)
        if _should_skip(request.url.path):
            return await call_next(request)
        # Служебный обход для healthcheck-подобных проверок.
        if request.headers.get("X-SB-No-Chaos"):
            return await call_next(request)

        delay_ms = _compute_delay_ms(request.url.path)
        await asyncio.sleep(delay_ms / 1000.0)
        return await call_next(request)
