/** Разбивка PAN на группы по 4: 2200401234564021 → 2200 4012 3456 4021. Макс 16 цифр. */
export function formatCardInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  return digits.match(/.{1,4}/g)?.join(" ") ?? "";
}

/** Быстрая Luhn-валидация. */
export function luhnValid(number: string): boolean {
  const digits = number.replace(/\D/g, "").split("").map(Number);
  if (digits.length < 12) return false;
  let sum = 0;
  for (let i = digits.length - 1, r = 0; i >= 0; i--, r++) {
    let d = digits[i];
    if (r % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Определяет платёжную систему по BIN (учебные префиксы, см. backend/routes/cards.py). */
export function detectPaymentSystem(raw: string): "VISA" | "MIR" | "MASTERCARD" | null {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("4")) return "VISA";
  if (d.startsWith("2200") || d.startsWith("22")) return "MIR";
  if (d.startsWith("51") || d.startsWith("52") || d.startsWith("53") || d.startsWith("54") || d.startsWith("55"))
    return "MASTERCARD";
  return null;
}
