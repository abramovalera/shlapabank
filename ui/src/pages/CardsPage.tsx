import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Account } from "@/shared/api/types";
import { BankCard } from "@/features/cards/BankCard";
import { useCards } from "@/features/cards/api";
import { IssueCardModal } from "@/features/cards/IssueCardModal";
import { IssueAccountModal } from "@/features/accounts/IssueAccountModal";
import { EmptyState } from "@/shared/ui/EmptyState";
import { formatMoney } from "@/shared/lib/format";

export function CardsPage() {
  const navigate = useNavigate();
  const { data: cards = [] } = useCards();
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => (await api.get("/accounts")).data,
  });
  const [issueOpen, setIssueOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const hasEligibleAccount = accounts.some((a) => a.account_type === "DEBIT");

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-medium">Все карты</h1>
        {cards.length > 0 && (
          <button
            className="btn-primary py-2 px-3.5 text-[13px]"
            onClick={() => setIssueOpen(true)}
            data-testid="issue-card-open-btn"
          >
            <i className="ti ti-plus text-sm" aria-hidden="true"></i>
            Выпустить карту
          </button>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="credit-card-off"
            title="Карт пока нет"
            hint={
              hasEligibleAccount
                ? "Выпустите карту к любому из счетов"
                : "Сначала откройте дебетовый счёт — карта выпустится к нему"
            }
            actionLabel={hasEligibleAccount ? "Открыть карту" : "Открыть счёт"}
            onAction={() =>
              hasEligibleAccount ? setIssueOpen(true) : setAccountOpen(true)
            }
            testId="cards-page-empty"
            actionTestId="cards-page-empty-action"
          />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {cards.map((c) => {
            const account = accounts.find((a) => a.id === c.account_id);
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/cards/${c.id}`)}
                className="card text-left hover:bg-surface-2 transition"
                data-testid={`cards-page-card-${c.id}`}
              >
                <BankCard card={c} size="lg" className="mb-3" />
                <div className="text-xs text-ink-muted mb-0.5">
                  {account ? account.name : "Счёт"} · {c.card_type}
                </div>
                <div className="text-sm font-medium">
                  {account ? formatMoney(account.balance, account.currency) : "—"}
                </div>
                <div className="mt-1.5">
                  <span
                    className={`badge ${
                      c.status === "ACTIVE"
                        ? "bg-success-soft text-success"
                        : c.status === "BLOCKED"
                        ? "bg-warning-soft text-warning"
                        : "bg-fill-control text-ink-secondary"
                    }`}
                  >
                    {c.status === "ACTIVE"
                      ? "Активна"
                      : c.status === "BLOCKED"
                      ? "Заблокирована"
                      : "Истекла"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <IssueCardModal open={issueOpen} onClose={() => setIssueOpen(false)} accounts={accounts} />
      <IssueAccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}
