import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/shared/ui/Modal";
import { api } from "@/shared/api/client";
import { Account, AccountType, Currency } from "@/shared/api/types";
import { IssueCardModal } from "@/features/cards/IssueCardModal";
import { apiErrorCode } from "@/shared/api/errors";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CURRENCIES: { code: Currency; symbol: string }[] = [
  { code: "RUB", symbol: "₽" },
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "CNY", symbol: "¥" },
];

/**
 * Открытие счёта. После успешного создания предлагает выпустить карту —
 * если пользователь соглашается, открывается IssueCardModal с закреплённым счётом.
 */
export function IssueAccountModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [currency, setCurrency] = useState<Currency>("RUB");
  const [accountType, setAccountType] = useState<AccountType>("DEBIT");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Промежуточное состояние: счёт создан, спрашиваем про карту
  const [pendingCardChoice, setPendingCardChoice] = useState<Account | null>(null);
  const [issueCardOpen, setIssueCardOpen] = useState(false);

  // Список счетов — нужен для IssueCardModal (внутри там useMemo).
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => (await api.get("/accounts")).data,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Account>("/accounts", {
        currency,
        account_type: accountType,
        name: name.trim() || undefined,
        accept_terms: true,
      });
      return data;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      // Для DEBIT предлагаем выпустить карту — карта у SAVINGS не бывает.
      if (created.account_type === "DEBIT") {
        setPendingCardChoice(created);
      } else {
        finish();
      }
    },
    onError: (e: any) =>
      setError(mapError(apiErrorCode(e) ?? undefined) ?? "Не удалось открыть счёт"),
  });

  function reset() {
    setError(null);
    setAgree(false);
    setCurrency("RUB");
    setAccountType("DEBIT");
    setName("");
    setPendingCardChoice(null);
    setIssueCardOpen(false);
  }

  function finish() {
    reset();
    onClose();
  }

  return (
    <>
      <Modal
        open={open && !pendingCardChoice}
        onClose={onClose}
        title="Открыть счёт"
        subtitle="Дебетовый — для расчётов и карт. Накопительный — под 8% годовых."
        testId="issue-account-modal"
        maxWidth={380}
      >
        <Label>Валюта</Label>
        <div className="grid grid-cols-4 gap-1.5 mb-3.5">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              onClick={() => setCurrency(c.code)}
              data-testid={`currency-${c.code}`}
              className={`py-2 rounded-control text-center transition border ${
                currency === c.code
                  ? "border-brand bg-brand-soft text-accent"
                  : "border-line hover:border-line-strong"
              }`}
            >
              <div className="text-base leading-none">{c.symbol}</div>
              <div
                className={`text-[10px] mt-1 ${
                  currency === c.code ? "text-accent" : "text-ink-muted"
                }`}
              >
                {c.code}
              </div>
            </button>
          ))}
        </div>

        <Label>Тип счёта</Label>
        <div className="grid grid-cols-2 gap-1.5 mb-3.5">
          <TypeTile
            icon="wallet"
            active={accountType === "DEBIT"}
            onClick={() => setAccountType("DEBIT")}
            title="Дебетовый"
            hint="Расчёты, покупки, карта"
            testId="account-type-DEBIT"
          />
          <TypeTile
            icon="piggy-bank"
            active={accountType === "SAVINGS"}
            onClick={() => setAccountType("SAVINGS")}
            title="Накопительный"
            hint="8% годовых, без карты"
            testId="account-type-SAVINGS"
          />
        </div>

        <Label>
          Название счёта{" "}
          <span className="text-[10px] text-ink-muted">— необязательно</span>
        </Label>
        <input
          className="input mb-1"
          placeholder="Например, Зарплатный"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
        />
        <div className="text-[10px] text-ink-muted mb-3.5">
          Если оставить пустым — присвоим авто-имя. Всегда можно переименовать.
        </div>

        <label className="flex items-start gap-2 text-xs text-ink-secondary mb-3.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Согласен с <a className="text-accent">условиями договора счёта</a>
          </span>
        </label>

        {error && (
          <div className="text-xs text-danger bg-danger-soft rounded-control px-3 py-2 mb-3">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button className="btn flex-1" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn-primary flex-[1.4]"
            onClick={() => (agree ? create.mutate() : setError("Нужно принять условия"))}
            disabled={!agree || create.isPending}
          >
            {create.isPending ? "Открываем…" : "Открыть счёт"}
          </button>
        </div>
      </Modal>

      {/* Шаг 2: счёт создан → предлагаем выпустить карту */}
      <Modal
        open={!!pendingCardChoice && !issueCardOpen}
        onClose={finish}
        title="Счёт открыт"
        subtitle="Хотите сразу выпустить карту к нему?"
        testId="offer-card-modal"
        maxWidth={380}
      >
        <div className="flex items-start gap-3 rounded-control bg-success-soft border border-success/30 px-3 py-2.5 mb-4">
          <i className="ti ti-check text-success text-lg mt-0.5" aria-hidden="true"></i>
          <div className="text-[13px]">
            Счёт{" "}
            <span className="font-medium">
              {pendingCardChoice?.name} · •••• {pendingCardChoice?.account_number.slice(-4)}
            </span>{" "}
            готов к использованию.
          </div>
        </div>

        <div className="text-[13px] text-ink-secondary mb-4">
          К дебетовому счёту можно выпустить дебетовую или виртуальную карту с любым дизайном.
          Это не обязательно — можно сделать позже из раздела «Карты».
        </div>

        <div className="flex gap-2">
          <button
            className="btn flex-1"
            onClick={finish}
          >
            Позже
          </button>
          <button
            className="btn-primary flex-[1.4]"
            onClick={() => setIssueCardOpen(true)}
          >
            Выпустить карту
          </button>
        </div>
      </Modal>

      {/* Шаг 3: выпуск карты в preset-режиме (счёт залочен) */}
      {pendingCardChoice && (
        <IssueCardModal
          open={issueCardOpen}
          onClose={finish}
          accounts={
            // Гарантируем, что новый счёт есть в списке, даже если query не успел обновиться
            accounts.some((a) => a.id === pendingCardChoice.id)
              ? accounts
              : [...accounts, pendingCardChoice]
          }
          defaultAccountId={pendingCardChoice.id}
          lockAccount
          submitLabel="Выпустить и завершить"
        />
      )}
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-ink-secondary mb-1.5">{children}</div>;
}

function TypeTile({
  icon,
  active,
  onClick,
  title,
  hint,
  testId,
}: {
  icon: string;
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-2.5 rounded-control transition border ${
        active
          ? "border-brand bg-brand-soft text-accent"
          : "border-line hover:border-line-strong"
      }`}
    >
      <div className={`text-[13px] font-medium ${active ? "text-accent" : ""}`}>
        <i className={`ti ti-${icon} text-sm mr-1`} aria-hidden="true"></i>
        {title}
      </div>
      <div className={`text-[10px] mt-0.5 ${active ? "text-ink-secondary" : "text-ink-muted"}`}>
        {hint}
      </div>
    </button>
  );
}

function mapError(detail: string | undefined): string | null {
  if (!detail) return null;
  if (detail === "account_limit_exceeded")
    return "Достигнут лимит на количество счетов в этой валюте";
  if (detail === "terms_not_accepted") return "Нужно принять условия";
  return detail;
}
