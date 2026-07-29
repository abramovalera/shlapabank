import { Transaction } from "@/shared/api/types";
import { formatMoney } from "@/shared/lib/format";

export type TxCategoryKey =
  | "utilities"
  | "internet_tv"
  | "education"
  | "charity"
  | "mobile"
  | "transfer_phone"
  | "transfer_card"
  | "transfer_account"
  | "transfer_own"
  | "external_transfer"
  | "topup"
  | "other";

export interface TxPresentation {
  title: string;              // «ЖКХ · CityWater»
  subtitle: string;           // «Лицевой •• 9012 · 09:15»
  icon: string;               // tabler icon name
  color: string;              // hex цвет иконки/фона
  bgColor: string;            // rgba фон иконки
  category: TxCategoryKey;
  categoryLabel: string;
  isIncoming: boolean;
  amountLabel: string;        // «−₽ 10 200,00» / «+₽ 2 000,00»
  fee?: string;               // «₽ 200,00» если есть
  fromAccountHint?: string;   // «с карты •• 4021»
  comment?: string;
}

const CATEGORY_META: Record<TxCategoryKey, { label: string; icon: string; color: string; bg: string }> = {
  utilities:         { label: "ЖКХ",              icon: "bolt",           color: "#F7DE6E", bg: "rgba(247,222,110,0.15)" },
  internet_tv:       { label: "Интернет и ТВ",    icon: "wifi",           color: "#4DE89F", bg: "rgba(43,224,140,0.15)" },
  education:         { label: "Образование",      icon: "school",         color: "#7F8AFF", bg: "rgba(91,107,255,0.15)" },
  charity:           { label: "Благотворительность", icon: "heart",       color: "#FF5A75", bg: "rgba(255,90,117,0.15)" },
  mobile:            { label: "Мобильная связь",  icon: "device-mobile",  color: "#3DD7E5", bg: "rgba(61,215,229,0.15)" },
  transfer_phone:    { label: "Перевод по телефону", icon: "phone-outgoing", color: "#FFA347", bg: "rgba(255,163,71,0.15)" },
  transfer_card:     { label: "Перевод на карту", icon: "credit-card",    color: "#FFA347", bg: "rgba(255,163,71,0.15)" },
  transfer_account:  { label: "Перевод на счёт",  icon: "arrow-up-right", color: "#FFA347", bg: "rgba(255,163,71,0.15)" },
  transfer_own:      { label: "Между своими",     icon: "arrows-exchange", color: "#7F8AFF", bg: "rgba(91,107,255,0.15)" },
  external_transfer: { label: "Внешний перевод",  icon: "arrow-up-right", color: "#FFA347", bg: "rgba(255,163,71,0.15)" },
  topup:             { label: "Пополнение",       icon: "arrow-down",     color: "#4DE89F", bg: "rgba(43,224,140,0.15)" },
  other:             { label: "Операция",         icon: "circle",         color: "#F5F7FF", bg: "rgba(245,247,255,0.06)" },
};

const OPERATOR_LABELS: Record<string, string> = {
  MTSha: "МТС",
  MegaFun: "МегаФон",
  Babline: "Билайн",
  TelePanda: "Теле2",
  YotaLike: "Yota",
};

const CATEGORY_BY_VENDOR: Record<string, TxCategoryKey> = {
  CityWater: "utilities",
  GasEnergy: "utilities",
  "ZhKH-Service": "utilities",
  "UO-Gorod": "utilities",
  DomComfort: "utilities",
  "RostelCom+": "internet_tv",
  TV360: "internet_tv",
  FiberNet: "internet_tv",
  UniEdu: "education",
  "EduCenter+": "education",
  GoodHands: "charity",
  KindKids: "charity",
};

function parseParts(desc: string): { head: string; rest: string[]; comment?: string } {
  // Отделяем :comment_... в конце, если есть
  let comment: string | undefined;
  let clean = desc;
  const cIdx = desc.indexOf(":comment_");
  if (cIdx >= 0) {
    comment = desc.slice(cIdx + ":comment_".length);
    clean = desc.slice(0, cIdx);
  }
  const parts = clean.split(":");
  return { head: parts[0], rest: parts.slice(1), comment };
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11) return raw;
  return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}

function extractFee(rest: string[]): string | undefined {
  const feePart = rest.find((p) => p.startsWith("fee_"));
  if (!feePart) return undefined;
  return feePart.replace("fee_", "");
}

/**
 * Превращает техническую строку description в человекочитаемое представление.
 * Возвращает title/subtitle/иконку/категорию/цвет.
 */
