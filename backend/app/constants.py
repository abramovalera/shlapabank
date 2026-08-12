"""Константы лимитов и ограничений приложения."""

from decimal import Decimal

from app.models import Currency

# Переводы
MIN_TRANSFER_AMOUNT = Decimal("10.00")
MAX_TRANSFER_AMOUNT = Decimal("300000.00")

# Суточный лимит на пользователя — отдельно по каждой валюте (в единицах валюты)
DAILY_TRANSFER_LIMIT: dict[Currency, Decimal] = {
    Currency.RUB: Decimal("1000000.00"),
    Currency.USD: Decimal("10000.00"),
    Currency.EUR: Decimal("9500.00"),
    Currency.CNY: Decimal("70000.00"),
}

# Блокировка по попыткам входа
FAILED_LOGIN_THRESHOLD = 5

# ---- Инвестиции ----
# Комиссия брокера за сделку (доля от суммы сделки).
BROKER_FEE_RATE = Decimal("0.003")  # 0.3 %
# Ценовой коридор для лимитной заявки: цена не может отстоять от рынка дальше ±20 %.
INVEST_PRICE_BAND = Decimal("0.20")
# Минимальная и максимальная сумма одной сделки (в рублях).
INVEST_MIN_ORDER = Decimal("100.00")
INVEST_MAX_ORDER = Decimal("5000000.00")
