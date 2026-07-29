"""Нормализация номеров телефонов для единообразного хранения и поиска."""

import re


def normalize_phone(value: str | None) -> str | None:
    """
    Приводит номер к формату +7XXXXXXXXXX (10 цифр после +7).
    Поддерживает: +7(906)000-00-00, 89060000000, 79060000000, 9060000000.
    Возвращает None если номер невалидный.
    """
    if not value or not isinstance(value, str):
        return None
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits.startswith("7"):
        return "+7" + digits[1:]
    if len(digits) == 11 and digits.startswith("8"):
        return "+7" + digits[1:]
    if len(digits) == 10:
        return "+7" + digits
    return None


def normalize_phone_or_raise(value: str | None) -> str:
    """Как normalize_phone, но бросает понятную ошибку вместо None (для Pydantic-валидаторов)."""
    normalized = normalize_phone(value)
    if not normalized:
        raise ValueError(
            "Некорректный номер телефона. Введите российский номер, например +79991234567"
        )
    return normalized
