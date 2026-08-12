import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/shared/ui/Modal";
import { Select } from "@/shared/ui/Select";
import { OtpConfirm } from "@/features/transfers/OtpConfirm";
import { api } from "@/shared/api/client";
import { Account } from "@/shared/api/types";
import { formatMoney } from "@/shared/lib/format";
import { apiErrorMessage } from "@/shared/api/errors";
import { useBrokerCash } from "./api";

interface Props {
  open: boolean;
  onClose: () => void;
  mode: "deposit" | "withdraw";
  brokerCash: string;
  onDone?: (msg: string) => void;
}

/** Пополнение брокерского счёта с RUB-счёта или вывод обратно. Шаги: сумма → OTP. */
export function CashModal({ open, onClose, mode, brokerCash, onDone }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cash = useBrokerCash(mode);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => (await api.get("/accounts")).data,
    enabled: open,
  });
  const rubAccounts = accounts.filter((a) => a.currency === "RUB" && a.account_type === "DEBIT");

  useEffect(() => {
    if (open) {
      setStep(1);
      setAmount("");
      setError(null);
      setAccountId(rubAccounts[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const num = parseFloat(amount || "0") || 0;
  const brokerNum = parseFloat(brokerCash || "0") || 0;
  const src = rubAccounts.find((a) => a.id === accountId);
  const isDeposit = mode === "deposit";
  const maxFromSource = isDeposit ? (src ? parseFloat(src.balance) : 0) : brokerNum;
  const amountOk = num > 0 && num <= maxFromSource;
  const canContinue = !!accountId && amountOk;

  function submit(code: string): Promise<void> {
    setError(null);
    return cash
      .mutateAsync({ account_id: accountId!, amount: String(num), otp_code: code })
      .then(() => {
        onDone?.(
          isDeposit
            ? `Брокерский счёт пополнен на ${formatMoney(num, "RUB")}`
            : `Выведено ${formatMoney(num, "RUB")} на счёт`
        );
        onClose();
      })
      .catch((e) => {
        setError(apiErrorMessage(e));
        throw e;
      });
  }

  const title = isDeposit ? "Пополнить брокерский счёт" : "Вывести с брокерского счёта";

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={420}>
      {step === 1 ? (
        <div className="space-y-3">
          <div>
            <div className="text-[12px] text-ink-secondary mb-1.5">
              {isDeposit ? "Счёт списания (RUB)" : "Счёт зачисления (RUB)"}
            </div>
            <Select
              value={accountId}
              onChange={setAccountId}
              options={rubAccounts.map((a) => ({
                value: a.id,
                label: `${a.name}`,
                hint: `•••• ${a.account_number.slice(-4)}`,
                money: formatMoney(a.balance, "RUB"),
              }))}
              placeholder="Выберите RUB-счёт"
            />
          </div>

          <div>
            <div className="text-[12px] text-ink-secondary mb-1.5">Сумма, ₽</div>
            <input
              className="input w-full"
              inputMode="decimal"
              value={amount}
              data-testid="cash-amount"
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
              placeholder="0"
            />
            <div className="text-[11px] text-ink-muted mt-1">
              Доступно: <span className="text-money">{formatMoney(maxFromSource, "RUB")}</span>
            </div>
          </div>

          {num > 0 && num > maxFromSource && (
            <div className="text-xs text-danger">Недостаточно средств</div>
          )}
          {!rubAccounts.length && (
            <div className="text-xs text-danger">Нет активного RUB-счёта — сначала откройте его.</div>
          )}

          <div className="flex gap-2">
            <button className="btn flex-1" onClick={onClose}>
              Отмена
            </button>
            <button
              className="btn-primary flex-[1.4]"
              disabled={!canContinue}
              data-testid="cash-continue"
              onClick={() => setStep(2)}
            >
              Продолжить
            </button>
          </div>
        </div>
      ) : (
        <OtpConfirm
          submitLabel={isDeposit ? "Пополнить" : "Вывести"}
          busy={cash.isPending}
          error={error}
          onSubmit={submit}
        />
      )}
    </Modal>
  );
}
