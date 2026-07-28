import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Account, Card, Transaction } from "@/shared/api/types";
import { useCards } from "@/features/cards/api";
import { useRenameAccount } from "@/features/accounts/api";
import { IssueCardModal } from "@/features/cards/IssueCardModal";
import { InlineRename } from "@/shared/ui/InlineRename";
import { DESIGN_GRADIENTS } from "@/features/cards/BankCard";
import { formatMoney, formatRelativeDate, formatTime } from "@/shared/lib/format";

export function AccountDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accountId = parseInt(id ?? "0", 10);
  const [showFullNumber, setShowFullNumber] = useState(false);
  const [issueCardOpen, setIssueCardOpen] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => (await api.get("/accounts")).data,
  });
  const { data: cards = [] } = useCards();
  const { data: allTx = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: async (): Promise<Transaction[]> => (await api.get("/transactions")).data,
  });

  const rename = useRenameAccount();
  const account = accounts.find((a) => a.id === accountId);
  const linkedCards = cards.filter((c) => c.account_id === accountId);
  const accountTx = allTx.filter(
    (t) => t.from_account_id === accountId || t.to_account_id === accountId
  );

  if (accounts.length && !account) {
    return (
      <div className="card text-center py-10">
        <div className="text-ink-secondary">Счёт не найден</div>
        <Link to="/dashboard" className="text-accent mt-3 inline-block">
          На главную →
        </Link>
      </div>
    );
  }

  if (!account) {
    return <div className="card text-center py-10 text-ink-muted">Загружаем…</div>;
  }

  const symbol =
    account.currency === "RUB" ? "₽" : account.currency === "USD" ? "$" : account.currency === "EUR" ? "€" : "¥";

  return (
    <div className="space-y-3">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-[13px] text-ink-secondary hover:text-ink-primary transition"
        data-testid="account-back-btn"
      >
        <i className="ti ti-arrow-left text-base" aria-hidden="true"></i>
        Назад
      </button>

      <section className="card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[20px] font-medium mb-1">
              <InlineRename
                value={account.name}
                onSave={async (next) => {
                  await rename.mutateAsync({ id: account.id, name: next });
                }}
                testId="account-name"
              />
            </div>
            <div className="text-xs text-ink-muted mb-3 flex items-center gap-2 flex-wrap">
              <span>{account.account_type === "SAVINGS" ? "Накопительный" : "Дебетовый"}</span>
              <span>·</span>
              <span className="font-mono">
                {showFullNumber
                  ? formatAccountNumber(account.account_number)
                  : `•••• ${account.account_number.slice(-4)}`}
              </span>
              <button
                onClick={() => setShowFullNumber((v) => !v)}
                className="text-accent hover:underline"
                data-testid="account-toggle-number-btn"
              >
                <i
                  className={`ti ti-${showFullNumber ? "eye-off" : "eye"} text-[13px] mr-1`}
                  aria-hidden="true"
                ></i>
                {showFullNumber ? "Скрыть" : "Показать полностью"}
              </button>
              <span>·</span>
              <span>{account.currency}</span>
            </div>
            <div
              className="text-[32px] font-medium tracking-tight"
              data-testid="account-balance"
            >
              {formatMoney(account.balance, account.currency)}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => navigate("/transfers")}
              className="btn-outline-brand px-3 py-2 text-[13px]"
              data-testid="account-transfer-btn"
            >
              <i className="ti ti-arrow-up-right" aria-hidden="true"></i>
              Перевести
            </button>
            <button
              onClick={() => navigate("/transfers")}
              className="btn-outline-brand px-3 py-2 text-[13px]"
              data-testid="account-topup-btn"
            >
              <i className="ti ti-plus" aria-hidden="true"></i>
              Пополнить
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-[1fr_1.4fr] gap-3">
        <section className="card" data-testid="account-cards-block">
          <div className="flex justify-between items-center mb-3">
            <div className="text-[15px] font-medium">Карты счёта</div>
            {account.account_type === "DEBIT" && (
              <button
                onClick={() => setIssueCardOpen(true)}
                className="text-xs text-accent hover:underline"
                data-testid="account-issue-card-btn"
              >
                + Выпустить
              </button>
            )}
          </div>

          {account.account_type === "SAVINGS" ? (
            <div className="text-[12px] text-ink-muted text-center py-4">
              К накопительному счёту карты не выпускаются
            </div>
          ) : linkedCards.length === 0 ? (
            <div className="text-[12px] text-ink-muted text-center py-4">
              Карт пока нет
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {linkedCards.map((c) => (
                <AccountCardRow key={c.id} card={c} />
              ))}
            </div>
          )}
        </section>

        <section className="card" data-testid="account-tx-block">
          <div className="flex justify-between items-center mb-3">
            <div className="text-[15px] font-medium">Операции по счёту</div>
            <Link to="/history" className="text-xs text-accent hover:underline">
              В историю →
            </Link>
          </div>

          {accountTx.length === 0 ? (
            <div className="text-[12px] text-ink-muted text-center py-6">
              Операций пока нет
            </div>
          ) : (
            <div className="flex flex-col">
              {accountTx.slice(0, 6).map((tx, i) => (
                <AccountTxRow
                  key={tx.id}
                  tx={tx}
                  accountId={accountId}
                  isLast={i === Math.min(5, accountTx.length - 1)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {account.account_type === "DEBIT" && (
        <IssueCardModal
          open={issueCardOpen}
          onClose={() => setIssueCardOpen(false)}
          accounts={accounts}
          defaultAccountId={account.id}
          lockAccount
        />
      )}
    </div>
  );
}

/** Форматирует 16-значный номер счёта в группы по 4: 2202 0000 0000 4021. */
function formatAccountNumber(num: string): string {
  return num.match(/.{1,4}/g)?.join(" ") ?? num;
}

function AccountCardRow({ card }: { card: Card }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/cards/${card.id}`)}
      className="card-nested flex items-center gap-3 hover:bg-surface-3 transition text-left"
      data-testid={`account-linked-card-${card.id}`}
    >
      <div
        className="w-[54px] h-[36px] rounded-[6px] relative shrink-0"
        style={{ background: DESIGN_GRADIENTS[card.design ?? "CLASSIC"] }}
      >
        <div
          className="absolute top-[5px] left-[5px] w-[10px] h-[7px] rounded-[2px]"
          style={{ background: "#F5D547" }}
        ></div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium">•• {card.last4}</div>
        <div className="text-[10px] text-ink-muted">
          {card.card_type === "GOLD" ? "Gold" : "Regular"} · {card.payment_system} · до{" "}
          {String(card.expiry_month).padStart(2, "0")}/{String(card.expiry_year).slice(-2)}
        </div>
      </div>
      <span
        className={`w-2 h-2 rounded-full ${
          card.status === "ACTIVE"
            ? "bg-success"
            : card.status === "BLOCKED"
            ? "bg-warning"
            : "bg-ink-muted"
        }`}
      ></span>
    </button>
  );
}

function AccountTxRow({
  tx,
  accountId,
  isLast,
}: {
  tx: Transaction;
  accountId: number;
  isLast: boolean;
}) {
  const isIncoming = tx.to_account_id === accountId;
  const icon =
    tx.type === "PAYMENT" ? "shopping-cart" : isIncoming ? "arrow-down" : "arrow-up-right";
  const iconClass = isIncoming
    ? "bg-success-soft text-success"
    : "bg-fill-control text-ink-primary";
  return (
    <div
      className={`flex justify-between items-center py-2.5 ${
        isLast ? "" : "border-b border-line"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${iconClass}`}>
          <i className={`ti ti-${icon} text-[15px]`} aria-hidden="true"></i>
        </div>
        <div>
          <div className="text-[13px]">{humanizeDescription(tx.description)}</div>
          <div className="text-[11px] text-ink-muted">
            {formatRelativeDate(tx.created_at)} · {formatTime(tx.created_at)}
          </div>
        </div>
      </div>
      <div className={`text-[13px] ${isIncoming ? "text-success" : ""}`}>
        {isIncoming ? "+" : "−"}
        {formatMoney(tx.money.total, tx.money.currency)}
      </div>
    </div>
  );
}

function humanizeDescription(desc: string | null): string {
  if (!desc) return "Операция";
  if (desc.startsWith("mobile:")) {
    const [, op, phone] = desc.split(":");
    return `${op} · ${phone}`;
  }
  if (desc.startsWith("vendor:")) return desc.split(":")[1] ?? "Платёж";
  if (desc.startsWith("external_transfer")) return "Внешний перевод";
  if (desc.startsWith("p2p_transfer")) return "Между своими счетами";
  if (desc.startsWith("self_topup")) return "Пополнение";
  return desc;
}
