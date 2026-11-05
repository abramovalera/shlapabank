// Форматтеры денег, дат, телефонов и карт.

export const NBSP = " ";
export const MINUS = "−";

/** Строку/число денег в копейки (без плавающей ошибки для строк вида "1500.50"). */
export function toCents(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Math.round(value * 100);
  const s = value.trim().replace(",", ".");
  const neg = s.startsWith("-");
  const [int, frac = ""] = s.replace(/^[-+]/, "").split(".");
  const cents = parseInt(int || "0", 10) * 100 + parseInt((frac + "00").slice(0, 2), 10);
  return Number.isFinite(cents) ? (neg ? -cents : cents) : 0;
}

export function centsToApi(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function groupDigits(int: string, sep = NBSP): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

interface MoneyOptions {
  /** "+" — показать плюс, "-" — показать минус (U+2212), по умолчанию знак только у отрицательных */
  sign?: "+" | "-";
  /** Не показывать ",00" у целых сумм */
  compact?: boolean;
  /** Без знака рубля */
  noCurrency?: boolean;
}

/** 123456.5 → «123 456,50 ₽» с неразрывными пробелами. */
export function formatMoney(value: string | number | null | undefined, opts: MoneyOptions = {}): string {
  const cents = toCents(value);
  const abs = Math.abs(cents);
  const int = groupDigits(String(Math.floor(abs / 100)));
  const frac = abs % 100;
  const body = opts.compact && frac === 0 ? int : `${int},${String(frac).padStart(2, "0")}`;
  let sign = "";
  if (opts.sign === "+") sign = "+";
  else if (opts.sign === "-" || cents < 0) sign = MINUS;
  return `${sign}${body}${opts.noCurrency ? "" : `${NBSP}₽`}`;
}

/** Части суммы для крупного вывода: целая часть и «,48 ₽». */
export function moneyParts(value: string | number): { int: string; rest: string } {
  const cents = toCents(value);
  const abs = Math.abs(cents);
  return {
    int: `${cents < 0 ? MINUS : ""}${groupDigits(String(Math.floor(abs / 100)))}`,
    rest: `,${String(abs % 100).padStart(2, "0")}${NBSP}₽`,
  };
}

/** Процент: 1.5 → «1,5%». */
export function formatPercent(value: string | number): string {
  const n = Number(value);
  return `${String(Math.round(n * 100) / 100).replace(".", ",")}%`;
}

/** Описание комиссии: «1%, минимум 10 ₽» / «1%»; null — бесплатно. */
export function feeText(percent: string | number, min: string | number, minWord = "минимум"): string | null {
  const p = Number(percent);
  const m = toCents(min);
  if (p > 0 && m > 0) return `${formatPercent(p)}, ${minWord} ${formatMoney(min, { compact: true })}`;
  if (p > 0) return formatPercent(p);
  return null;
}

// ---------- Даты ----------

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Ключ локального дня «2026-11-03» — для группировки. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return toIsoDate(d);
}

/** Локальная дата в формате YYYY-MM-DD. */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** Сегодняшняя дата по Москве «2026-11-03» — как считает банк (date_from/date_to — по МСК). */
export function mskToday(): string {
  // en-CA даёт формат ГГГГ-ММ-ДД
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Начало периода «последние N дней» по Москве: сегодня и N−1 предыдущих дней.
 * 7 → сегодня − 6, 30 → сегодня − 29.
 */
export function mskPeriodStart(days: number): string {
  const [y, m, d] = mskToday().split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d - (Math.max(1, days) - 1)));
  return start.toISOString().slice(0, 10);
}

/** «3 ноября» (+ год, если не текущий). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : "";
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${year}`;
}

/** «Сегодня» / «Вчера» / «3 ноября». */
export function formatDay(iso: string): string {
  const diff = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  return formatDate(iso);
}

/** «Сегодня, 3 ноября» / «Вчера, 2 ноября» / «1 ноября». */
export function formatDayLong(iso: string): string {
  const short = formatDay(iso);
  return short === "Сегодня" || short === "Вчера" ? `${short}, ${formatDate(iso)}` : short;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)}, ${formatTime(iso)}`;
}

/** Секунды в «0:45». */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------- Телефоны, карты, счета ----------

/** 10 цифр → «916 000-00-21» (частичный ввод тоже форматируется). */
export function maskPhone10(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  let out = d.slice(0, 3);
  if (d.length > 3) out += " " + d.slice(3, 6);
  if (d.length > 6) out += "-" + d.slice(6, 8);
  if (d.length > 8) out += "-" + d.slice(8, 10);
  return out;
}

/** «+79160000021» → «+7 916 000-00-21». */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && (d[0] === "7" || d[0] === "8")) return `+7 ${maskPhone10(d.slice(1))}`;
  return phone;
}

/** Номер карты группами по 4. */
export function maskCard(digits: string): string {
  return digits.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** «MMYY» → «MM/YY». */
export function maskExpiry(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** 20-значный номер счёта: «40817 810 0 0000 0002167». */
export function formatAccountNumber(n: string): string {
  const d = n.replace(/\D/g, "");
  if (d.length !== 20) return n;
  return `${d.slice(0, 5)} ${d.slice(5, 8)} ${d.slice(8, 9)} ${d.slice(9, 13)} ${d.slice(13)}`;
}

export function last4(n: string): string {
  return n.replace(/\D/g, "").slice(-4);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.replace(/[^A-Za-zА-Яа-яЁё\s-]/g, "").trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

/** Склонение: plural(3, "счёт", "счёта", "счетов"). */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}
