import type { Account } from "../api/types";
import { formatMoney } from "./format";
import { IconChevronDown } from "./icons";

const ACCOUNT_TONES = [
  "bg-tone-blue-bg text-tone-blue",
  "bg-tone-gold-bg text-tone-gold",
  "bg-tone-green-bg text-tone-green",
];

/** Цвет значка счёта — по порядку в списке. */
export function accountTone(accounts: Account[] | undefined, id: number): string {
  const i = Math.max(0, accounts?.findIndex((a) => a.id === id) ?? 0);
  return ACCOUNT_TONES[i % ACCOUNT_TONES.length];
}

export function AccountBadge({ tone, size = 40 }: { tone: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size < 36 ? 14 : 15 }}
      className={`grid flex-none place-items-center font-bold ${size < 36 ? "rounded-small" : "rounded-control"} ${tone}`}
    >
      ₽
    </span>
  );
}

/**
 * Выбор счёта: выглядит как карточка счёта из макета,
 * а под ней — прозрачный нативный select (клавиатура, доступность, автотесты).
 */
export function AccountSelect({
  id,
  accounts,
  value,
  onChange,
  testId,
  exclude,
  disabled,
}: {
  id: string;
  accounts: Account[];
  value: number | null;
  onChange: (id: number) => void;
  testId: string;
  exclude?: number | null;
  disabled?: boolean;
}) {
  const list = accounts.filter((a) => a.id !== exclude);
  const selected = list.find((a) => a.id === value) ?? null;
  return (
    <div className="relative flex h-14 items-center gap-3 rounded-control bg-page px-3.5 focus-within:shadow-focus">
      {selected ? (
        <>
          <AccountBadge tone={accountTone(accounts, selected.id)} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{selected.name}</span>
            <span className="text-[13px] text-ink-muted" data-testid={`${testId}-balance`}>
              {formatMoney(selected.balance)}
            </span>
          </span>
        </>
      ) : (
        <span className="flex-1 text-ink-faint">Выберите счёт</span>
      )}
      <IconChevronDown color="#6b7a8c" />
      <select
        id={id}
        data-testid={testId}
        value={selected ? String(selected.id) : ""}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
      >
        {!selected && (
          <option value="" disabled>
            Выберите счёт
          </option>
        )}
        {list.map((a) => (
          <option key={a.id} value={a.id} data-testid={`${testId}-option-${a.id}`}>
            {a.name} — {formatMoney(a.balance)}
          </option>
        ))}
      </select>
    </div>
  );
}
