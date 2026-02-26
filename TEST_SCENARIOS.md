# ShlapaBank — сценарии для тестирования (API и UI)

Руководство для тестировщиков и разработчиков (в т.ч. новичков): что можно проверить, в каком порядке. Сначала **Smoke** (основные ручки и UI живы), затем **сценарии** по API и UI.

**Базовый URL API:** `http://localhost:8001/api/v1`

---

## Подготовка тестовых данных только через API

Перед сценариями и между ними **тестовые данные подготавливаются только через API** — без прямого доступа к БД:

- **Helper API** (`/api/v1/helper/...`) — пополнение/списание/обнуление баланса **своих** счетов (без OTP и без создания транзакций), получение OTP для операций:
  - `GET /helper/otp/preview` — получить текущий OTP-код (или использовать MVP-код `0000` из `.env`);
  - `POST /helper/accounts/{account_id}/increase?amount=...` — увеличить баланс;
  - `POST /helper/accounts/{account_id}/decrease?amount=...` — уменьшить баланс;
  - `POST /helper/accounts/{account_id}/zero` — обнулить баланс.
- **Admin API** (под логином `admin` / `admin`) — блокировка/разблокировка пользователей, пополнение **любого** счёта с созданием транзакции:
  - `POST /admin/accounts/{account_id}/credit` — пополнение счёта (требует OTP);
  - `POST /admin/users/{user_id}/block` / `unblock`.

Используйте эти ручки, чтобы подготовить пользователей, счета с нужным балансом и OTP перед каждым тест-кейсом или группой кейсов.

---

# Уровень A — Smoke (быстрая проверка «всё живое»)

Цель: убедиться, что основные ручки отвечают и UI открывается. Без детальных проверок полей.

---

## A.1 Smoke API

Вызвать перечисленные ручки (с токеном после логина); ожидаемый результат — указанный код ответа.

| Ручка | Метод | Путь | Ожидание |
|-------|--------|------|----------|
| Логин | POST | `/auth/login` | 200 (body: `access_token`) |
| Профиль | GET | `/profile` | 200 (с Bearer) или 401 (без) |
| Список счетов | GET | `/accounts` | 200 |
| Открыть счёт | POST | `/accounts` | 201 (body: currency, account_number) |
| Курсы валют | GET | `/transfers/rates` | 200 |
| Суточный лимит | GET | `/transfers/daily-usage` | 200 |
| Перевод (при наличии двух RUB-счетов и баланса) | POST | `/transfers` | 201 или 400 (например insufficient_funds) |
| Справочник операторов | GET | `/payments/mobile/operators` | 200 |
| Справочник провайдеров | GET | `/payments/vendor/providers` | 200 |
| Мобильный платёж / платёж поставщику (при балансе и OTP) | POST | `/payments/mobile` или `/payments/vendor` | 201 или 400 |
| История транзакций | GET | `/transactions` | 200 |
| Настройки | GET | `/settings` | 200 |
| OTP preview | GET | `/helper/otp/preview` | 200 |
| Увеличить баланс (Helper) | POST | `/helper/accounts/{id}/increase?amount=100` | 200 (при своём счёте) |
| Список пользователей (админ) | GET | `/admin/users` | 200 (с токеном admin) или 403 (клиент) |
| История транзакций (админ) | GET | `/admin/transactions` | 200 (с токеном admin) |

---

## A.2 Smoke UI

Короткий список проверок в браузере (без обязательного выполнения операций до конца):

1. Открыть приложение (`http://localhost:8001/ui/`).
2. Войти по логину и паролю — попасть на дашборд.
3. Увидеть дашборд: счета, меню (переводы, платежи и т.д.).
4. Открыть раздел переводов и форму перевода (достаточно открыть экран).
5. Открыть раздел платежей и форму платежа (мобильный или поставщик).
6. Открыть «читерское» окно — клик по логотипу-шляпе в левом верхнем углу.
7. Выйти из учётной записи.

После Smoke переходите к сценариям ниже.

---

# Уровень B — Сценарии

Детальные сценарии с шагами и ожидаемыми ответами. Разделение: **API** (B.1) и **UI** (B.2).

---

