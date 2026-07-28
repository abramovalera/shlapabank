# ShlapaBank — учебный банковский проект

Полноценный банк-клон для практики автотестов (UI и API). Backend на FastAPI + PostgreSQL, frontend на React + Vite + TypeScript, всё поднимается одной командой `docker compose up`.

**Что важно:**
- **UI:** http://localhost:8080/
- **Swagger:** http://localhost:8080/docs
- **Демо-клиент:** логин `fullclient`, пароль `FullClient1!` (готовый счёт + карты + история)
- **Админ:** логин `admin`, пароль `adminadmin`
- **Общий пароль сгенерированных пользователей:** `StrongPass1!`

---

## Оглавление

1. [Быстрый старт](#быстрый-старт)
2. [Кнопка «Демо-режим» на логине](#демо-режим)
3. [Бизнес-требования и как тестировать](#бизнес-требования)
   - Регистрация и вход
   - Профиль
   - Счета
   - Карты
   - Переводы (4 типа)
   - Платежи (мобильная связь, ЖКХ, образование, благотворительность)
   - История и статистика
4. [Единый формат ошибок](#единый-формат-ошибок)
5. [База данных](#база-данных)
   - Как подключиться
   - Схема таблиц
   - Полезные SQL-запросы
6. [Массовый сид (50 000 пользователей)](#массовый-сид)
7. [Тест-фичи](#тест-фичи)

---

## Быстрый старт

```bash
docker compose up --build
```

Первый запуск занимает 1–3 минуты (собирается фронт + сеется 50 000 пользователей). Дальше — секунды.

Проверить что всё работает:
- http://localhost:8080/ → UI, экран входа
- http://localhost:8080/docs → Swagger
- http://localhost:8080/health → `{"status":"ok"}`

**Остановить:** `docker compose down`.  
**Полностью сбросить (включая БД):** `docker compose down -v && docker compose up --build`.

### Как авторизоваться в Swagger

Все защищённые эндпоинты требуют JWT-токен. Получить его так:

1. Открыть `POST /auth/login` в Swagger, нажать **Try it out**.
2. Тело запроса — любые валидные credentials, например админ:
   ```json
   {"login": "admin", "password": "adminadmin"}
   ```
   или демо-клиент `{"login": "fullclient", "password": "FullClient1!"}`.
3. Скопировать `access_token` из ответа.
4. Нажать зелёную кнопку **Authorize** вверху страницы, вставить токен (без слова `Bearer`) и подтвердить.

Все последующие вызовы будут автоматически подписываться этим токеном.

---

## Демо-режим

На экране логина есть кнопка **«😊 Войти в демо-режим»** — сразу подставляет `fullclient / FullClient1!` и заходит без ввода. У этого пользователя богатый набор данных: 6 счетов в 4 валютах, несколько карт разных дизайнов, история операций по всем категориям за 30 дней.

---

## Бизнес-требования

### Регистрация и вход

**Регистрация — 2 шага:**
1. Логин: 6–20 символов, только латиница и цифры. Асинхронная проверка уникальности через `GET /auth/login-available?login=…`.
2. Пароль: минимум 8 символов, индикатор надёжности, чекбокс условий.

После успеха — автологин + предложение установить 4-значный PIN.

**Вход:** принимает **логин ИЛИ телефон** в поле «login» (`POST /auth/login`). Определяется автоматически.

**PIN быстрого входа:**
- Хранится в браузере (localStorage), TTL 7 дней от последнего использования.
- При открытии новой вкладки с валидным токеном → экран `/pin` (4 квадратика).
- 3 неверные попытки → сброс токена + переход на пароль.
- Явный «Выйти» → PIN тоже стирается.

**Восстановление пароля — 3 шага:**
1. Ввод логина → `POST /auth/password/reset-request` (триггер генерации OTP на бэке, всегда `200 OK` — без утечки существования логина).
2. Забрать код через **единую ручку OTP** → `GET /helper/otp/preview?login=<логин>`, ввести код.
3. Новый пароль → `POST /auth/password/reset-confirm`.

**Что тестировать:**
- Успешная регистрация → редирект → PIN modal.
- Занятый логин → 400 с `code: login_not_unique`.
- Неверный OTP при восстановлении → 400 `invalid_otp_code`.
- 5 неудачных логинов → пользователь блокируется (`user_blocked`).

---

### Профиль

**`GET /profile`** — данные текущего пользователя.  
**`PUT /profile`** — обновить (все поля опциональные): `first_name`, `last_name`, `email`, `phone`, `avatar_color`, `date_of_birth`, `theme`, `sbp_primary_bank`, а также смена пароля (`current_password` + `new_password`).  
**`DELETE /profile`** — **self-destruct**: полностью удаляет пользователя и все его данные. Используйте в автотестах, чтобы не засорять БД.

**Что тестировать:**
- Смена имени/фамилии → аватар в шапке обновляется.
- Смена цвета аватара → применяется на все аватары в приложении.
- Смена пароля с неверным текущим → `invalid_current_password`.
- Попытка занятого email → `email_not_unique`.
- Удаление аккаунта → logout + редирект на `/login`.

---

### Счета

Валюты: RUB, USD, EUR, CNY. Типы: DEBIT, SAVINGS.

**`POST /accounts`** — открыть счёт. Опциональное `name` (иначе «Счёт N» / «Накопительный N»).  
**`GET /accounts`** — свой список.  
**`GET /accounts/{id}`** — детали одного счёта.  
**`PATCH /accounts/{id}`** — переименовать.  
**`DELETE /accounts/{id}`** — закрыть (баланс должен быть 0).  
**`POST /accounts/{id}/deposit`** — пополнить **без OTP** (клик на логотипе банка в UI).  
**`POST /accounts/{id}/topup`** — пополнить **с OTP** (моделирует «настоящее» пополнение).

**Что тестировать:**
- Открыть счёт без имени → авто «Счёт 3».
- Закрыть счёт с ненулевым балансом → `account_close_requires_zero_balance`.
- Открыть 4-й рублёвый счёт → `account_limit_exceeded` (лимит 3 RUB / 3 валютных).
- Deposit → баланс увеличивается, появляется транзакция `TOPUP` с описанием `self_deposit`.

---

### Карты

Типы карт: **Regular** (3 дизайна: CLASSIC/EMERALD/GRAPHITE) и **Gold** (4 дизайна: SUNSET/ROSE/GOLD_BAR/GOLD_MARBLE). У каждой карты есть привязка к DEBIT-счёту (максимум 5 карт на счёт).

**`POST /cards`** — выпустить. `account_id` определяет валюту, `payment_system` автоподбирается (RUB→MIR, иначе VISA).  
**`GET /cards`** / **`GET /cards/{id}`** — список / детали.  
**`GET /cards/{id}/reveal`** — полный номер + CVV (учебный: CVV детерминированный).  
**`PATCH /cards/{id}`** — блок/разблок и/или смена дизайна.  
**`POST /cards/{id}/reissue`** — атомарный перевыпуск: старая удаляется, новая с тем же типом/дизайном + новый номер + новая дата.  
**`DELETE /cards/{id}`** — закрыть.

**Что тестировать:**
- Выпустить Gold с дизайном CLASSIC → ошибка (несовместимый дизайн).
- 6-я карта на один счёт → `card_limit_exceeded`.
- Заблокировать → PATCH `{status:"BLOCKED"}`, разблокировать → `{status:"ACTIVE"}`.
- Reveal одной карты → CVV всегда одинаковый (детерминизм).
- Reissue → новая карта имеет другой номер, `card_id` старых транзакций обнуляется.

---

### Переводы

**4 типа переводов:**

**1) Между своими счетами** — `POST /transfers`. Без OTP. Валюты должны совпадать.

**2) По номеру счёта** — `POST /transfers/by-account` (если найден в нашем банке) или `POST /transfers/by-account/external` (не найден → внешний с комиссией 5%). Есть проверочный `GET /transfers/by-account/check?number=`.

**3) По телефону (СБП)** — `POST /transfers/by-phone`. Перед этим `GET /transfers/by-phone/check?phone=` → возвращает список банков получателя и его основной банк. Комиссия 2% для внешних, 0 для нашего. Только RUB.

**4) По номеру карты** — `POST /transfers/by-card`. `GET /transfers/by-card/check?number=` → определяет, наша ли карта. Комиссия 1.5% для внешних.

Все переводы (кроме «между своими») требуют OTP. Получить актуальный код: `GET /helper/otp/preview`.

**Что тестировать:**
- Перевод между своими разных валют → `currency_mismatch`.
- Недостаточно средств → `insufficient_funds`.
- Превышение суточного лимита → `transfer_amount_exceeds_daily_limit`.
- Неверный OTP → `invalid_otp_code`.
- Свой номер карты в by-card → `is_own: true` в check-ответе.
- Внешний банк по phone → есть fee 2%, транзакция типа TRANSFER.

---

### Платежи

**Мобильная связь:** `POST /payments/mobile` — оператор + телефон + сумма + OTP. Диапазон 100–12000₽.  
**Поставщики (ЖКХ/интернет/образование/благотворительность):** `POST /payments/vendor` — provider + account_number (длина зависит от поставщика) + сумма + OTP.

Категории и провайдеры — в `GET /payments/vendor/providers`.

**Что тестировать:**
- Оплата не с RUB счёта → `payment_requires_rub_account`.
- Сумма вне диапазона мобильной → `payment_amount_out_of_range`.
- Неверная длина лицевого счёта → `payment_account_length_mismatch`.
- После успеха — новая транзакция типа PAYMENT.

---

### История и статистика

**`GET /transactions`** — все операции пользователя, сортировка по дате.  
**`GET /transactions/{id}`** — одна операция JSON.  
**`GET /transactions/{id}/receipt`** — HTML-чек (браузер скачает файл).  
**`GET /statistics/monthly?year=&month=`** — статистика за месяц: сумма трат, разбивка по категориям, лимит и процент использования.

---

## Единый формат ошибок

Все 4xx/5xx ответы имеют одинаковую структуру:

```json
{
  "error": {
    "code": "insufficient_funds",
    "message": "Недостаточно средств",
    "field": null
  }
}
```

- `code` — стабильный snake_case, для программной обработки.
- `message` — человекочитаемое русское сообщение.
- `field` — имя поля-виновника для валидационных ошибок (`null` для бизнес-ошибок).

Полный словарь кодов — `backend/app/error_messages.py`.

---

## База данных

**PostgreSQL 16** внутри контейнера `shlapabank-db`. Проброшена наружу на порт `5432`.

**Подключение из хоста:**
```bash
psql -h localhost -p 5432 -U shlapabank -d shlapabank
# пароль: shlapabank
```

**Подключение внутри контейнера:**
```bash
docker exec -it shlapabank-db psql -U shlapabank -d shlapabank
```

**GUI-клиенты:** DBeaver, TablePlus, DataGrip — параметры выше.

### Схема таблиц

| Таблица              | Что хранит                                                     |
| -------------------- | -------------------------------------------------------------- |
| `users`              | Пользователи: логин, пароль, ФИО, phone, роль (CLIENT/ADMIN), status, avatar_color, sbp_primary_bank |
| `accounts`           | Счета: user_id, currency, account_type, balance, name, account_number, is_primary, is_active |
| `cards`              | Карты: account_id, number, last4, holder_name, expiry, card_type (REGULAR/GOLD), payment_system, design, status |
| `transactions`       | Операции: from/to_account_id, card_id, type (TOPUP/TRANSFER/PAYMENT), amount, currency, fee, description |
| `banks`              | Справочник банков для СБП                                      |
| `user_banks`         | Внешние банки, которые пользователь принимает через СБП        |
| `transfer_contacts`  | Счётчик частоты переводов по номеру телефона                   |

### Полезные SQL-запросы

**Все пользователи с 2+ счетами:**
```sql
SELECT u.login, COUNT(a.id) AS accounts
FROM users u
JOIN accounts a ON a.user_id = u.id AND a.is_active
GROUP BY u.id
HAVING COUNT(a.id) >= 2
ORDER BY accounts DESC LIMIT 20;
```

**Клиенты с ненулевым балансом хотя бы на одном счёте:**
```sql
SELECT u.login, u.first_name, u.last_name, SUM(a.balance) AS total_rub
FROM users u
JOIN accounts a ON a.user_id = u.id AND a.currency = 'RUB'
GROUP BY u.id
HAVING SUM(a.balance) > 0
ORDER BY total_rub DESC LIMIT 50;
```

**Все Gold-карты:**
```sql
SELECT u.login, c.last4, c.design, a.balance, a.currency
FROM cards c
JOIN accounts a ON a.id = c.account_id
JOIN users u    ON u.id = a.user_id
WHERE c.card_type = 'GOLD' AND c.status = 'ACTIVE'
LIMIT 100;
```

**Топ-10 пользователей по числу транзакций за 30 дней:**
```sql
SELECT u.login, COUNT(t.id) AS tx_count
FROM transactions t
JOIN users u ON u.id = t.initiated_by
WHERE t.created_at >= NOW() - INTERVAL '30 days'
GROUP BY u.id
ORDER BY tx_count DESC LIMIT 10;
```

**Общая сумма комиссий, собранных банком:**
```sql
SELECT SUM(fee) AS total_fees, currency FROM transactions
WHERE fee > 0 GROUP BY currency;
```

**Заблокированные карты и их владельцы:**
```sql
SELECT u.login, u.phone, c.last4, c.card_type
FROM cards c
JOIN accounts a ON a.id = c.account_id
JOIN users u    ON u.id = a.user_id
WHERE c.status = 'BLOCKED';
```

**Дубли по телефону (быть не должно):**
```sql
SELECT phone, COUNT(*) FROM users
WHERE phone IS NOT NULL
GROUP BY phone HAVING COUNT(*) > 1;
```

**Очистка тестовых пользователей (кроме демо/админа):**
```sql
DELETE FROM users
WHERE login NOT IN ('fullclient','admin')
  AND login LIKE 'u%';
```

---

## Массовый сид

При старте контейнера, если пользователей в БД меньше `BULK_SEED_USERS` (по умолчанию 50 000), автоматически досеиваются недостающие. Каждый — с 1–4 счетами (разные валюты, балансы), 0–3 картами (Regular/Gold, разные дизайны, разные статусы), 3–20 транзакциями за последние 90 дней.

**Общий пароль:** `StrongPass1!` — используется для всех сгенерированных пользователей, удобно для нагрузочных тестов.

**Управление** через переменные окружения (в `docker-compose.yml`):
- `BULK_SEED_ENABLED=1` — включить (по-умолчанию), `0` — выключить.
- `BULK_SEED_USERS=50000` — целевое число пользователей.

**Первый запуск занимает 30–90 секунд** (батчами по 1000, вставляется около 200k транзакций и 100k карт). Следующие запуски — секунды (сеятель видит что цель достигнута).

---

## Тест-фичи

Специальные штуки для удобства автотестов и отладки:

**1. Тест-пополнение** — кнопка в UI, клик на оранжевом «S» в шапке. Открывает модалку быстрого пополнения любого своего счёта без OTP. Использует `POST /accounts/{id}/deposit`.

**2. Единая ручка OTP** — `GET /helper/otp/preview` возвращает актуальный OTP-код. Это **единственная точка выдачи OTP** во всём проекте (переводы, платежи, смена пароля, восстановление):
- **С Bearer-токеном (без параметров)** → код текущего пользователя. Используется во всём UI после логина.
- **Без токена, с `?login=<логин>`** → код указанного пользователя. Используется на экране восстановления пароля.

Учебный режим: реального SMS нет, код всегда возвращается в JSON. В проде этот эндпоинт закрывается.

**3. Self-destruct** — `DELETE /profile` удаляет всё связанное с пользователем каскадно. В UI — вкладка «Безопасность» → «Опасная зона» → ввод «УДАЛИТЬ».

**4. Клик по мини-карте / счёту** ведёт на отдельную страницу деталей — удобно для проверки роутинга.

**5. Логин по телефону или логину** — оба поля работают в едином инпуте.

---

## Технологический стек

**Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0, PostgreSQL 16, JWT (python-jose).  
**Frontend:** React 18, Vite, TypeScript, Tailwind CSS, TanStack Query, Zustand, React Router.  
**Инфраструктура:** Docker Compose, nginx (в контейнере ui).

---

## Куда смотреть в коде

- Backend роуты: `backend/app/routes/*.py`
- Модели: `backend/app/models.py`
- Схемы (pydantic): `backend/app/schemas.py`
- Автосид демо: `backend/app/startup.py`
- Массовый сид: `backend/app/bulk_seed.py`
- Коды ошибок: `backend/app/error_messages.py`
- Frontend страницы: `ui/src/pages/`
- UI-компоненты: `ui/src/features/`, `ui/src/shared/ui/`
