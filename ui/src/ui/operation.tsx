// Отображение операций: иконка, строка списка, подписи статусов.
import { Link } from "react-router-dom";
import type { Operation, OperationType } from "../api/types";
import { NBSP, formatMoney, formatTime, initials, lowerFirst, dayKey, toCents } from "./format";
import { IconArrows, IconCard, IconCross, IconHouse, IconPlus, IconSignal } from "./icons";

const AVATAR_TONES = [
  "bg-tone-blue-bg text-tone-blue",
  "bg-tone-teal-bg text-tone-teal",
  "bg-tone-violet-bg text-tone-violet",
  "bg-tone-orange-bg text-tone-orange",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`grid flex-none place-items-center rounded-full text-[13px] font-semibold ${AVATAR_TONES[hash(name) % AVATAR_TONES.length]}`}
    >
      {initials(name) || "?"}
    </span>
  );
}

const TYPE_ICON: Partial<Record<OperationType, { bg: string; color: string; icon: typeof IconPlus }>> = {
  OWN_TRANSFER: { bg: "bg-tone-violet-bg", color: "#6941c6", icon: IconArrows },
  CARD_TRANSFER: { bg: "bg-tone-teal-bg", color: "#0e7c78", icon: IconCard },
  MOBILE: { bg: "bg-tone-orange-bg", color: "#c4560c", icon: IconSignal },
  UTILITY: { bg: "bg-tone-green-bg", color: "#1a7f4b", icon: IconHouse },
  TOPUP: { bg: "bg-tone-amber-bg", color: "#a15c00", icon: IconPlus },
  BANK_DEPOSIT: { bg: "bg-tone-amber-bg", color: "#a15c00", icon: IconPlus },
};

export function OperationIcon({ op, size = 40 }: { op: Operation; size?: number }) {
  if (op.status === "DECLINED" || op.status === "CANCELLED") {
    const red = op.status === "DECLINED";
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className={`grid flex-none place-items-center rounded-full ${red ? "bg-tone-red-bg" : "bg-tone-grey-bg"}`}
      >
        <IconCross color={red ? "#d92d20" : "#6b7a8c"} />
      </span>
    );
  }
  const t = TYPE_ICON[op.type];
  if (!t) return <Avatar name={op.title} size={size} />;
  const Icon = t.icon;
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`grid flex-none place-items-center rounded-full ${t.bg}`}
    >
      <Icon color={t.color} />
    </span>
  );
}

/** Сумма операции со знаком и цветом. */
export function operationAmount(op: Operation): { text: string; className: string } {
  // Зачёркиваем только отклонённые, отменённые — просто серым
  if (op.status === "DECLINED") return { text: formatMoney(op.amount), className: "text-ink-faint line-through" };
  if (op.status === "CANCELLED") return { text: formatMoney(op.amount), className: "text-ink-faint" };
  if (op.direction === "in") return { text: formatMoney(op.amount, { sign: "+" }), className: "text-success" };
  if (op.direction === "internal") return { text: formatMoney(op.amount), className: "" };
  return { text: formatMoney(op.total, { sign: "-" }), className: "" };
}

export function statusLabel(op: Operation): string {
  switch (op.status) {
    case "DONE":
      return "Выполнено";
    case "DECLINED":
      return "Отклонено";
    case "CANCELLED":
      return "Отменено";
    case "WAITING_CODE":
      return "Ожидает подтверждения";
  }
}

export function OperationRow({ op, last }: { op: Operation; last?: boolean }) {
  const amount = operationAmount(op);
  const hasFee = toCents(op.fee) > 0 && (op.status === "DONE" || op.status === "WAITING_CODE");

  let subtitle = <span className="text-ink-muted">{op.subtitle}</span>;
  // У отклонённой — и подзаголовок (получатель/карта/банк), и причина отказа строкой ниже
  const declined =
    op.status === "DECLINED" ? (
      <span className="block line-clamp-2 break-words text-[13px] text-danger" data-testid={`operation-status-${op.id}`}>
        Отклонено{op.decline_reason ? `: ${lowerFirst(op.decline_reason.message)}` : ""}
      </span>
    ) : null;
  if (op.status === "CANCELLED") {
    subtitle = (
      <span className="text-ink-faint" data-testid={`operation-status-${op.id}`}>
        Отменено
      </span>
    );
  } else if (op.status === "WAITING_CODE") {
    subtitle = (
      <span className="text-fee" data-testid={`operation-status-${op.id}`}>
        Ожидает подтверждения
      </span>
    );
  }

  return (
    <Link
      to={`/operations/${op.id}`}
      data-testid={`operation-row-${op.id}`}
      className={`flex items-center gap-3 px-4 py-2.5 text-ink hover:bg-[#f8f9fb] hover:text-ink hover:no-underline sm:px-6 ${last ? "pb-3.5" : ""}`}
    >
      <OperationIcon op={op} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold" data-testid={`operation-title-${op.id}`}>
          {op.title}
        </span>
        {(op.subtitle || !declined) && <span className="block truncate text-[13px]">{subtitle}</span>}
        {/* Причину отказа не обрезаем — до двух строк */}
        {declined}
      </span>
      <span className="flex-none text-right">
        <span className={`block whitespace-nowrap font-semibold ${amount.className}`} data-testid={`operation-amount-${op.id}`}>
          {amount.text}
        </span>
        <span className="block whitespace-nowrap text-[13px] text-ink-faint">
          <span data-testid={`operation-time-${op.id}`}>{formatTime(op.created_at)}</span>
          {hasFee && (
            <>
              {" · "}
              <span className="text-fee" data-testid={`operation-fee-${op.id}`}>
                в т.{NBSP}ч. комиссия {formatMoney(op.fee, { compact: true })}
              </span>
            </>
          )}
        </span>
      </span>
    </Link>
  );
}

export interface DayGroup {
  key: string;
  iso: string;
  items: Operation[];
}

/** Группировка по локальным дням (список уже отсортирован: новые сверху). */
export function groupByDay(ops: Operation[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const op of ops) {
    const key = dayKey(op.created_at);
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.items.push(op);
    else groups.push({ key, iso: op.created_at, items: [op] });
  }
  return groups;
}

/** Итоги за день/период по выполненным операциям: списано (с комиссией), поступило, комиссии. */
export function totals(ops: Operation[]) {
  let out = 0;
  let inc = 0;
  let fee = 0;
  for (const op of ops) {
    if (op.status !== "DONE") continue;
    if (op.direction === "out") {
      out += toCents(op.total);
      fee += toCents(op.fee);
    } else if (op.direction === "in") {
      inc += toCents(op.amount);
    }
  }
  return { out, inc, fee };
}

/** Заголовок результата по типу операции. */
export function resultTitle(op: Operation): string {
  if (op.status === "DECLINED") return "Операция отклонена";
  if (op.status === "CANCELLED") return "Операция отменена";
  if (op.status === "WAITING_CODE") return "Ожидает подтверждения";
  switch (op.type) {
    case "MOBILE":
    case "UTILITY":
      return "Платёж выполнен";
    case "TOPUP":
      return "Счёт пополнен";
    case "INCOMING_TRANSFER":
    case "BANK_DEPOSIT":
      return "Зачисление";
    default:
      return "Перевод выполнен";
  }
}