## B.1 Сценарии API

### B.1.1 Базовые сценарии API (регистрация, профиль, счета, один перевод, один платёж)

Минимум подготовок через Helper.

---

#### 1.1 API: Авторизация

| Что проверить | Метод | Путь | Ожидание (API) |
|---------------|--------|------|----------------|
| Регистрация с валидными данными | POST | `/auth/register` | 201, тело: `id`, `login`, `role`, `status` (без пароля). |
| Логин с корректными креды | POST | `/auth/login` | 200, `access_token`, `token_type: bearer`. |
| Регистрация с занятым логином | POST | `/auth/register` | 409, `detail`: `validation_error: login_not_unique`. |
| Логин с неверным паролем | POST | `/auth/login` | 401, `detail`: `invalid_credentials`. |
| Логин под заблокированным пользователем | POST | `/auth/login` | 403, `detail`: `user_blocked`. |
| Регистрация: логин &lt; 6 или &gt; 20 символов | POST | `/auth/register` | 422 (валидация). |
| Регистрация: логин с недопустимыми символами (пробел, кириллица) | POST | `/auth/register` | 422. |
| Регистрация: пароль = логин | POST | `/auth/register` | 400, `detail`: `validation_error: password_equals_login`. |
| Регистрация: слабый пароль (без цифры/заглавной/спецсимвола) | POST | `/auth/register` | 400, `detail`: `validation_error: weak_password`. |

**Бэкенд:** после 5 неудачных попыток входа пользователь должен перейти в `BLOCKED`; после unblock — снова `ACTIVE`, счётчик сброшен.

---

#### 1.2 API: Профиль

| Что проверить | Метод | Путь | Ожидание (API) |
|---------------|--------|------|----------------|
| Получить профиль с Bearer | GET | `/profile` | 200, поля: `login`, `email`, `status`, `first_name`, `last_name`, `phone`. |
| Без токена / неверный токен | GET | `/profile` | 401, `detail`: `invalid_token`. |
| Обновить имя, фамилию, телефон, email | PUT | `/profile` | 200, обновлённые поля в ответе. |
| Телефон не `+7XXXXXXXXXX` | PUT | `/profile` | 422. |
| Email занят другим пользователем | PUT | `/profile` | 409, `detail`: `validation_error: email_not_unique`. |
| Телефон занят другим пользователем | PUT | `/profile` | 409, `detail`: `validation_error: phone_not_unique`. |
| Смена пароля: только current без new (или наоборот) | PUT | `/profile` | 400, `detail`: `validation_error: password_change_requires_both_fields`. |
| Смена пароля: неверный текущий пароль | PUT | `/profile` | 401, `detail`: `invalid_current_password`. |
| Смена пароля: новый пароль = текущий | PUT | `/profile` | 400, `detail`: `validation_error: password_reuse_not_allowed`. |

**Бэкенд:** после смены пароля старый токен по желанию можно проверить (должен оставаться валидным до истечения), новый логин с новым паролем — успешен.

---

#### 1.3 API: Счета

| Что проверить | Метод | Путь | Ожидание (API) |
|---------------|--------|------|----------------|
| Список счетов | GET | `/accounts` | 200, массив активных счетов (только свои). |
| Открыть счёт RUB / USD / EUR / CNY, DEBIT / SAVINGS | POST | `/accounts` | 201, новый счёт с `account_number`, `balance: 0.00`. |
| Превышение лимита: 4-й RUB-счёт | POST | `/accounts` | 400, `detail`: `account_limit_exceeded`. |
| Превышение лимита: 4-й счёт в валюте USD/EUR/CNY | POST | `/accounts` | 400, `detail`: `account_limit_exceeded`. |
| Закрыть счёт с балансом 0 | DELETE | `/accounts/{id}` | 200, `detail`: `account_closed`. |
| Закрыть несуществующий/чужой счёт | DELETE | `/accounts/{id}` | 404, `detail`: `not_found`. |
| Закрыть счёт с ненулевым балансом | DELETE | `/accounts/{id}` | 400, `detail`: `account_close_requires_zero_balance`. |
| Закрыть уже закрытый счёт | DELETE | `/accounts/{id}` | 400, `detail`: `account_already_closed`. |

