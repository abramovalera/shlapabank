/** Форматирование денег: 182400.00 RUB -> "₽ 182 400,00". */
export function formatMoney(amount: string | number, currency: string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const symbol = currencySymbol(currency);
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  return `${symbol} ${formatted}`;
}

export function currencySymbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case "RUB":
      return "₽";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "CNY":
      return "¥";
    default:
      return currency;
  }
}

/** Форматирование даты: "26 июля" / "Сегодня" / "Вчера" */
export function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (sameDay(d, today)) return "Сегодня";
  if (sameDay(d, yesterday)) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
