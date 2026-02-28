# Аудит API: дублирование и назначение эндпоинтов

**Дата:** 28 февраля 2025

---

## 1. Полный список эндпоинтов

| Метод | Путь | Роутер | Назначение |
|-------|------|--------|------------|
| GET | `/api/v1/health` | health | Проверка доступности сервиса |
| GET | `/api/v1/helper/accounts` | helper | Список счетов для шляпы (админ — все, клиент — свои) |
| GET | `/api/v1/helper/otp/preview` | helper | OTP-код для тестов |
| POST | `/api/v1/helper/accounts/{id}/increase` | helper | Пополнение без OTP (тестовая шляпа) |
| POST | `/api/v1/helper/accounts/{id}/decrease` | helper | Списание баланса (шляпа) |
| POST | `/api/v1/helper/accounts/{id}/zero` | helper | Обнуление счёта (шляпа) |
| POST | `/api/v1/helper/clear-browser` | helper | Инструкция очистки кеша |
| GET | `/api/v1/admin/users` | admin | Список пользователей |
| POST | `/api/v1/admin/users/{id}/block` | admin | Блокировка пользователя |
| POST | `/api/v1/admin/users/{id}/unblock` | admin | Разблокировка пользователя |
| DELETE | `/api/v1/admin/users/{id}` | admin | Удаление пользователя |
| GET | `/api/v1/admin/users/{id}/banks` | admin | Банки пользователя |
| PUT | `/api/v1/admin/users/{id}/banks` | admin | Настройка банков (0–5) |
| GET | `/api/v1/admin/users/{id}/transactions` | admin | Транзакции пользователя |
| POST | `/api/v1/auth/register` | auth | Регистрация |
| POST | `/api/v1/auth/login` | auth | Вход |
| GET | `/api/v1/profile` | profile | Профиль текущего пользователя |
| PUT | `/api/v1/profile` | profile | Обновление профиля |
| GET | `/api/v1/accounts` | accounts | Список своих счетов |
| POST | `/api/v1/accounts` | accounts | Создание счёта |
| DELETE | `/api/v1/accounts/{id}` | accounts | Закрытие счёта |
| POST | `/api/v1/accounts/{id}/topup` | accounts | Пополнение с OTP |
| PUT | `/api/v1/accounts/primary` | accounts | Установить приоритетные счета |
| POST | `/api/v1/transfers` | transfers | Перевод между своими счетами |
| POST | `/api/v1/transfers/by-account` | transfers | Перевод по номеру счёта |
| GET | `/api/v1/transfers/by-phone/check` | transfers | Проверка получателя по телефону |
| POST | `/api/v1/transfers/by-phone` | transfers | Перевод по телефону |
| POST | `/api/v1/transfers/exchange` | transfers | Обмен валют |
| GET | `/api/v1/transfers/daily-usage` | transfers | Остаток суточного лимита |
| GET | `/api/v1/transfers/rates` | transfers | Курсы валют |
| GET | `/api/v1/transactions` | transactions | История своих операций |
| GET | `/api/v1/payments/mobile/operators` | payments | Справочник операторов |
| POST | `/api/v1/payments/mobile` | payments | Оплата мобильной связи |
| GET | `/api/v1/payments/vendor/providers` | payments | Справочник поставщиков |
| POST | `/api/v1/payments/vendor` | payments | Оплата поставщику |
| GET | `/api/v1/settings` | settings | Настройки (тема, язык) |

---

## 2. Анализ на дублирование

### 2.1 Потенциальное перекрытие: счета

| Эндпоинт | Контекст | Результат |
|----------|----------|-----------|
| `GET /accounts` | Клиент | Свои активные счета |
| `GET /helper/accounts` | Клиент | Те же счета (без owner_login) |
| `GET /helper/accounts` | Админ | Все счета + owner_login |

**Вывод:** Для клиента оба возвращают одни и те же счета. Разделение оправдано:
- `/accounts` — основной API для дашборда
- `/helper/accounts` — для шляпы: админ видит все счета с владельцем, клиент — свои

**Рекомендация:** Оставить как есть. Объединение усложнит логику и смешает production- и тестовый функционал.

---

### 2.2 Потенциальное перекрытие: пополнение счёта

| Эндпоинт | OTP | Описание транзакции | Назначение |
|----------|-----|---------------------|------------|
| `POST /accounts/{id}/topup` | Да | self_topup, self_topup:salary/gift | Реальное пополнение |
| `POST /helper/accounts/{id}/increase` | Нет | helper_topup, admin_credit, helper_topup:gift | Тестовая подготовка |

**Вывод:** Дублирования нет. Разные сценарии: production (с OTP) и тестовый (без OTP).

---

### 2.3 Транзакции

| Эндпоинт | Контекст |
|----------|----------|
| `GET /transactions` | Свои транзакции |
| `GET /admin/users/{id}/transactions` | Транзакции любого пользователя (только админ) |

**Вывод:** Дублирования нет. Разные права доступа и целевые пользователи.

---

### 2.4 Профиль и пользователи

| Эндпоинт | Данные |
|----------|--------|
| `GET /profile` | Текущий пользователь |
| `GET /admin/users` | Все пользователи (админ) |

**Вывод:** Дублирования нет.

---

## 3. Эндпоинты с чётким назначением

Все остальные эндпоинты имеют однозначное назначение, дублирования не обнаружено.

---

## 4. Реализовано: приоритетные счета

**Эндпоинт:** `PUT /api/v1/accounts/primary` с телом `{"account_ids": [1, 2, 3]}`

**Назначение:** Установка приоритетных счетов (по одному на валюту) для зачисления переводов.

**Реализация:** Поле `is_primary` в модели `Account`, эндпоинт обновляет флаги атомарно.

---

## 5. Итоговая сводка

| Категория | Количество | Статус |
|-----------|------------|--------|
| Дублирование эндпоинтов | 0 | ✅ Нет дублирования |
| Потенциальное перекрытие (счета) | 1 | ⚠️ Допустимо, разное назначение |
| Эндпоинты без чёткого назначения | 0 | ✅ Все имеют назначение |
| Вызовы несуществующих эндпоинтов из UI | 0 | ✅ Все реализованы |