**Бэкенд:** после закрытия счёт не возвращается в `GET /accounts`; лимиты — не более 3 RUB и не более 3 по USD+EUR+CNY в сумме.

---

#### 1.4 API: Один перевод и одна оплата (подготовка через Helper)

Подготовка: залогиниться, открыть два RUB-счёта, через Helper пополнить один (`increase`), взять OTP из `/helper/otp/preview` или использовать `0000`.

| Что проверить | Метод | Путь | Ожидание (API) |
|---------------|--------|------|----------------|
| Перевод между своими счетами (одна валюта) | POST | `/transfers` | 201, транзакция `TRANSFER`, `description`: `p2p_transfer`. |
| Мобильный платёж (оператор из справочника, телефон +7…) | POST | `/payments/mobile` | 201, транзакция `PAYMENT`, `description`: `mobile:OPERATOR:PHONE`. |
| Платёж поставщику (провайдер и длина номера из справочника) | POST | `/payments/vendor` | 201, `description`: `vendor:PROVIDER:ACCOUNT_NUMBER`. |

**Бэкенд:** балансы источника и получателя изменились; в `GET /transactions` появились соответствующие записи с верными `amount`, `currency`, `description`.

---

#### 1.5 Справочники и настройки (API)

| Что проверить | Метод | Путь | Ожидание (API) |
|---------------|--------|------|----------------|
| Список операторов и лимиты мобильной связи | GET | `/payments/mobile/operators` | 200, `operators`, `amountRangeRub` (100–12000). |
| Список провайдеров и длина лицевого счёта | GET | `/payments/vendor/providers` | 200, массив `name`, `accountLength`. |
| Курсы валют к RUB | GET | `/transfers/rates` | 200, `toRub` (RUB, USD, EUR, CNY). |
| Настройки UI | GET | `/settings` | 200, `theme`, `language`, `notificationsEnabled`. |

---

### B.1.2 Валидация и коды ошибок API

Пополнение (topup), переводы и платежи — полный перечень кодов ошибок и проверка состояния бэкенда (история, балансы).

---

#### 2.1 API: Пополнение счёта (self-topup) и OTP

Подготовка: счёт открыт, OTP — из `GET /helper/otp/preview` или код `0000`.

| Что проверить | Метод | Путь | Ожидание (API) |
|---------------|--------|------|----------------|
| Успешное пополнение | POST | `/accounts/{id}/topup` | 201, транзакция `TOPUP`, `description`: `self_topup`. |
| Неверный OTP | POST | `/accounts/{id}/topup` | 400, `detail`: `invalid_otp_code`. |
| Сумма ≤ 0 | POST | `/accounts/{id}/topup` | 400, `detail`: `amount_must_be_positive`. |
| Чужой/неактивный счёт | POST | `/accounts/{id}/topup` | 404, `detail`: `account_not_found`. |
| Получить OTP | GET | `/helper/otp/preview` | 200, поля `userId`, `otp`, `ttlSeconds`, `message`. |

**Бэкенд:** после topup баланс счёта вырос на `amount`; в `GET /transactions` одна запись `TOPUP` с `self_topup`.

---

#### 2.2 API: Переводы — все коды ошибок

Подготовка: два своих счёта (RUB), при необходимости баланс через Helper. OTP: `0000` или из preview.

| Что проверить | Метод | Путь | Ожидание (API) |
|---------------|--------|------|----------------|
| from_account_id = to_account_id | POST | `/transfers` | 400, `detail`: `transfer_same_account`. |
| Сумма &lt; 10 | POST | `/transfers` | 400, `detail`: `transfer_amount_too_small`. |
| Сумма &gt; 300 000 (в рублёвом эквиваленте) | POST | `/transfers` | 400, `detail`: `transfer_amount_exceeds_single_limit`. |
| Недостаточно средств | POST | `/transfers` | 400, `detail`: `insufficient_funds`. |
| Разные валюты | POST | `/transfers` | 400, `detail`: `currency_mismatch`. |
| Счёт отправителя — SAVINGS | POST | `/transfers` | 400, `detail`: `transfer_not_allowed_from_savings`. |
| Неактивный счёт | POST | `/transfers` | 400, `detail`: `account_inactive`. |
| Чужой счёт | POST | `/transfers` | 403, `detail`: `forbidden_account_access` или 404 `account_not_found`. |
| Неверный OTP | POST | `/transfers` | 400, `detail`: `invalid_otp_code`. |

