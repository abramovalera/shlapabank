"""Единый словарь человекочитаемых сообщений для кодов ошибок API.

Используется глобальным exception handler'ом. Клиент показывает `message`,
но программно ориентируется на стабильный `code`.
"""

# Маппинг стабильный код → человекочитаемое сообщение.
# Коды не менять — их читает фронт и автотесты.
ERROR_MESSAGES: dict[str, str] = {
    # ---- Auth ----
    "invalid_credentials": "Неверный логин или пароль",
    "invalid_token": "Некорректный или просроченный токен",
    "user_blocked": "Пользователь заблокирован",
    "invalid_otp_code": "Неверный или истёкший OTP-код",
    "invalid_current_password": "Текущий пароль неверный",
    "password_reuse_not_allowed": "Новый пароль совпадает со старым",
    "password_change_requires_both_fields": "Заполните оба поля пароля",
    "weak_password": "Пароль слишком простой (нужны заглавная, строчная, цифра и спецсимвол, 8–30 знаков)",
    "password_equals_login": "Пароль не должен совпадать с логином",
    "password_contains_space": "Пароль не должен содержать пробелов",
    "login_not_unique": "Логин уже занят",
    "phone_not_unique": "Этот телефон уже используется",
    "email_not_unique": "Этот email уже используется",
    "rate_limited": "Слишком много запросов, попробуйте позже",
    "terms_not_accepted": "Нужно принять условия",
    # ---- Accounts ----
    "account_not_found": "Счёт не найден",
    "account_inactive": "Счёт неактивен",
    "account_already_closed": "Счёт уже закрыт",
    "account_close_requires_zero_balance": "Для закрытия счёта на нём должно быть 0",
    "account_limit_exceeded": "Достигнут лимит счетов в этой валюте",
    "amount_too_large": "Сумма слишком большая",
    "amount_must_be_positive": "Сумма должна быть больше 0",
    "invalid_account_number": "Неверный номер счёта",
    "account_found_in_bank": "Счёт найден в ShlapaBank — используйте внутренний перевод",
    # ---- Cards ----
    "card_not_found": "Карта не найдена",
    "card_not_active": "Карта неактивна",
    "card_expired": "Срок действия карты истёк",
    "card_limit_exceeded": "Достигнут лимит карт для этого счёта",
    "cannot_set_expired_manually": "Нельзя установить статус EXPIRED вручную",
    "card_number_generation_failed": "Не удалось сгенерировать номер карты",
    "recipient_card_not_active": "Карта получателя неактивна или заблокирована",
    # ---- Transfers ----
    "transfer_same_account": "Нельзя перевести на тот же счёт",
    "transfer_not_allowed_from_savings": "Со сберегательного счёта переводы запрещены",
    "transfer_amount_too_small": "Сумма меньше минимальной для перевода",
    "transfer_amount_exceeds_single_limit": "Сумма превышает разовый лимит",
    "transfer_amount_exceeds_daily_limit": "Сумма превышает суточный лимит",
    "currency_mismatch": "Валюты счетов не совпадают",
    "currency_not_supported_for_exchange": "Обмен для этой пары валют не поддерживается",
    "insufficient_funds": "Недостаточно средств",
    "recipient_not_found_in_our_bank": "Получатель не найден в ShlapaBank",
    "recipient_has_no_suitable_account": "У получателя нет подходящего счёта",
    "recipient_account_inactive": "Счёт получателя неактивен",
    "invalid_card_number": "Неверный номер карты",
    "invalid_card_length": "Номер карты должен быть 16 цифр",
    "source_required": "Не выбран источник перевода",
    # ---- Payments ----
    "payment_operator_not_supported": "Оператор мобильной связи не поддерживается",
    "payment_amount_out_of_range": "Сумма вне допустимого диапазона",
    "payment_requires_rub_account": "Оплата возможна только с рублёвого счёта",
    "payment_provider_not_supported": "Поставщик не поддерживается",
    "payment_account_length_mismatch": "Неверная длина лицевого счёта",
    # ---- Admin / Helper ----
    "forbidden_account_access": "Нет доступа к этому счёту",
    "forbidden_admin_only": "Действие доступно только администратору",
    "salary_credit_admin_only": "Начислять зарплату может только администратор",
    "user_not_found": "Пользователь не найден",
    "cannot_block_admin": "Дефолтного администратора нельзя заблокировать",
    "cannot_delete_admin": "Дефолтного администратора нельзя удалить",
    "bank_limit_exceeded": "Максимум 5 внешних банков на пользователя",
    "invalid_bank_codes": "Указан неизвестный или недопустимый код банка",
    # ---- Common ----
    "not_found": "Не найдено",
    "forbidden": "Доступ запрещён",
    "unauthorized": "Требуется авторизация",
    "internal_error": "Внутренняя ошибка сервера",
    "database_migration_required": "Требуется миграция базы данных",
    "validation_error": "Ошибка валидации данных",
}


def message_for(code: str) -> str:
    """Возвращает русское сообщение для кода. Если код неизвестный — возвращает сам код."""
    if not code:
        return "Неизвестная ошибка"
    # Некоторые старые raise'ы делают "validation_error: <detail>" — берём только код.
    clean = code.split(":", 1)[0].strip()
    return ERROR_MESSAGES.get(clean, code)
