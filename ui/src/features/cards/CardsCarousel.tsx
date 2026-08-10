import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Account, Card as CardData } from "@/shared/api/types";
import { BankCard } from "./BankCard";
import { formatMoney } from "@/shared/lib/format";

interface Props {
  cards: CardData[];
  accounts: Account[];
}

/**
 * Карусель карт: показывает одну активную карту + peek следующей + информацию о счёте.
 * Ниже — стрелки и точки-индикатор. Соответствует утверждённому референсу v1.
 */
export function CardsCarousel({ cards, accounts }: Props) {
  const [index, setIndex] = useState(0);
  const qc = useQueryClient();

  const blockMutation = useMutation({
    mutationFn: async (card: CardData) => {
      const nextStatus = card.status === "ACTIVE" ? "BLOCKED" : "ACTIVE";
      return api.patch(`/cards/${card.id}`, { status: nextStatus });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cards"] }),
  });

  if (cards.length === 0) {
    return (
      <div className="text-sm text-ink-secondary py-4 text-center">Карт пока нет</div>
    );
  }

  const active = cards[Math.min(index, cards.length - 1)];
  const nextCard = cards[(index + 1) % cards.length];
  const account = accounts.find((a) => a.id === active.account_id);

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: 200 }}>
          {cards.length > 1 && (
            <div
              className="absolute top-2 -right-2.5 w-[190px] h-[118px] rounded-[12px] opacity-40 rotate-2 z-0"
              style={{ background: "#0f6e56" }}
              aria-hidden="true"
            >
              <BankCard card={nextCard} className="opacity-60" />
            </div>
          )}
          <div className="relative z-10">
            <BankCard card={active} />
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div>
            <div className="text-[11px] text-ink-muted mb-0.5">
              {account
                ? `Счёт · ${account.currency}`
                : "Счёт"}
            </div>
            <div
              className="text-xl font-medium tracking-tight"
              data-testid={`card-account-balance-${active.id}`}
            >
              {account ? formatMoney(account.balance, account.currency) : "—"}
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <span
              className={`badge ${
                active.status === "ACTIVE"
                  ? "bg-success-soft text-success"
                  : active.status === "BLOCKED"
                  ? "bg-warning-soft text-warning"
                  : "bg-fill-control text-ink-secondary"
              }`}
              data-testid={`card-status-${active.id}`}
            >
              {active.status === "ACTIVE"
                ? "Активна"
                : active.status === "BLOCKED"
                ? "Заблокирована"
                : "Истекла"}
            </span>
            {active.is_contactless && (
              <span className="badge bg-fill-control text-ink-secondary">Бесконтакт</span>
            )}
          </div>
          <div className="flex gap-1.5 mt-1">
            <button
              onClick={() => blockMutation.mutate(active)}
              className="btn flex-1 py-1.5 px-2 text-xs"
              data-testid={`card-toggle-block-${active.id}`}
              disabled={active.status === "EXPIRED" || blockMutation.isPending}
            >
              <i className="ti ti-lock text-[13px]" aria-hidden="true"></i>
              {active.status === "BLOCKED" ? "Разблокировать" : "Блок"}
            </button>
            <button className="btn flex-1 py-1.5 px-2 text-xs">
              <i className="ti ti-settings text-[13px]" aria-hidden="true"></i>
              Ещё
            </button>
          </div>
        </div>
      </div>

      {cards.length > 1 && (
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-line">
          <button
            aria-label="Предыдущая карта"
            onClick={() => setIndex((i) => (i - 1 + cards.length) % cards.length)}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-surface-1"
          >
            <i className="ti ti-chevron-left text-sm" aria-hidden="true"></i>
          </button>
          <div className="flex gap-1.5 items-center">
            {cards.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setIndex(i)}
                aria-label={`Карта ${i + 1}`}
                data-testid={`cards-dot-${i}`}
                className={`transition-all ${
                  i === index
                    ? "w-[18px] h-1 rounded-full bg-ink-primary"
                    : "w-1 h-1 rounded-full bg-line-strong"
                }`}
              />
            ))}
          </div>
          <button
            aria-label="Следующая карта"
            onClick={() => setIndex((i) => (i + 1) % cards.length)}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-surface-1"
          >
            <i className="ti ti-chevron-right text-sm" aria-hidden="true"></i>
          </button>
        </div>
      )}
    </div>
  );
}
