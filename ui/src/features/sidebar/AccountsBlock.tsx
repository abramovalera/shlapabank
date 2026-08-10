import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Account, Card } from "@/shared/api/types";
import { useCards } from "@/features/cards/api";
import { IssueCardModal } from "@/features/cards/IssueCardModal";
import { IssueAccountModal } from "@/features/accounts/IssueAccountModal";
import { formatMoney } from "@/shared/lib/format";
import { DESIGN_GRADIENTS } from "@/features/cards/BankCard";

/**
 * Блок «Счета и Карты» — сгруппированный:
 * каждый счёт разворачивается со списком привязанных к нему карт (вложение через
 * вертикальную hairline-линию). SAVINGS-счета показывают "Без карты".
 */
export function AccountsBlock() {
  const [openCard, setOpenCard] = useState(false);
  const [openAccount, setOpenAccount] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => (await api.get("/accounts")).data,
  });
  const { data: cards = [] } = useCards();

  const cardsByAccount = new Map<number, Card[]>();
  for (const c of cards) {
    const list = cardsByAccount.get(c.account_id) ?? [];
    list.push(c);
    cardsByAccount.set(c.account_id, list);
  }

  return (
    <div className="sidebar-block">
      <div className="flex justify-between items-center mb-3">
        <div className="text-[14px] font-medium">Счета и Карты</div>
        <span className="text-[11px] text-ink-muted">
          {accounts.length} · {cards.length}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {accounts.length === 0 ? (
          <div className="text-[12px] text-ink-muted text-center py-3">Пока пусто</div>
        ) : (
          accounts.map((a) => (
            <AccountItem
              key={a.id}
              account={a}
              cards={cardsByAccount.get(a.id) ?? []}
            />
          ))
        )}
      </div>

      <div className="flex gap-1.5 mt-3">
        <button
          onClick={() => setOpenAccount(true)}
          className="flex-1 py-2 text-[12px] text-accent bg-brand-soft border border-brand/25 rounded-control hover:bg-brand/25 transition"
        >
          + Счёт
        </button>
        <button
          onClick={() => setOpenCard(true)}
          className="flex-1 py-2 text-[12px] text-accent bg-brand-soft border border-brand/25 rounded-control hover:bg-brand/25 transition"
        >
          + Карта
        </button>
      </div>

      <IssueCardModal open={openCard} onClose={() => setOpenCard(false)} accounts={accounts} />
      <IssueAccountModal open={openAccount} onClose={() => setOpenAccount(false)} />
    </div>
  );
}

function AccountItem({ account, cards }: { account: Account; cards: Card[] }) {
  const navigate = useNavigate();
  const iconClass =
    account.account_type === "SAVINGS"
      ? "bg-success-soft text-success"
      : account.currency === "RUB"
      ? "bg-brand-soft text-accent"
      : "bg-warning-soft text-warning";
  const symbol =
    account.currency === "RUB" ? "₽" : account.currency === "USD" ? "$" : account.currency === "EUR" ? "€" : "¥";

  return (
    <div className="card-nested" data-testid={`sidebar-account-${account.id}`}>
      <button
        onClick={() => navigate(`/accounts/${account.id}`)}
        className="w-full flex items-center gap-2.5 text-left group"
        data-testid={`sidebar-account-${account.id}-link`}
      >
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-medium ${iconClass}`}
        >
          {symbol}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate group-hover:text-accent transition">
            {account.name}
          </div>
          <div className="text-[10px] text-ink-muted">
            •••• {account.account_number.slice(-4)} · {account.currency}
          </div>
        </div>
        <div className="text-[13px] font-semibold text-money tabular-nums">
          {formatMoney(account.balance, account.currency)}
        </div>
      </button>

      {account.account_type === "SAVINGS" ? (
        <div className="text-[10px] text-ink-muted pl-9 mt-1.5">Без карты</div>
      ) : cards.length === 0 ? (
        <div className="text-[10px] text-ink-muted pl-9 mt-1.5">Карт пока нет</div>
      ) : (
        <div
          className="mt-2 ml-3.5 pl-3.5 flex flex-col gap-1.5 border-l border-line"
          data-testid={`sidebar-account-${account.id}-cards`}
        >
          {cards.map((c) => (
            <CardMini key={c.id} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardMini({ card }: { card: Card }) {
  const navigate = useNavigate();
  const statusColor =
    card.status === "ACTIVE"
      ? "bg-success"
      : card.status === "BLOCKED"
      ? "bg-warning"
      : "bg-ink-muted";
  const typeLabel =
    card.card_type === "VIRTUAL" ? "Виртуальная" : card.card_type === "CREDIT" ? "Кредитная" : "Дебетовая";

  return (
    <button
      onClick={() => navigate(`/cards/${card.id}`)}
      className="w-full flex items-center gap-2.5 py-1 text-left hover:bg-fill-hover rounded-[6px] px-1 -mx-1 transition"
      data-testid={`sidebar-card-${card.id}`}
    >
      <div
        className="w-9 h-6 rounded-[3px] flex-shrink-0 relative"
        style={{ background: DESIGN_GRADIENTS[card.design ?? "CLASSIC"] }}
      >
        <div
          className="absolute top-[3px] left-[3px] w-[6px] h-[4px] rounded-[1px]"
          style={{ background: "#F5D547" }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium">•• {card.last4}</div>
        <div className="text-[9px] text-ink-muted truncate">
          {typeLabel} · {card.payment_system}
        </div>
      </div>
      <span
        className={`w-1.5 h-1.5 rounded-full ${statusColor}`}
        title={card.status === "ACTIVE" ? "Активна" : card.status === "BLOCKED" ? "Заблокирована" : "Истекла"}
      ></span>
    </button>
  );
}