export function presentTransaction(tx: Transaction): TxPresentation {
  const { head, rest, comment } = parseParts(tx.description ?? "");
  const time = new Date(tx.created_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const isIncoming = tx.type === "TOPUP";
  const currency = tx.money.currency;
  const total = parseFloat(tx.money.total);
  const amountLabel = `${isIncoming ? "+" : "−"}${formatMoney(total, currency)}`;
  const fee = tx.money.fee !== "0.00" && tx.money.fee !== "0" ? formatMoney(parseFloat(tx.money.fee), currency) : undefined;

  // ---- Классификация ----
  let cat: TxCategoryKey = "other";
  let title = "Операция";
  let subtitle = time;

  if (head === "mobile") {
    cat = "mobile";
    const op = rest[0] ?? "";
    const phone = rest[1] ?? "";
    title = `Мобильная связь · ${OPERATOR_LABELS[op] ?? op}`;
    subtitle = `${formatPhone(phone)} · ${time}`;
  } else if (head === "vendor") {
    const vendor = rest[0] ?? "";
    const acc = rest[1] ?? "";
    cat = CATEGORY_BY_VENDOR[vendor] ?? "other";
    const catLabel = CATEGORY_META[cat].label;
    title = `${catLabel} · ${vendor}`;
    subtitle = acc ? `Счёт •• ${acc.slice(-4)} · ${time}` : time;
  } else if (head === "external_transfer") {
    cat = "external_transfer";
    const curr = rest[0] ?? "";
    const acc = rest[1] ?? "";
    title = "Перевод в другой банк";
    const feeStr = extractFee(rest);
    subtitle = `${acc || "счёт"} · ${curr}${feeStr ? ` · комиссия ${feeStr}` : ""} · ${time}`;
  } else if (head === "external_card") {
    cat = "transfer_card";
    const acc = rest[1] ?? "";
    title = "Перевод на карту (внешний)";
    const feeStr = extractFee(rest);
    subtitle = `${acc}${feeStr ? ` · комиссия ${feeStr}` : ""} · ${time}`;
  } else if (head === "card_to_card") {
    cat = "transfer_card";
    const acc = rest[1] ?? "";
    title = "Перевод на карту";
    subtitle = `${acc} · ${time}`;
  } else if (head === "p2p_by_phone_external") {
    cat = "transfer_phone";
    const bank = rest[0] ?? "";
    const phone = rest[1] ?? "";
    title = "Перевод по телефону";
    const feeStr = extractFee(rest);
    subtitle = `${formatPhone(phone)}${bank ? ` · ${bank}` : ""}${feeStr ? ` · комиссия ${feeStr}` : ""} · ${time}`;
  } else if (head === "p2p_transfer_by_phone") {
    cat = "transfer_phone";
    const acc = rest[1] ?? "";
    title = "Перевод по телефону";
    subtitle = `${acc || "получателю в ShlapaBank"} · ${time}`;
  } else if (head === "p2p_transfer") {
    cat = "transfer_own";
    title = "Между своими счетами";
    subtitle = time;
  } else if (head === "self_topup") {
    cat = "topup";
    const purpose = rest[0] ?? "";
    if (purpose === "gift") title = "Пополнение (подарок)";
    else if (purpose === "salary") title = "Зарплата";
    else title = "Пополнение";
    subtitle = time;
  } else if (head === "admin_credit") {
    cat = "topup";
    title = "Зачисление от банка";
    subtitle = time;
  } else if (head === "helper_topup") {
    cat = "topup";
    title = "Пополнение (тест)";
    subtitle = time;
  } else if (tx.type === "TRANSFER") {
    cat = "transfer_account";
    title = "Перевод";
    subtitle = time;
  } else if (tx.type === "PAYMENT") {
    cat = "other";
    title = "Платёж";
    subtitle = time;
  }

  const meta = CATEGORY_META[cat];

  return {
    title,
    subtitle,
    icon: meta.icon,
    color: meta.color,
    bgColor: meta.bg,
    category: cat,
    categoryLabel: meta.label,
    isIncoming,
    amountLabel,
    fee,
    comment,
  };
}

/** Экспорт списка транзакций в CSV-строку. */
export function transactionsToCsv(txs: Transaction[]): string {
  const header = ["Дата", "Время", "Тип", "Категория", "Название", "Сумма", "Комиссия", "Валюта"];
  const rows = txs.map((tx) => {
    const p = presentTransaction(tx);
    const d = new Date(tx.created_at);
    return [
      d.toLocaleDateString("ru-RU"),
      d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      tx.type,
      p.categoryLabel,
      p.title.replace(/,/g, ";"),
      (p.isIncoming ? "+" : "-") + tx.money.total,
      tx.money.fee,
      tx.money.currency,
    ].join(",");
  });
  return [header.join(","), ...rows].join("\n");
}
