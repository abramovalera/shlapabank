"""Статический справочник инвестиционных инструментов (учебный проект).

Инструменты не хранятся в БД — это фиксированный каталог (как справочник банков
в app/banks.py). Тикеры и названия учебные/пародийные, ISIN'ы выдуманные.
Цены рассчитываются детерминированно в app/invest_prices.py от base_price.

Классы (class):
- stock — акция (есть лот и, у некоторых, дивиденды)
- bond  — облигация (номинал 1000, есть купон и дата погашения)
- fund  — биржевой фонд (лот 1)
- fx    — валютная пара к рублю (лот 1)
"""

from decimal import Decimal

# ticker -> данные инструмента.
# fields: name, cls, sector, lot, base (базовая цена в RUB), isin,
#         div (дивиденд ₽/год для акций, None если нет), coupon (% для облигаций),
#         maturity (дата погашения облигации).
INSTRUMENTS: dict[str, dict] = {
    # ---- Акции ----
    "SHLP": {"name": "ШлапаБанк ао",        "cls": "stock", "sector": "bank",  "lot": 10,  "base": "246.80",  "isin": "RU000SHLP001", "div": "12.40"},
    "PNKF": {"name": "Пенькофф Групп",       "cls": "stock", "sector": "bank",  "lot": 1,   "base": "3120.50", "isin": "RU000PNKF002", "div": "84.00"},
    "SBRU": {"name": "Сберушка ао",          "cls": "stock", "sector": "bank",  "lot": 10,  "base": "289.44",  "isin": "RU000SBRU003", "div": "25.10"},
    "BBLF": {"name": "Бабальфа Банк",        "cls": "stock", "sector": "bank",  "lot": 100, "base": "94.12",   "isin": "RU000BBLF004", "div": None},
    "GZVK": {"name": "Газовик ао",           "cls": "stock", "sector": "bank",  "lot": 10,  "base": "178.36",  "isin": "RU000GZVK005", "div": "9.80"},
    "MTSE": {"name": "МТСей Финанс",         "cls": "stock", "sector": "fin",   "lot": 10,  "base": "312.90",  "isin": "RU000MTSE006", "div": "33.20"},
    "TLPD": {"name": "TelePanda Telecom",    "cls": "stock", "sector": "tele",  "lot": 1,   "base": "1450.00", "isin": "RU000TLPD007", "div": "60.00"},
    "MGFN": {"name": "MegaFun ао",           "cls": "stock", "sector": "tele",  "lot": 1,   "base": "645.20",  "isin": "RU000MGFN008", "div": "18.50"},
    "RTLC": {"name": "RostelCom+",           "cls": "stock", "sector": "tele",  "lot": 100, "base": "88.75",   "isin": "RU000RTLC009", "div": None},
    "FBNT": {"name": "FiberNet ао",          "cls": "stock", "sector": "tele",  "lot": 10,  "base": "132.40",  "isin": "RU000FBNT010", "div": "4.20"},
    "CTWT": {"name": "CityWater ао",         "cls": "stock", "sector": "util",  "lot": 100, "base": "56.18",   "isin": "RU000CTWT011", "div": "2.10"},
    "PCHF": {"name": "ПочтаФинанс ао",       "cls": "stock", "sector": "fin",   "lot": 100, "base": "41.02",   "isin": "RU000PCHF012", "div": None},
    # ---- Облигации (номинал 1000 ₽) ----
    "GZVK-BO1": {"name": "Газовик Банк БО-01",   "cls": "bond", "sector": "bank", "lot": 1, "base": "998.20",  "isin": "RU000BND0001", "coupon": "9.5",  "maturity": "2028-06-15"},
    "SLHF-2P":  {"name": "СельхозФинанс 002Р",   "cls": "bond", "sector": "fin",  "lot": 1, "base": "1012.45", "isin": "RU000BND0002", "coupon": "11.2", "maturity": "2027-03-20"},
    "SHLP-B3":  {"name": "ШлапаБанк 003Р",       "cls": "bond", "sector": "bank", "lot": 1, "base": "1001.10", "isin": "RU000BND0003", "coupon": "10.0", "maturity": "2029-11-01"},
    "SVKM-1":   {"name": "Совком Плюс 001Р",     "cls": "bond", "sector": "bank", "lot": 1, "base": "987.60",  "isin": "RU000BND0004", "coupon": "8.8",  "maturity": "2026-12-10"},
    # ---- Фонды ----
    "SHMX": {"name": "Шлапа Индекс",      "cls": "fund", "sector": "fin", "lot": 1, "base": "145.32", "isin": "RU000FND0001", "div": None},
    "SHGD": {"name": "Шлапа Золото",      "cls": "fund", "sector": "fin", "lot": 1, "base": "210.87", "isin": "RU000FND0002", "div": None},
    "SHBD": {"name": "Шлапа Облигации",   "cls": "fund", "sector": "fin", "lot": 1, "base": "118.45", "isin": "RU000FND0003", "div": None},
    # ---- Валюта (пары к рублю) ----
    "USD/RUB": {"name": "Доллар США",  "cls": "fx", "sector": "fx", "lot": 1, "base": "95.00",  "isin": "-", "div": None},
    "EUR/RUB": {"name": "Евро",        "cls": "fx", "sector": "fx", "lot": 1, "base": "105.00", "isin": "-", "div": None},
    "CNY/RUB": {"name": "Юань",        "cls": "fx", "sector": "fx", "lot": 1, "base": "13.50",  "isin": "-", "div": None},
}

CLASS_LABELS = {"stock": "Акции", "bond": "Облигации", "fund": "Фонды", "fx": "Валюта"}
SECTOR_LABELS = {
    "bank": "Банки", "tele": "Телеком", "util": "ЖКХ", "fin": "Финансы", "fx": "Валюта",
}


def get_instrument(ticker: str) -> dict | None:
    """Данные инструмента по тикеру (или None). Возвращает копию с полем ticker."""
    data = INSTRUMENTS.get(ticker)
    if data is None:
        return None
    return {"ticker": ticker, **data}


def all_instruments() -> list[dict]:
    return [{"ticker": t, **d} for t, d in INSTRUMENTS.items()]


def base_price(ticker: str) -> Decimal:
    d = INSTRUMENTS.get(ticker)
    return Decimal(d["base"]) if d else Decimal("0")


def lot_size(ticker: str) -> int:
    d = INSTRUMENTS.get(ticker)
    return int(d["lot"]) if d else 1
