"""Часы стенда. Всё время в банке берётся отсюда, чтобы тестовое API могло сдвигать его
(проверка границы суток и месяца, истечения кода из SMS и токена). Сдвиг живёт в памяти и сбрасывается
вместе со стендом (POST /test/reset) или перезапуском бэкенда."""

from datetime import date, datetime, timedelta

_offset = timedelta(0)


def now() -> datetime:
    """Текущее время UTC (без часового пояса) с учётом сдвига."""
    return datetime.utcnow() + _offset


def today_utc() -> date:
    return now().date()


def offset() -> timedelta:
    return _offset


def set_offset(value: timedelta) -> None:
    global _offset
    _offset = value


def reset() -> None:
    set_offset(timedelta(0))