**Бэкенд:** при успешном переводе балансы двух счетов изменились на ±amount; одна запись в `GET /transactions` с `p2p_transfer`.

---

#### 2.3 API: Платежи — все коды ошибок

Подготовка: RUB-счёт с балансом, OTP. Справочники: `GET /payments/mobile/operators`, `GET /payments/vendor/providers` (длины номеров по провайдерам).

| Что проверить | Метод | Путь | Ожидание (API) |
|---------------|--------|------|----------------|
| Оператор не из списка (mobile) | POST | `/payments/mobile` | 400, `detail`: `payment_operator_not_supported`. |
| Сумма вне 100–12 000 (mobile) | POST | `/payments/mobile` | 400, `detail`: `payment_amount_out_of_range`. |
| Счёт не RUB | POST | `/payments/mobile` или `/payments/vendor` | 400, `detail`: `payment_requires_rub_account`. |
| Провайдер не из списка (vendor) | POST | `/payments/vendor` | 400, `detail`: `payment_provider_not_supported`. |
| Неверная длина лицевого счёта (vendor) | POST | `/payments/vendor` | 400, `detail`: `payment_account_number_invalid_length`. |
| Сумма вне 100–500 000 (vendor) | POST | `/payments/vendor` | 400, `detail`: `payment_amount_out_of_range`. |
| Недостаточно средств | POST | `/payments/mobile` или любой платёж | 400, `detail`: `insufficient_funds`. |

**Длины номера счёта по провайдеру (из кода):** RostelCom+ 15, TV360 12, FiberNet 14; ZhKH-Service 20, UO-Gorod 18, DomComfort 22, GasEnergy 22, CityWater 18; UniEdu 16, EduCenter+ 16; GoodHands 10, KindKids 12.

**Бэкенд:** после успешного платежа баланс уменьшился; в истории одна запись `PAYMENT` с префиксом в `description` (mobile:… или vendor:…).

---

#### 2.4 API и бэкенд: История транзакций и статусы

| Что проверить | Метод | Путь | Ожидание |
|---------------|--------|------|----------|
| Клиент видит только свои операции | GET | `/transactions` | 200; все записи связаны с его счетами или `initiated_by` = его id. |
| Типы транзакций и description | GET | `/transactions` | Есть записи с `type`: TOPUP, TRANSFER, PAYMENT; `description` по формату из README (admin_credit, self_topup, p2p_transfer, p2p_transfer_by_account, fx_exchange:..., mobile:..., vendor:...). |
| Статусы транзакций | GET | `/transactions` | У успешных операций `status`: COMPLETED. |

**Бэкенд:** после каждой успешной финансовой операции соответствующая запись появляется в ответе `GET /transactions` с корректными `amount`, `currency`, `from_account_id`/`to_account_id` где применимо.

---

#### 2.5 API: Helper (подготовка данных)

| Что проверить | Метод | Путь | Ожидание (API) |
|---------------|--------|------|----------------|
| Увеличить баланс | POST | `/helper/accounts/{id}/increase?amount=100` | 200, счёт с увеличенным `balance`. |
| Уменьшить баланс | POST | `/helper/accounts/{id}/decrease?amount=50` | 200, счёт с уменьшенным `balance`. |
| Уменьшить больше баланса | POST | `/helper/accounts/{id}/decrease?amount=...` | 400, `detail`: `insufficient_funds`. |
| Обнулить баланс | POST | `/helper/accounts/{id}/zero` | 200, `balance`: 0.00. |
| Чужой/несуществующий счёт | POST | `/helper/accounts/{id}/...` | 404, `detail`: `account_not_found`. |
| Неактивный счёт | POST | `/helper/accounts/{id}/...` | 400, `detail`: `account_inactive`. |

**Бэкенд:** транзакции при этом не создаются; баланс меняется только в счёте.

---

