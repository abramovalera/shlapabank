import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useAccounts } from "@/features/accounts/api";
import { TransferShell } from "@/features/transfers/TransferShell";
import { OtpConfirm } from "@/features/transfers/OtpConfirm";
import { TransferSuccess } from "@/features/transfers/TransferSuccess";
import { Label } from "@/features/transfers/shared";
import { Select, SelectOption } from "@/shared/ui/Select";
import { formatMoney, currencySymbol } from "@/shared/lib/format";
import { apiErrorCode } from "@/shared/api/errors";

type Step = 0 | 1 | 2;

interface RatesResponse {
  base: "RUB";
  toRub: Record<string, string>;
}

/**
 * Обмен валюты между своими счетами.
 *
 * Логика:
 *  - Счета разной валюты, DEBIT (SAVINGS запрещён на бэке).
 *  - Курсы фиксированные, приходят с бэка (`GET /transfers/rates`, в RUB за 1 единицу).
 *  - Клиент сначала видит предварительный расчёт: X USD → Y EUR по курсу,
 *    потом OTP → списание с source, зачисление на target.
 *  - Комиссия 0, но списание учитывается в суточном лимите валюты источника.
 */
export function ExchangePage() {
  const qc = useQueryClient();

  const { data: accounts = [] } = useAccounts();

  const { data: rates } = useQuery({
    queryKey: ["exchange-rates"],
    queryFn: async (): Promise<RatesResponse> => (await api.get("/transfers/rates")).data,
    staleTime: 60_000,
  });

  const [step, setStep] = useState<Step>(0);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [step0Error, setStep0Error] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [completedTxId, setCompletedTxId] = useState<number | null>(null);

  // Только активные DEBIT-счета (с SAVINGS переводить нельзя, бэк вернёт ошибку)
  const activeDebit = useMemo(
    () => accounts.filter((a) => a.account_type === "DEBIT"),
    [accounts]
  );

  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);

  const fromOptions: SelectOption<number>[] = activeDebit.map((a) => ({
    value: a.id,
    label: `${a.name} · ${a.currency}`,
    hint: `•• ${a.account_number.slice(-4)}`,
    money: formatMoney(a.balance, a.currency),
  }));

  // Куда: любой свой активный счёт с ДРУГОЙ валютой (иначе бэк вернёт currency_mismatch).
  const toOptions: SelectOption<number>[] = accounts
    .filter((a) => (from ? a.currency !== from.currency : true))
    .map((a) => ({
      value: a.id,
      label: `${a.name} · ${a.currency}`,
      hint: `•• ${a.account_number.slice(-4)}`,
    money: formatMoney(a.balance, a.currency),
      disabled: a.id === fromId,
    }));

  const num = parseFloat(amount.replace(",", ".") || "0");
  const overBalance = !!from && num > parseFloat(from.balance) && num > 0;

  // Локальный расчёт по курсам: сначала переводим сумму в RUB, потом делим на курс target.
  const preview = useMemo(() => {
    if (!from || !to || num <= 0 || !rates) return null;
    const sourceRate = parseFloat(rates.toRub[from.currency] ?? "0");
    const targetRate = parseFloat(rates.toRub[to.currency] ?? "0");
    if (!sourceRate || !targetRate) return null;
    const rubEquivalent = num * sourceRate;
    const targetAmount = rubEquivalent / targetRate;
    const pairRate = sourceRate / targetRate; // сколько target даст 1 source
    return {
      sourceCurrency: from.currency,
      targetCurrency: to.currency,
      sourceAmount: num,
      targetAmount: +targetAmount.toFixed(2),
      pairRate: +pairRate.toFixed(4),
    };
  }, [from, to, num, rates]);

  function onProceedToOtp() {
    setStep0Error(null);
    if (!fromId || !toId) return setStep0Error("Выберите счёт списания и зачисления");
    if (fromId === toId) return setStep0Error("Счета должны быть разными");
    if (from && to && from.currency === to.currency)
      return setStep0Error("Валюты счетов должны отличаться");
    if (num <= 0) return setStep0Error("Введите сумму больше 0");
    if (overBalance) return setStep0Error("Недостаточно средств на счёте списания");
    if (!preview)
      return setStep0Error("Обмен для этой пары валют не поддерживается");
    setStep(1);
  }

  async function submitExchange(otp: string) {
    setBusy(true);
    setOtpError(null);
    try {
      const { data } = await api.post<{ id: number }>("/transfers/exchange", {
        from_account_id: fromId,
        to_account_id: toId,
        amount,
        otp_code: otp,
      });
      setCompletedTxId(data.id);
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setStep(2);
    } catch (e: any) {
      setOtpError(mapError(apiErrorCode(e) ?? undefined) ?? "Не удалось выполнить обмен");
    } finally {
      setBusy(false);
    }
  }

  function resetAll() {
    setStep(0);
    setFromId(null);
    setToId(null);
    setAmount("");
    setStep0Error(null);
    setOtpError(null);
    setCompletedTxId(null);
  }

  return (
    <TransferShell
      title="Обмен валют"
      step={step}
      total={3}
      onBack={() => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))}
      canGoBack={step > 0 && step < 2}
    >
      {step === 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <Label>Со счёта</Label>
            <Select
              value={fromId}
              onChange={(id) => {
                setFromId(id);
                // Если новый source в одной валюте с текущим target — сбросить target
                if (id && to && accounts.find((a) => a.id === id)?.currency === to.currency) {
                  setToId(null);
                }
              }}
              options={fromOptions}
              placeholder="Выберите счёт списания"
              testId="exchange-from-select"
            />
          </div>

          <div>
            <Label>На счёт</Label>
            <Select
              value={toId}
              onChange={setToId}
              options={toOptions}
              placeholder={from ? "Выберите счёт другой валюты" : "Сначала выберите счёт списания"}
              testId="exchange-to-select"
            />
          </div>

          <div>
            <Label>Сумма списания</Label>
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
                data-testid="exchange-amount-input"
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
            {[100, 500, 1000].map((v) => (
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

          {preview && (
            <div
              className="card-nested flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink-secondary">Курс</span>
                <span className="font-mono">
                  1 {preview.sourceCurrency} ≈ {preview.pairRate} {preview.targetCurrency}
                </span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink-secondary">Комиссия</span>
                <span className="text-success">0 {preview.sourceCurrency}</span>
              </div>
              <div className="border-t border-line my-1" />
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-ink-secondary">К зачислению</span>
                <span className="text-[18px] font-medium text-accent">
                  {formatMoney(preview.targetAmount, preview.targetCurrency)}
                </span>
              </div>
            </div>
          )}

          {step0Error && (
            <div className="text-xs text-danger bg-danger-soft rounded-control px-3 py-2">
              {step0Error}
            </div>
          )}

          <button
            onClick={onProceedToOtp}
            disabled={!fromId || !toId || num <= 0 || overBalance || !preview}
            className={`w-full py-3 mt-1 rounded-control font-medium transition ${
              fromId && toId && num > 0 && !overBalance && preview
                ? "btn-primary"
                : "bg-fill-control text-ink-muted cursor-not-allowed"
            }`}
          >
            Продолжить
          </button>
        </div>
      )}

      {step === 1 && (
        <OtpConfirm
          onSubmit={submitExchange}
          submitLabel={`Обменять ${preview ? formatMoney(preview.sourceAmount, preview.sourceCurrency) : ""}`}
          busy={busy}
          error={otpError}
        />
      )}

      {step === 2 && preview && (
        <TransferSuccess
          amount={preview.targetAmount}
          currency={preview.targetCurrency}
          recipientLabel={`${to?.name ?? "Счёт"} · ${preview.targetCurrency}`}
          fromLabel={`${from?.name ?? "Счёт"} · ${formatMoney(preview.sourceAmount, preview.sourceCurrency)}`}
          transactionId={completedTxId}
          onNew={resetAll}
        />
      )}
    </TransferShell>
  );
}

function mapError(code: string | undefined): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    invalid_otp_code: "Неверный или истёкший OTP-код",
    transfer_same_account: "Нельзя обменять на тот же счёт",
    currency_mismatch: "Валюты счетов должны отличаться",
    currency_not_supported_for_exchange: "Обмен для этой пары валют не поддерживается",
    insufficient_funds: "Недостаточно средств",
    transfer_amount_too_small: "Сумма меньше минимальной",
    transfer_amount_exceeds_single_limit: "Сумма превышает разовый лимит",
    transfer_amount_exceeds_daily_limit: "Сумма превышает суточный лимит по валюте",
    transfer_not_allowed_from_savings: "Со сберегательного счёта обмен запрещён",
    account_not_found: "Счёт не найден",
    account_inactive: "Счёт неактивен",
    forbidden_account_access: "Нет доступа к счёту",
  };
  return map[code] ?? code;
}
