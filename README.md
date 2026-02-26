# ShlapaBank MVP (Backend + UI)

Учебный банковский API и статичный UI для демонстрации и практики тестирования: авторизация, счета, переводы, платежи, история операций. Детальные сценарии проверок — в файле **TEST_SCENARIOS.md**.

---

## Зачем этот проект

- Демо банковского API и веб-интерфейса.
- Практика написания API- и UI-тестов (smoke, сценарии, коды ошибок).
- Подготовка данных только через API (Helper, Admin), без доступа к БД.

---

## Требования

- **Docker** и **Docker Compose** (установка: [docker.com](https://docs.docker.com/get-docker/)).

---

## Как запустить

1. Установите Docker и запустите его.
2. Откройте каталог проекта в терминале.
3. Выполните:

```powershell
docker compose up --build
```

4. После старта:
   - **Swagger:** `http://localhost:8001/docs`
   - **UI:** `http://localhost:8001/ui/` (или `http://localhost:8001/ui/index.html`)

---

## Подготовка к тестам и демо

- **Пополнение счёта клиентом:** `POST /api/v1/accounts/{account_id}/topup` (тело: `amount`, `otp_code`). OTP — из `GET /api/v1/helper/otp/preview` или MVP-код `0000`.
- **Читерская шляпа:** на дашборде в левом верхнем углу — логотип-шляпа. Клик открывает окно быстрого изменения баланса **своих** счетов (пополнение, списание, обнуление) без OTP и без создания транзакций. Удобно для подготовки сценариев. Ручки — в блоке Helper ниже.

---

## Обзор API по блокам

Краткий список ручек и правил. Детальные коды ошибок — в Swagger. **Полный список сценариев и проверок (API и UI)** — см. **TEST_SCENARIOS.md**.

### Блок 1. Админ

- `GET /api/v1/admin/users` — список пользователей.
- `POST /api/v1/admin/users/{user_id}/block` / `unblock` — блокировка/разблокировка.
- `POST /api/v1/admin/accounts/{account_id}/credit` — пополнение счёта от имени админа (нужен OTP).
- `GET /api/v1/admin/transactions` — история всех транзакций.
- Доступ только для роли `ADMIN`; дефолтный логин/пароль: `admin` / `admin` (если не задано в `.env`).

### Блок 2. Авторизация

- `POST /api/v1/auth/register` — регистрация.
- `POST /api/v1/auth/login` — логин, выдача JWT.
- Логин: 6–20 символов, латиница/цифры; пароль: 8–30 символов, буквы/цифра/спецсимвол; после 5 неудачных входов — блокировка. Защищённые ручки: `Authorization: Bearer <token>`.

### Блок 3. Профиль

- `GET /api/v1/profile`, `PUT /api/v1/profile` — просмотр и обновление (контакты, смена пароля). Телефон `+7XXXXXXXXXX`, email уникальны.

### Блок 4. Счета

- `GET /api/v1/accounts`, `POST /api/v1/accounts`, `POST /api/v1/accounts/{id}/topup`, `DELETE /api/v1/accounts/{id}`.
- Лимиты: до 3 счетов в RUB, до 3 в сумме по USD/EUR/CNY; валюты RUB, USD, EUR, CNY; типы DEBIT, SAVINGS. Закрытие — только при нулевом балансе.

### Блок 5. Переводы

- `POST /api/v1/transfers` — между своими счетами по ID.
- `POST /api/v1/transfers/by-account` — по номеру счёта получателя.
- `GET /api/v1/transfers/rates` — курсы к RUB.
- `GET /api/v1/transfers/daily-usage` — остаток суточного лимита.
- `POST /api/v1/transfers/exchange` — обмен валют между своими счетами.
- Лимиты: разовая операция 10–300 000 ₽ (эквивалент), суточный лимит 1 000 000 ₽. Везде нужен `otp_code`.

### Блок 6. Платежи

- `GET /api/v1/payments/mobile/operators`, `GET /api/v1/payments/vendor/providers` — справочники.
- `POST /api/v1/payments/mobile` — мобильный платёж.
- `POST /api/v1/payments/vendor` — платёж поставщику (все категории: интернет/ТВ, ЖКХ, образование, благотворительность). Провайдеры и длины счёта — в справочнике.
- Все платежи — со счёта в RUB, обязателен OTP.

### Блок 7. Транзакции

- `GET /api/v1/transactions` — история операций клиента.
- `GET /api/v1/admin/transactions` — все транзакции (админ).
- Типы: TOPUP, TRANSFER, PAYMENT. Формат `description`: `admin_credit`, `self_topup`, `p2p_transfer`, `p2p_transfer_by_account`, `fx_exchange:...`, `mobile:...`, `vendor:...`.

### Блок 8. Настройки

- `GET /api/v1/settings` — настройки UI (в MVP — фиксированный ответ).

### Блок 9. Helper (и «читерская шляпа»)

Только для отладки и демо. Читерское окно — по клику на логотип-шляпу на дашборде.

- `GET /api/v1/helper/otp/preview` — получить OTP для операций.
- `POST /api/v1/helper/accounts/{account_id}/increase?amount=...` — увеличить баланс.
- `POST /api/v1/helper/accounts/{account_id}/decrease?amount=...` — уменьшить баланс.
- `POST /api/v1/helper/accounts/{account_id}/zero` — обнулить баланс.

Только свои активные счета; транзакции не создаются. Коды ошибок: `invalid_token`, `user_blocked`, `account_not_found`, `account_inactive`, `insufficient_funds`.

---

## UI mockup

Статичный веб-интерфейс с админ-панелью в левом сайдбаре. Запуск — по ссылке выше (`http://localhost:8001/ui/`).