### B.1.3 Сложные сценарии API и E2E

Лимиты переводов, перевод по номеру счёта, обмен валют, платежи поставщикам, блокировка, админ, цепочки. Подготовка — только через API (Helper + Admin).

---

#### 3.1 API и бэкенд: Лимиты переводов

Подготовка: через Helper довести баланс RUB-счетов до сумм, позволяющих делать переводы; использовать `0000` или OTP из preview.

| Что проверить | Метод | Путь | Ожидание |
|---------------|--------|------|----------|
| Разовая операция &lt; 10 ₽ | POST | `/transfers` | 400, `detail`: `transfer_amount_too_small`. |
| Разовая операция &gt; 300 000 ₽ (эквивалент) | POST | `/transfers` | 400, `detail`: `transfer_amount_exceeds_single_limit`. |
| Серия переводов до суточного лимита 1 000 000 ₽ | POST | `/transfers` (несколько раз) | Успех, пока сумма за день не превысит лимит. |
| Следующий перевод после исчерпания суточного лимита | POST | `/transfers` | 400, `detail`: `transfer_amount_exceeds_daily_limit`. |
| Остаток лимита за день | GET | `/transfers/daily-usage` | 200, `limits.perUserDaily` (used/remaining), при необходимости `perAccountDaily`. |

**Бэкенд:** сумма всех успешных переводов за текущий день (в рублёвом эквиваленте по курсам из `/transfers/rates`) не превышает 1 000 000; после превышения новые переводы отклоняются.

---

#### 3.2 API и бэкенд: Перевод по номеру счёта (два пользователя)

Подготовка: два пользователя (два логина), у каждого RUB-счёт; у отправителя баланс через Helper. OTP у отправителя.

| Что проверить | Метод | Путь | Ожидание |
|---------------|--------|------|----------|
| Успешный перевод по `target_account_number` | POST | `/transfers/by-account` | 201, `description`: `p2p_transfer_by_account`. |
| Несуществующий номер счёта | POST | `/transfers/by-account` | 404, `detail`: `account_not_found`. |
| Те же лимиты и валидации, что и для POST /transfers | POST | `/transfers/by-account` | Те же коды (amount_too_small, exceeds_single_limit, exceeds_daily_limit, insufficient_funds, SAVINGS, currency_mismatch и т.д.). |

**Бэкенд:** у отправителя баланс уменьшился, у получателя (по номеру счёта) увеличился; у обоих в `GET /transactions` есть запись с `p2p_transfer_by_account`, у отправителя сумма отрицательная по смыслу (списание), у получателя — зачисление.

---

#### 3.3 API и бэкенд: Обмен валют

Подготовка: два счёта разной валюты (например RUB и USD), RUB пополнен через Helper. Курсы взять из `GET /transfers/rates`, посчитать ожидаемый target_amount. OTP: `0000` или preview.

| Что проверить | Метод | Путь | Ожидание |
|---------------|--------|------|----------|
| Успешный обмен | POST | `/transfers/exchange` | 201, `description`: `fx_exchange:RUB->USD:...` (по факту валют). |
| Одинаковые валюты | POST | `/transfers/exchange` | 400, `detail`: `currency_mismatch`. |
| amount ≤ 0 | POST | `/transfers/exchange` | 400, `detail`: `transfer_amount_too_small`. |
| Недостаточно средств | POST | `/transfers/exchange` | 400, `detail`: `insufficient_funds`. |
| Источник — SAVINGS | POST | `/transfers/exchange` | 400, `detail`: `transfer_not_allowed_from_savings`. |

**Бэкенд:** исходный счёт уменьшился на `amount`, целевой увеличился на пересчитанную сумму по курсу; в истории одна запись с форматом `fx_exchange:FROM->TO:TARGET_AMOUNT`.

---

#### 3.4 API: Платежи поставщикам (один эндпоинт)

Подготовка: RUB-счёт с балансом, номера лицевых счетов нужной длины (см. 2.3). OTP: `0000` или preview. Все категории (интернет/ТВ, ЖКХ, образование, благотворительность) — один эндпоинт `POST /payments/vendor`.

