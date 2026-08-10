import { Account, Card } from "@/shared/api/types";
import { DESIGN_GRADIENTS } from "@/features/cards/BankCard";
import { formatMoney } from "@/shared/lib/format";

interface Props {
  cards: Card[];
  accounts: Account[];
  selectedId: number | null;
  onSelect: (cardId: number) => void;
  /** Фильтр по валюте счёта (например для СБП — только RUB). */
  currencyFilter?: string;
  /** Подсветить жёлтым, если карта обязательна, но не выбрана. */
  invalid?: boolean;
}

/**
 * Список карт источника с мини-визуалом. Показывает баланс привязанного счёта.
 * Заблокированные и с валютным несовпадением — недоступны для выбора.
 */
export function SourceCardPicker({
  cards,
  accounts,
  selectedId,
  onSelect,
  currencyFilter,
  invalid,
}: Props) {
  if (cards.length === 0) {
    return (
      <div className="text-center text-[12px] text-ink-muted py-4">
        Карт нет. Сначала выпустите карту в разделе «Карты».
      </div>
    );
  }

  const showInvalid = invalid && selectedId == null;

  return (
    <div
      className={`flex flex-col gap-1.5 ${
        showInvalid ? "rounded-card border border-warning/60 bg-warning-soft/40 p-2" : ""
      }`}
    >
      {showInvalid && (
        <div className="flex items-center gap-1.5 text-[12px] text-warning px-1">
          <i className="ti ti-alert-triangle" aria-hidden="true"></i>
          Выберите карту, с которой списать
        </div>
      )}
      {cards.map((c) => {
        const account = accounts.find((a) => a.id === c.account_id);
        const blocked = c.status !== "ACTIVE";
        const wrongCurrency =
          currencyFilter && account && account.currency !== currencyFilter;
        const disabled = blocked || !!wrongCurrency;

        return (
          <button
            key={c.id}
            onClick={() => !disabled && onSelect(c.id)}
            disabled={disabled}
            data-testid={`source-card-${c.id}`}
            className={`card-nested flex items-center gap-3 text-left transition ${
              disabled
                ? "opacity-40 cursor-not-allowed"
                : selectedId === c.id
                ? "border-brand ring-1 ring-brand/40"
                : "hover:bg-surface-3"
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
                {account
                  ? `«${account.name}» · ${formatMoney(account.balance, account.currency)}`
                  : "Счёт не найден"}
                {blocked && " · заблокирована"}
                {wrongCurrency && ` · только ${currencyFilter}`}
              </div>
            </div>
            {selectedId === c.id && !disabled && (
              <i className="ti ti-check text-accent" aria-hidden="true"></i>
            )}
          </button>
        );
      })}
    </div>
  );
}
