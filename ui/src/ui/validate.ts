// Правила ввода по контракту и разбор сумм.
import type { Recipient, Tariff, TariffType } from "../api/types";
import { NBSP, formatMoney, toCents } from "./format";

export const NAME_MAX = 30;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 30;
export const ACCOUNT_NAME_MAX = 30;
export const MESSAGE_MAX = 70;
export const AMOUNT_INT_DIGITS = 9;

// ---------- Сумма ----------

/**
 * Нормализует ввод суммы: только цифры и одна запятая (точка → запятая),
 * не больше 2 знаков после запятой, без минуса, разряды через неразрывный пробел.
 */
export function formatAmountInput(input: string): string {
  const cleaned = input.replace(/\./g, ",").replace(/[^\d,]/g, "");
  const sep = cleaned.indexOf(",");
  let int = sep === -1 ? cleaned : cleaned.slice(0, sep);
  let frac = sep === -1 ? null : cleaned.slice(sep + 1).replace(/,/g, "").slice(0, 2);
  int = int.replace(/^0+(?=\d)/, "").slice(0, AMOUNT_INT_DIGITS);
  if (frac !== null && int === "") int = "0";
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return frac === null ? grouped : `${grouped},${frac}`;
}

/** Сумма из поля в копейках; null — если пусто или не число. */
export function parseAmount(display: string): number | null {
  const raw = display.replace(/\s/g, "").replace(NBSP, "");
  if (!raw || !/^\d+(,\d{0,2})?$/.test(raw)) return null;
  return toCents(raw.replace(",", "."));
}

export interface AmountRange {
  min: number; // копейки
  max: number;
}

export function rangeOf(t: Tariff | undefined | null): AmountRange | null {
  if (!t) return null;
  return { min: toCents(t.amount_min), max: toCents(t.amount_max) };
}

export function rangeText(r: AmountRange): string {
  return `от ${formatMoney(r.min / 100, { compact: true })} до ${formatMoney(r.max / 100, { compact: true })}`;
}

/** Проблема с суммой (текст подсказки) или null. */
export function amountProblem(cents: number | null, range: AmountRange | null): string | null {
  if (cents === null) return "Введите сумму";
  if (cents <= 0) return "Сумма должна быть больше нуля";
  if (range && cents < range.min) return `Минимальная сумма — ${formatMoney(range.min / 100, { compact: true })}`;
  if (range && cents > range.max) return `Максимальная сумма — ${formatMoney(range.max / 100, { compact: true })}`;
  return null;
}

// ---------- Комиссия и тарифы ----------

/** fee = max(сумма × процент / 100, минимум), если процент > 0. В копейках. */
export function calcFee(amountCents: number, percent: string | number, min: string | number): number {
  const p = Number(percent);
  if (!(p > 0) || amountCents <= 0) return 0;
  const byPercent = Math.round((amountCents * p) / 100 + 1e-9);
  return Math.max(byPercent, toCents(min));
}

/** Сработала минимальная комиссия: процент от суммы меньше минимума. */
export function feeIsMinimum(amountCents: number, percent: string | number, min: string | number): boolean {
  const p = Number(percent);
  if (!(p > 0) || amountCents <= 0) return false;
  return Math.round((amountCents * p) / 100 + 1e-9) < toCents(min);
}

export function findTariff(tariffs: Tariff[] | undefined, type: TariffType): Tariff | undefined {
  return tariffs?.find((t) => t.operation_type === type);
}

/** Тариф перевода по телефону/на карту в зависимости от банка получателя. */
export function transferTariff(
  tariffs: Tariff[] | undefined,
  kind: "PHONE" | "CARD",
  recipient: Recipient | undefined,
): Tariff | undefined {
  if (!recipient) return undefined;
  return findTariff(tariffs, `${kind}_${recipient.own_bank ? "OWN" : "OTHER"}_BANK` as TariffType);
}

// ---------- Телефон, имя, пароль ----------

export function phoneToApi(digits10: string): string {
  return `+7${digits10}`;
}

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

const NAME_RE = /^[A-Za-zА-Яа-яЁё]+(?:[ -][A-Za-zА-Яа-яЁё]+)*$/;

export function nameProblem(value: string, what: "имя" | "фамилию"): string | null {
  const v = value.trim();
  if (!v) return `Введите ${what}`;
  if (v.length > NAME_MAX) return `Не длиннее ${NAME_MAX} символов`;
  if (!NAME_RE.test(v)) return "Только буквы, пробел и дефис";
  return null;
}

export interface PasswordRule {
  id: string;
  text: string;
  ok: boolean;
}

export function passwordRules(p: string): PasswordRule[] {
  return [
    { id: "length", text: `От ${PASSWORD_MIN} до ${PASSWORD_MAX} символов`, ok: p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX },
    { id: "lower", text: "Строчная латинская буква", ok: /[a-z]/.test(p) },
    { id: "upper", text: "Заглавная латинская буква", ok: /[A-Z]/.test(p) },
    { id: "digit", text: "Цифра", ok: /\d/.test(p) },
    // Любой символ, кроме букв, цифр и пробелов: !@#$%^&* и т. п.
    { id: "special", text: "Спецсимвол (!@#$%^&*)", ok: /[^\p{L}\p{N}\s]/u.test(p) },
    { id: "spaces", text: "Без пробелов", ok: p.length > 0 && !/\s/.test(p) },
  ];
}

// ---------- Карта ----------

export function luhnOk(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export const CARD_LENGTH = 16;

export function cardProblem(digits: string): string | null {
  if (!digits) return "Введите номер карты";
  if (digits.length < CARD_LENGTH) return "Номер карты — 16 цифр";
  // Тот же текст, что у API (invalid_card_number)
  if (!luhnOk(digits)) return "Неверный номер карты";
  return null;
}

/** «MM/YY»: месяц 01–12 и срок не истёк. */
export function expiryProblem(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!value) return "Введите срок действия карты";
  if (!m) return "Срок — в формате ММ/ГГ";
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return "Проверьте месяц в сроке действия";
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    return "Срок действия карты истёк";
  }
  return null;
}

export function paymentSystem(digits: string): string | null {
  if (digits.startsWith("2")) return "МИР";
  if (digits.startsWith("4")) return "VISA";
  if (/^5[1-5]/.test(digits)) return "Mastercard";
  return null;
}
