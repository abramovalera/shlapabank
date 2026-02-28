"""Константы лимитов и ограничений приложения."""

from decimal import Decimal

# Переводы
MIN_TRANSFER_AMOUNT = Decimal("10.00")
MAX_TRANSFER_AMOUNT = Decimal("300000.00")
DAILY_TRANSFER_LIMIT_RUB = Decimal("1000000.00")

# Блокировка по попыткам входа
FAILED_LOGIN_THRESHOLD = 5
