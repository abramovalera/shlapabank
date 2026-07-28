import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/shared/ui/Modal";
import { Select } from "@/shared/ui/Select";
import { api } from "@/shared/api/client";
import { apiErrorMessage } from "@/shared/api/errors";
import { Account } from "@/shared/api/types";
import { formatMoney } from "@/shared/lib/format";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Test-режим: быстрое пополнение своего счёта. Использует POST /accounts/{id}/deposit
 * (без OTP, только владельцу). Открывается по клику на логотип в шапке.
 */
export function TopupModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState<"" | "gift">("gift");
  const [error, setError] = useState<string | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => (await api.get("/accounts")).data,
    enabled: open,
  });

  const selected = accounts.find((a) => a.id === accountId);
  const num = parseFloat(amount || "0");

  const topup = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { amount: num.toString() };
      if (purpose) body.purpose = purpose;
      return api.post(`/accounts/${accountId}/deposit`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["statistics"] });
      reset();
      onClose();
    },
    onError: (e: any) => setError(apiErrorMessage(e)),
  });

  function reset() {
    setError(null);
    setAmount("");
    setPurpose("gift");
    setAccountId(null);
  }

  function submit() {
    setError(null);
    if (!accountId) return setError("Выберите счёт");
    if (num <= 0) return setError("Введите сумму больше 0");
    topup.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🧪 Тест-пополнение"
      subtitle="Быстро добавить денег на любой ваш счёт — только для отладки"
      testId="topup-modal"
      maxWidth={400}
    >
      <div className="text-[12px] text-ink-secondary mb-1.5">Счёт</div>
      <div className="mb-3">
        <Select
          value={accountId}
          onChange={setAccountId}
          options={accounts.map((a) => ({
            value: a.id,
            label: `${a.name} · ${a.currency}`,
            hint: `•••• ${a.account_number.slice(-4)} · ${formatMoney(a.balance, a.currency)}`,
          }))}
          placeholder="Выберите счёт"
          testId="topup-account-select"
        />
      </div>

      <div className="text-[12px] text-ink-secondary mb-1.5">
        Сумма{selected && `, ${selected.currency}`}
      </div>
      <div className="card-nested flex items-baseline gap-2 mb-2">
        <span className="text-[22px] text-ink-muted">
          {selected ? currencySymbol(selected.currency) : "—"}
        </span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
          placeholder="0"
          className="bg-transparent border-none outline-none text-[24px] font-medium flex-1 min-w-0"
          inputMode="decimal"
          data-testid="topup-amount-input"
        />
      </div>
      <div className="flex gap-1.5 flex-wrap mb-4">
        {[1000, 5000, 10000, 50000].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setAmount((parseFloat(amount || "0") + v).toString())}
            className="text-[11px] px-3 py-1 rounded-pill bg-brand-soft border border-brand/30 text-accent"
          >
            +{v.toLocaleString("ru-RU")}
          </button>
        ))}
      </div>

      <div className="text-[12px] text-ink-secondary mb-1.5">Как отобразить в истории</div>
      <div className="grid grid-cols-2 gap-1.5 mb-4">
        <PurposeBtn active={purpose === "gift"} onClick={() => setPurpose("gift")}>
          🎁 Подарок
        </PurposeBtn>
        <PurposeBtn active={purpose === ""} onClick={() => setPurpose("")}>
          ↓ Пополнение
        </PurposeBtn>
      </div>

      {error && (
        <div className="text-xs text-danger bg-danger-soft rounded-control px-3 py-2 mb-3">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button className="btn flex-1" onClick={onClose} data-testid="topup-cancel-btn">
          Отмена
        </button>
        <button
          className="btn-primary flex-[1.4]"
          onClick={submit}
          disabled={!accountId || num <= 0 || topup.isPending}
          data-testid="topup-submit-btn"
        >
          {topup.isPending ? "Пополняем…" : "Пополнить"}
        </button>
      </div>
    </Modal>
  );
}

function PurposeBtn({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[13px] p-2.5 rounded-control transition border ${
        active
          ? "border-brand bg-brand-soft text-accent"
          : "border-line hover:border-line-strong"
      }`}
    >
      {children}
    </button>
  );
}
function currencySymbol(c: string): string {
  return c === "USD" ? "$" : c === "EUR" ? "€" : c === "CNY" ? "¥" : "₽";
}
