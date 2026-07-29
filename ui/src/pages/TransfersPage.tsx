import { useState, FormEvent, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/shared/api/client";
import { useAccounts } from "@/features/accounts/api";
import { TransferShell } from "@/features/transfers/TransferShell";
import { Select, SelectOption } from "@/shared/ui/Select";
import { formatMoney, currencySymbol } from "@/shared/lib/format";
import { apiErrorCode } from "@/shared/api/errors";
import { Label } from "@/features/transfers/shared";

/**
 * Перевод между своими счетами. Одна форма без вкладок —
 * другие типы переводов имеют свои страницы (/transfers/by-card, /by-phone).
 */
export function TransfersPage() {
  const qc = useQueryClient();

  const { data: accounts = [] } = useAccounts();

  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Инициализация: первый DEBIT-счёт как источник, второй как получатель.
  // Бэкенд в /accounts уже возвращает только is_active=true, доп-фильтровать не надо.
  const debitAccounts = useMemo(
    () => accounts.filter((a) => a.account_type === "DEBIT"),
    [accounts]
  );
  const anyAccounts = accounts;

  const fromOptions: SelectOption<number>[] = debitAccounts.map((a) => ({
    value: a.id,
    label: `${a.name} · ${a.currency}`,
    hint: `•• ${a.account_number.slice(-4)} · ${formatMoney(a.balance, a.currency)}`,
  }));
  const toOptions: SelectOption<number>[] = anyAccounts.map((a) => ({
    value: a.id,
    label: `${a.name} · ${a.currency}`,
    hint: `•• ${a.account_number.slice(-4)} · ${formatMoney(a.balance, a.currency)}`,
    disabled: a.id === fromId,
  }));

  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const num = parseFloat(amount || "0");

  const sameAccount = fromId !== null && fromId === toId;
  const currencyMismatch = from && to && from.currency !== to.currency;
  const overBalance = from && num > parseFloat(from.balance) && num > 0;

  const transfer = useMutation({
    mutationFn: async () =>
      api.post("/transfers", {
        from_account_id: fromId,
        to_account_id: toId,
        amount,
      }),
    onSuccess: () => {
      setSuccess(true);
      setAmount("");
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (e: any) =>
      setError(mapErr(apiErrorCode(e) ?? undefined) ?? "Не удалось выполнить перевод"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fromId || !toId) return setError("Выберите счета");
    if (sameAccount) return setError("Нельзя перевести на тот же счёт");
    if (currencyMismatch)
      return setError(
        `Валюты не совпадают: ${from!.currency} → ${to!.currency}. Для конвертации перейдите в раздел «Обмен валют».`
      );
    if (num <= 0) return setError("Укажите сумму больше 0");
    if (overBalance) return setError("Недостаточно средств");
    transfer.mutate();
  }

  const canSubmit =
    !!fromId && !!toId && !sameAccount && !currencyMismatch && num > 0 && !overBalance && !transfer.isPending;

  return (
    <TransferShell
      title="Между своими счетами"
      step={0}
      total={1}
      onBack={() => {}}
      canGoBack={false}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="own-transfer-form">
        <div>
          <Label>Со счёта</Label>
          <Select
            value={fromId}
            onChange={setFromId}
            options={fromOptions}
            placeholder="Выберите счёт"
            testId="from-account-select"
          />
        </div>

        <div>
          <Label>На счёт</Label>
          <Select
            value={toId}
            onChange={setToId}
            options={toOptions}
            placeholder="Выберите счёт"
            testId="to-account-select"
          />
        </div>

        {currencyMismatch && (
          <div className="text-[12px] text-warning bg-warning-soft rounded-control px-3 py-2">
            <i className="ti ti-alert-triangle mr-1" aria-hidden="true"></i>
            Валюты счетов не совпадают: {from!.currency} → {to!.currency}. Для конвертации перейдите в раздел{" "}
            <Link to="/transfers/exchange" className="text-accent hover:underline font-medium">
              «Обмен валют»
            </Link>
            .
          </div>
        )}

        {sameAccount && (
          <div className="text-[12px] text-danger bg-danger-soft rounded-control px-3 py-2">
            Нельзя перевести на тот же счёт. Выберите другой.
          </div>
        )}

        <div>
          <Label>Сумма</Label>
          <div className="card-nested flex items-baseline gap-2 mb-1">
            <span className="text-[22px] text-ink-muted">
              {from ? currencySymbol(from.currency) : "—"}
            </span>
            <input
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))
              }
              placeholder="0"
              className="bg-transparent border-none outline-none text-[24px] font-medium flex-1 min-w-0"
              inputMode="decimal"
              data-testid="transfer-amount-input"
            />
          </div>
          {overBalance && (
            <div className="text-[12px] text-danger mt-1 flex items-center gap-1">
              <i className="ti ti-alert-circle" aria-hidden="true"></i>
              Сумма больше доступного остатка ({formatMoney(from!.balance, from!.currency)})
            </div>
          )}
          {from && !overBalance && num > 0 && (
            <div className="text-[11px] text-ink-muted mt-1">
              Останется: {formatMoney(parseFloat(from.balance) - num, from.currency)}
            </div>
          )}
        </div>

        <div className="flex gap-1.5">
          {[1000, 5000, 10000].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount((parseFloat(amount || "0") + v).toString())}
              className="text-[11px] px-3 py-1 rounded-pill bg-brand-soft border border-brand/30 text-accent"
            >
              +{v}
            </button>
          ))}
          {from && (
            <button
              type="button"
              onClick={() => setAmount(from.balance)}
              className="text-[11px] px-3 py-1 rounded-pill bg-brand-soft border border-brand/30 text-accent"
            >
              Всё
            </button>
          )}
        </div>

        {error && (
          <div className="text-xs text-danger bg-danger-soft rounded-control px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div
            className="text-xs text-success bg-success-soft rounded-control px-3 py-2"
            data-testid="transfer-success"
          >
            <i className="ti ti-check mr-1" aria-hidden="true"></i>
            Перевод выполнен
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          data-testid="transfer-submit-btn"
          className={`w-full py-3 mt-1 rounded-control font-medium transition ${
            canSubmit ? "btn-primary" : "bg-fill-control text-ink-muted cursor-not-allowed"
          }`}
        >
          {transfer.isPending ? "Переводим…" : "Перевести"}
        </button>
      </form>
    </TransferShell>
  );
}

function mapErr(detail: string | undefined): string | null {
  if (!detail) return null;
  const map: Record<string, string> = {
    account_not_found: "Счёт не найден",
    account_inactive: "Счёт неактивен",
    transfer_same_account: "Нельзя перевести на тот же счёт",
    currency_mismatch: "Валюты счетов не совпадают",
    insufficient_funds: "Недостаточно средств",
    transfer_amount_too_small: "Сумма меньше минимальной",
    transfer_amount_exceeds_single_limit: "Сумма превышает разовый лимит",
    transfer_not_allowed_from_savings: "Со сберегательного счёта переводы запрещены",
  };
  return map[detail] ?? detail;
}
