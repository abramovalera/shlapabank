"""Котировки инструментов — детерминированный «живой» рынок.

Цена = base_price * фактор(тикер, время). Фактор — сумма нескольких синусоид со
сдвигами, зависящими от тикера и сида (INVEST_SEED), плюс мелкий джиттер по
2-секундным корзинам. За счёт этого:
- цена ПЛАВНО меняется во времени (тикает каждые ~2 с при поллинге фронта);
- при заданном INVEST_SEED всё воспроизводимо (одинаково у всех клиентов);
- никакого состояния в БД не нужно — чистая функция от (тикер, timestamp).

Стакан заявок и внутридневной график считаются из той же функции.
"""

import hashlib
import math
import time
from decimal import Decimal, ROUND_HALF_UP

from app.core.config import settings
from app.invest_catalog import base_price

_Q = Decimal("0.01")


def _hash_int(*parts: object) -> int:
    raw = (settings.invest_seed + "|" + "|".join(str(p) for p in parts)).encode()
    return int(hashlib.sha256(raw).hexdigest()[:12], 16)


def _round(value: Decimal) -> Decimal:
    return value.quantize(_Q, rounding=ROUND_HALF_UP)


def _factor(ticker: str, ts: float) -> float:
    """Мультипликатор к базовой цене на момент ts (около 1.0, ±~2%)."""
    s = _hash_int("phase", ticker)
    p1 = (s % 1000) / 1000 * math.tau
    p2 = ((s >> 7) % 1000) / 1000 * math.tau
    p3 = ((s >> 13) % 1000) / 1000 * math.tau
    drift = (
        0.012 * math.sin(ts / 370.0 + p1)
        + 0.006 * math.sin(ts / 91.0 + p2)
        + 0.003 * math.sin(ts / 19.0 + p3)
    )
    bucket = int(ts // 2)  # 2-секундная корзина — «тик»
    jitter = ((_hash_int("tick", ticker, bucket) % 1000) / 1000 - 0.5) * 0.0016
    return 1.0 + drift + jitter


def current_price(ticker: str, ts: float | None = None) -> Decimal:
    base = base_price(ticker)
    if base == 0:
        return Decimal("0.00")
    ts = time.time() if ts is None else ts
    return _round(base * Decimal(str(_factor(ticker, ts))))


def _day_start_ts(ts: float) -> float:
    return ts - (ts % 86400.0)


def day_open(ticker: str, ts: float | None = None) -> Decimal:
    ts = time.time() if ts is None else ts
    return current_price(ticker, _day_start_ts(ts))


def intraday_series(ticker: str, points: int = 64, ts: float | None = None) -> list[str]:
    """Точки цены от начала суток (UTC) до текущего момента — для мини-графика."""
    ts = time.time() if ts is None else ts
    start = _day_start_ts(ts)
    span = max(ts - start, 1.0)
    out: list[str] = []
    for i in range(points):
        t = start + span * (i / (points - 1))
        out.append(str(current_price(ticker, t)))
    return out


def day_stats(ticker: str, ts: float | None = None) -> dict:
    """Сводка за день: last/open/high/low/change/volume."""
    ts = time.time() if ts is None else ts
    last = current_price(ticker, ts)
    opn = day_open(ticker, ts)
    series = [Decimal(x) for x in intraday_series(ticker, 48, ts)]
    hi = max(series + [last])
    lo = min(series + [last])
    change = _round(last - opn)
    change_pct = (float(change) / float(opn) * 100) if opn else 0.0
    # Объём торгов — детерминированный псевдо-объём на день.
    vol = _hash_int("vol", ticker, int(_day_start_ts(ts))) % 4_000_000 + 50_000
    return {
        "last": str(last),
        "open": str(opn),
        "high": str(hi),
        "low": str(lo),
        "change": str(change),
        "change_pct": round(change_pct, 2),
        "volume": vol,
    }


def _tick_size(price: Decimal) -> Decimal:
    step = _round(price * Decimal("0.0005"))
    return step if step >= _Q else _Q


def orderbook(ticker: str, depth: int = 7, ts: float | None = None) -> dict:
    """Стакан: depth уровней bid/ask вокруг текущей цены.

    Объёмы зависят от 2-секундной корзины — стакан «перерисовывается» на каждом
    тике (намеренно, чтобы автотесты не цеплялись за конкретные значения)."""
    ts = time.time() if ts is None else ts
    price = current_price(ticker, ts)
    step = _tick_size(price)
    bucket = int(ts // 2)
    bids, asks = [], []
    for lvl in range(1, depth + 1):
        bq = _hash_int("bid", ticker, bucket, lvl) % 3800 * 10 + 100
        aq = _hash_int("ask", ticker, bucket, lvl) % 3800 * 10 + 100
        bids.append({"price": str(_round(price - step * lvl)), "qty": bq})
        asks.append({"price": str(_round(price + step * lvl)), "qty": aq})
    return {"ticker": ticker, "bids": bids, "asks": asks, "spread": str(step)}