| Категория | Провайдеры | Длина номера |
|-----------|-------------|--------------|
| Интернет/ТВ | RostelCom+, TV360, FiberNet | 15, 12, 14 |
| ЖКХ | ZhKH-Service, UO-Gorod, DomComfort, GasEnergy, CityWater | 20, 18, 22, 22, 18 |
| Образование | UniEdu, EduCenter+ | 16, 16 |
| Благотворительность | GoodHands, KindKids | 10, 12 |

| Что проверить | Ожидание (API) |
|---------------|----------------|
| Успешная оплата любому провайдеру из справочника | 201; в `GET /transactions` запись с префиксом `vendor:`. |
| Неверная длина номера счёта для выбранного провайдера | 400, `detail`: `payment_account_number_invalid_length`. |

**Бэкенд:** баланс списан, в истории одна запись PAYMENT с префиксом `vendor:` в `description`.

---

#### 3.5 API и бэкенд: Блокировка пользователя

Подготовка: клиент залогинен (токен есть); админ залогинен отдельно.

| Что проверить | Метод | Путь | Ожидание |
|---------------|--------|------|----------|
| Админ блокирует клиента | POST | `/admin/users/{user_id}/block` | 200, у пользователя `status`: BLOCKED. |
| Заблокированный клиент вызывает /profile, /accounts, /transfers | GET/POST | соответствующие | 403, `detail`: `user_blocked`. |
| Админ разблокирует | POST | `/admin/users/{user_id}/unblock` | 200, `status`: ACTIVE; счётчик неудачных входов сброшен. |
| После разблокировки клиент снова может вызывать защищённые ручки | GET | `/profile` | 200. |

**Бэкенд:** статус пользователя в ответах admin/users и profile соответствует block/unblock; после unblock логин с правильным паролем снова возможен.

---

#### 3.6 API и бэкенд: Админ

Подготовка: логин `admin` / `admin` (или из .env), OTP `0000` или из preview для credit.

| Что проверить | Метод | Путь | Ожидание (API) |
|---------------|--------|------|----------------|
| Список пользователей | GET | `/admin/users` | 200, список всех пользователей. |
| Пополнение любого счёта (credit) | POST | `/admin/accounts/{account_id}/credit` | 201, транзакция `TOPUP`, `description`: `admin_credit`. |
| Credit без OTP / с неверным OTP | POST | `/admin/accounts/{id}/credit` | 400, `detail`: `invalid_otp_code`. |
| Credit несуществующего счёта | POST | `/admin/accounts/{id}/credit` | 404, `detail`: `account_not_found`. |
| История всех транзакций | GET | `/admin/transactions` | 200, все транзакции системы. |
| Клиент вызывает /admin/users | GET | `/admin/users` | 403, `detail`: `forbidden`. |
| Заблокированный админ вызывает admin-ручки | GET/POST | `/admin/...` | 403, `detail`: `user_blocked`. |

**Бэкенд:** после credit баланс счёта вырос; в `GET /admin/transactions` и в `GET /transactions` у владельца счёта появляется запись `admin_credit`.

---

#### 3.7 Сложные цепочки (E2E)

Подготовка данных на каждом шаге — только через API (Helper, Admin, регистрация).

1. **Цепочка «новый пользователь → счета → пополнение → перевод»**  
   Регистрация → логин → открыть 2 RUB-счёта → Helper: increase на первый → OTP (preview или 0000) → topup или оставить баланс с Helper → перевод с первого на второй → проверка балансов и записи в `/transactions` с `p2p_transfer`.

2. **Цепочка «два пользователя, перевод по номеру счёта»**  
   Два пользователя, у каждого RUB-счёт; запомнить номер счёта второго → Helper пополнить счёт первого → перевод by-account на номер счёта второго → проверка балансов у обоих и записей `p2p_transfer_by_account` в истории у обоих.

3. **Цепочка «лимиты»**  
   Helper пополнить счета → серия переводов до суммы ≈ 1 000 000 ₽ за день → следующий перевод → 400 `transfer_amount_exceeds_daily_limit` → проверка `GET /transfers/daily-usage`.

