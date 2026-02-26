# Автотесты API ShlapaBank

## Что есть

Все автотесты вызывают **реальный API** (сервер должен быть запущен). Подготовка данных — **только через API** (регистрация, Helper, Admin), без доступа к БД.

| Файл | Покрытие |
|------|----------|
| `test_auth.py` | Регистрация (успех, login_not_unique, валидация логина/пароля), логин (успех, invalid_credentials, user_blocked) |
| `test_profile.py` | GET profile, PUT (имя, телефон, email), смена пароля, коды ошибок (email_not_unique, password_requires_both, invalid_current_password, password_reuse_not_allowed) |
| `test_accounts.py` | Список, создание (RUB/USD/EUR/CNY, DEBIT/SAVINGS), лимит RUB, закрытие (успех, not_found, zero_balance, already_closed), topup (успех, invalid_otp, amount_must_be_positive, account_not_found) |
| `test_transfers.py` | POST /transfers (успех, same_account, amount_too_small, insufficient_funds, currency_mismatch, from_savings, invalid_otp, exceeds_single_limit), by-account (успех, account_not_found), rates, daily-usage, exchange (успех, currency_mismatch, insufficient_funds) |
| `test_payments.py` | mobile (operators, успех, operator_not_supported, amount_out_of_range), vendor (providers, успех, provider_not_supported, account_number_invalid_length), education (provider_not_in_category, успех), internet/utilities/charity (успех), insufficient_funds |
| `test_helper.py` | otp/preview, increase, decrease, decrease insufficient_funds, zero, account_not_found, account_inactive |
| `test_admin.py` | users list, block/unblock, credit (успех, invalid_otp, account_not_found), admin/transactions, forbidden для клиента |
| `test_transactions.py` | Список транзакций, наличие записей после topup/transfer, поля ответа |
| `test_catalog.py` | GET /settings |

## Запуск

1. Поднять сервер и БД:
   ```powershell
   cd C:\Users\V\IdeaProjects\shlapabank
   docker compose up --build -d
   ```
2. Установить зависимости тестов (в виртуальном окружении или в контейнере):
   ```powershell
   cd backend
   pip install -r requirements.txt
   ```
3. Запустить тесты:
   ```powershell
   pytest tests/ -v
   ```
   Опционально: указать URL API, если сервер на другом порту:
   ```powershell
   $env:API_BASE_URL="http://localhost:8001/api/v1"; pytest tests/ -v
   ```

## Чего достаточно для реализации автотестов

- **Среда:** Python 3.x, зависимости из `requirements.txt` (в т.ч. `pytest`, `httpx`). Сервер доступен по `API_BASE_URL` (по умолчанию `http://localhost:8001/api/v1`).
- **Данные:** Все данные подготавливаются через API (регистрация, Helper increase/decrease/zero, Admin block/unblock/credit). Отдельная БД или фикстуры с прямым доступом к БД не требуются.
- **Ручки:** Достаточно всех описанных в README и TEST_SCENARIOS.md ручек. Для тестов используются:
  - Auth: register, login
  - Profile: GET, PUT
  - Accounts: GET, POST, DELETE, POST …/topup
  - Transfers: GET rates, GET daily-usage, POST, POST by-account, POST exchange
  - Payments: GET mobile/operators, GET vendor/providers, POST mobile, vendor, internet, utilities, education, charity
  - Helper: GET otp/preview, POST …/increase, …/decrease, …/zero
  - Admin: GET users, GET transactions, POST …/block, …/unblock, POST …/credit
  - Transactions: GET
  - Settings: GET
- **OTP:** В тестах используется MVP-код `0000` (из конфига), что достаточно для всех сценариев с OTP.

Этого хватает, чтобы реализовать и запускать описанные автотесты без доступа к БД и без дополнительных сервисов.
