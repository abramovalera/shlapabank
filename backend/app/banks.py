"""Справочник банков для переводов по номеру телефона."""

OUR_BANK_CODE = "shlapabank"

# Наш банк + 15 внешних (выдуманные названия, понятные по смыслу)
BANKS_CATALOG: list[tuple[str, str]] = [
    (OUR_BANK_CODE, "Наш банк"),
    ("alpha", "Бабальфа Банк"),
    ("tinkoff", "Пенькофф Банк"),
    ("sber", "Сберушка Банк"),
    ("vtb", "ВТБей"),
    ("gazprombank", "Газовик Банк"),
    ("raiffeisen", "Райфейзен Банк"),
    ("rosbank", "Россик Банк"),
    ("otkritie", "Банк Откройка"),
    ("unicredit", "Юникред Банк"),
    ("rshb", "СельхозФинанс"),
    ("sovcombank", "Совком Плюс"),
    ("promsvyaz", "ПромСбер Банк"),
    ("mts", "МТСей Финанс"),
    ("post", "ПочтаФинанс"),
    ("uralsib", "УралСиб Банк"),
]


def get_external_bank_codes() -> list[str]:
    """Коды банков, кроме нашего (для случайного назначения клиенту 0–5 банков)."""
    return [code for code, _ in BANKS_CATALOG if code != OUR_BANK_CODE]