4. **Цепочка «обмен + платежи»**  
   Счета RUB и USD → Helper пополнить RUB → обмен RUB → USD → проверка балансов и записи `fx_exchange` → мобильный платёж с RUB (если остался баланс) или пополнение через Helper → проверка записи `mobile:...` в истории.

5. **Цепочка «блокировка»**  
   Клиент логин → админ блокирует клиента → клиент: /profile → 403 → админ unblock → клиент снова /profile → 200.

---

## B.2 Сценарии UI

Что проверять в интерфейсе (те же сценарии, что и в API, но через браузер). Ожидаемые ошибки — как в соответствующих разделах API (B.1.1–B.1.3).

| Сценарий | Что сделать | Что проверить |
|----------|-------------|---------------|
| Вход и выход | Ввести логин/пароль на странице входа; затем выйти из аккаунта. | После входа — дашборд (счета, меню). После выхода — возврат на страницу входа. |
| Счета | Открыть раздел счетов; при необходимости открыть новый счёт (если есть кнопка/форма). | Отображаются свои счета; после открытия счёта он появляется в списке. |
| Пополнение / подготовка баланса | Использовать читерское окно (клик по шляпе) для увеличения баланса счёта или форму пополнения, если есть. | Баланс на дашборде обновился. |
| Перевод между счетами | Выбрать «Перевод», указать счёт-источник, счёт-получатель, сумму, ввести OTP (из читерского окна или 0000). | Успех: сообщение об успехе; балансы изменились; в истории операций появилась запись. Ошибки (недостаточно средств, неверный OTP и т.д.) — как в API (см. раздел 2.2). |
| Платёж (мобильный или поставщик) | Выбрать «Платежи», тип (мобильный/поставщик), заполнить форму (счёт, оператор/провайдер, номер/телефон, сумма), ввести OTP. | Успех: запись в истории с типом PAYMENT. Ошибки — как в разделах 2.3 и 3.4. |
| История операций | Открыть раздел истории/транзакций после выполнения перевода или платежа. | Отображаются последние операции с суммой, датой, типом (перевод, платёж и т.д.). |
| Читерское окно | Клик по логотипу-шляпе; увеличить или обнулить баланс счёта; при необходимости получить OTP. | Баланс меняется без создания транзакции; OTP отображается для подстановки в формы. |
| Профиль и настройки | При наличии в UI — открыть профиль, изменить имя/контакт; открыть настройки. | Изменения сохраняются или отображаются сообщения об ошибках (как в API, разделы 1.2 и 2.4). |

---

## Сводка кодов ошибок API (для сверки)

| Область | Код `detail` |
|---------|----------------|
| Auth | `invalid_credentials`, `user_blocked`, `validation_error: login_not_unique`, `validation_error: password_equals_login`, `validation_error: password_contains_space`, `validation_error: weak_password` |
| Profile | `validation_error: phone_not_unique`, `validation_error: email_not_unique`, `validation_error: password_change_requires_both_fields`, `invalid_current_password`, `validation_error: password_reuse_not_allowed` |
| Security | `invalid_token`, `user_blocked`, `forbidden` |
| Accounts | `account_limit_exceeded`, `not_found`, `account_already_closed`, `account_close_requires_zero_balance`, `account_closed`, `invalid_otp_code`, `amount_must_be_positive`, `account_not_found` |
| Transfers | `transfer_same_account`, `transfer_amount_too_small`, `transfer_amount_exceeds_single_limit`, `transfer_amount_exceeds_daily_limit`, `insufficient_funds`, `currency_mismatch`, `transfer_not_allowed_from_savings`, `account_inactive`, `forbidden_account_access`, `currency_not_supported_for_exchange` |
| Payments | `payment_operator_not_supported`, `payment_amount_out_of_range`, `payment_requires_rub_account`, `payment_provider_not_supported`, `payment_account_number_invalid_length` |
| Helper | `account_not_found`, `account_inactive`, `insufficient_funds` |
| Admin | `not_found`, `account_not_found`, `invalid_otp_code`, `amount_must_be_positive` |

Используйте этот файл для написания и отработки smoke- и сценарийных API- и UI-тестов; все тестовые данные подготавливайте через API (Helper и Admin). Описание проекта и запуск — см. README.md.
