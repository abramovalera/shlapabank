import { Account, Card } from "@/shared/api/types";
import { DESIGN_GRADIENTS } from "@/features/cards/BankCard";
import { formatMoney } from "@/shared/lib/format";

export type SourceKind = "card" | "account";

export interface PaymentSource {
  kind: SourceKind;
  id: number;         // card.id или account.id
  accountId: number;  // для запроса на бэк
}

interface Props {
  cards: Card[];
  accounts: Account[];
  value: PaymentSource | null;
  onChange: (v: PaymentSource) => void;
  currencyFilter?: string; // если задан — только эта валюта
}

/**
 * Единый пикер: карты + счета в одном списке.
 * Пользователь выбирает откуда платить — с карты или напрямую со счёта.
 * Для платежей полезно: не у всех есть карты.
 */
export function PaymentSourcePicker({
  cards,
  accounts,
  value,
  onChange,
  currencyFilter,
}: Props) {
  const cardsFiltered = cards.filter((c) => {
    const acc = accounts.find((a) => a.id === c.account_id);
    if (!acc) return false;
    if (currencyFilter && acc.currency !== currencyFilter) return false;
    return c.status === "ACTIVE";
  });
  const accountsFiltered = accounts.filter((a) => {
    if (currencyFilter && a.currency !== currencyFilter) return false;
    return true;
  });

  const hasAny = cardsFiltered.length > 0 || accountsFiltered.length > 0;
  if (!hasAny) {
    return (
      <div className="text-center text-[12px] text-ink-muted py-4">
        Нет доступных счетов и карт{currencyFilter ? ` в валюте ${currencyFilter}` : ""}.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {cardsFiltered.length > 0 && (
        <>
          <SectionTitle>Карты</SectionTitle>
          {cardsFiltered.map((c) => {
            const acc = accounts.find((a) => a.id === c.account_id);
            const selected = value?.kind === "card" && value.id === c.id;
            return (
              <button
                key={`c-${c.id}`}
                onClick={() =>
                  onChange({ kind: "card", id: c.id, accountId: c.account_id })
                }
                data-testid={`source-card-${c.id}`}
                className={`card-nested flex items-center gap-3 text-left transition ${
                  selected ? "border-brand ring-1 ring-brand/40" : "hover:bg-surface-3"
                }`}
              >
                <div
                  className="w-11 h-7 rounded-[3px] relative shrink-0"
                  style={{ background: DESIGN_GRADIENTS[c.design ?? "CLASSIC"] }}
                >
                  <div
                    className="absolute top-[3px] left-[3px] w-[6px] h-[4px] rounded-[1px]"
                    style={{ background: "#F5D547" }}
                  ></div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">
                    •• {c.last4} · {c.payment_system}
                  </div>
                  <div className="text-[10px] text-ink-muted truncate">
                    {acc ? `«${acc.name}» · ${formatMoney(acc.balance, acc.currency)}` : ""}
                  </div>
                </div>
                {selected && <i className="ti ti-check text-accent" aria-hidden="true"></i>}
              </button>
            );
          })}
        </>
      )}
      {accountsFiltered.length > 0 && (
        <>
          <SectionTitle>Счета</SectionTitle>
          {accountsFiltered.map((a) => {
            const selected = value?.kind === "account" && value.id === a.id;
            const icon =
              a.account_type === "SAVINGS" ? "piggy-bank" : "wallet";
            return (
              <button
                key={`a-${a.id}`}
                onClick={() =>
                  onChange({ kind: "account", id: a.id, accountId: a.id })
                }
                data-testid={`source-account-${a.id}`}
                className={`card-nested flex items-center gap-3 text-left transition ${
                  selected ? "border-brand ring-1 ring-brand/40" : "hover:bg-surface-3"
                }`}
              >
                <div className="w-11 h-7 rounded-[3px] bg-brand-soft flex items-center justify-center text-accent shrink-0">
                  <i className={`ti ti-${icon} text-base`} aria-hidden="true"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">
                    {a.name} · {a.currency}
                  </div>
                  <div className="text-[10px] text-ink-muted truncate">
                    •••• {a.account_number.slice(-4)} · {formatMoney(a.balance, a.currency)}
                  </div>
                </div>
                {selected && <i className="ti ti-check text-accent" aria-hidden="true"></i>}
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-ink-muted uppercase tracking-wider px-1">{children}</div>
  );
}
