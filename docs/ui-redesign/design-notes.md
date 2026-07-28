# UI Redesign — Dashboard v1 (approved)

Референс: `dashboard-v1.html` (открыть в браузере)

## Стек
- Vite + React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query (API), Zustand (auth/user state)
- React Router
- Lucide / Tabler icons

## Утверждённая структура дашборда

**Header:** лого + горизонтальное меню (Главная / Платежи / Карты / История) + иконка уведомлений + аватар.

**Верхний ряд (2 колонки):**
- Общий баланс + дельта за месяц.
- Курсы валют USD / EUR + время обновления.

**Основная сетка (1.4fr / 1fr):**

Левая колонка:
- Блок «Мои карты» — компактная карусель:
  - Одна активная карта (200×126 px, реальные пропорции), тёмный градиент, золотой чип, логотип платёжной системы.
  - Peek следующей карты сзади.
  - Справа: счёт-владелец, баланс, статус-пилюли, кнопки «Блок» / «Ещё».
  - Снизу: ← точки-индикатор → (первая точка вытянута в pill для активной).
- Блок «Счета» — список с иконкой типа, названием, маскированным номером, пилюлей «N карт», балансом справа.

Правая колонка:
- Быстрые действия (2×2 сетка иконок: Перевод / Выпустить / Обмен / Оплатить).
- Лимит на месяц (progress bar + сумма).
- Поддержка (описание + кнопка «Открыть чат»).

## Что нужно добавить в бэкенд

Модель `Card`:
- `id`, `account_id` (FK), `last4`, `type` (DEBIT/VIRTUAL/CREDIT), `payment_system` (VISA/MIR/MC), `status` (ACTIVE/BLOCKED/EXPIRED), `holder_name`, `expiry_month`, `expiry_year`.

Эндпоинты:
- `GET /api/v1/cards`
- `GET /api/v1/accounts/{id}/cards`
- `POST /api/v1/accounts/{id}/cards`
- `PATCH /api/v1/cards/{id}` (блок/разблок)
- `DELETE /api/v1/cards/{id}`

В существующие ответы:
- `Account.cards_count: int`
- `Transaction.card_id: Optional[UUID]`

## Тестируемость

На каждый интерактивный элемент — `data-testid`:
- `card-carousel-next`, `card-carousel-prev`, `card-carousel-dot-{n}`
- `card-block-btn`, `card-more-btn`
- `account-row-{id}`, `account-balance-{id}`
- `quick-action-{transfer|issue|exchange|pay}`
- `header-nav-{main|payments|cards|history}`
