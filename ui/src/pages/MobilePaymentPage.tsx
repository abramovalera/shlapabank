import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useAccounts } from "@/features/accounts/api";
import { useCards } from "@/features/cards/api";
import { TransferShell } from "@/features/transfers/TransferShell";
import { PaymentSourcePicker, PaymentSource } from "@/features/transfers/PaymentSourcePicker";
import { OtpConfirm } from "@/features/transfers/OtpConfirm";
import { TransferSuccess } from "@/features/transfers/TransferSuccess";
import { formatMoney } from "@/shared/lib/format";
import { CountryCodePicker, COUNTRIES, CountryOption } from "@/features/transfers/CountryCodePicker";
import { apiErrorCode } from "@/shared/api/errors";
import { Label, SumRow } from "@/features/transfers/shared";

interface OperatorsResponse {
  operators: string[];
  amountRangeRub: { min: number; max: number };
}

type Step = 0 | 1 | 2 | 3;

export function MobilePaymentPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(0);
  const [country, setCountry] = useState<CountryOption>(COUNTRIES[0]);
  const [rawPhone, setRawPhone] = useState("");
  const [operator, setOperator] = useState<string | null>(null);
  // Пока true, автоопределение не должно перезаписывать выбор, сделанный вручную в сетке.
  const operatorManual = useRef(false);
  const [source, setSource] = useState<PaymentSource | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [completedTxId, setCompletedTxId] = useState<number | null>(null);

  const { data: cards = [] } = useCards();
  const { data: accounts = [] } = useAccounts();
  const { data: ops } = useQuery({
    queryKey: ["payments", "mobile-operators"],
    queryFn: async (): Promise<OperatorsResponse> =>
      (await api.get("/payments/mobile/operators")).data,
  });

  const isPhoneValid = rawPhone.length === country.length;
  const selectedCard =
    source?.kind === "card" ? cards.find((c) => c.id === source.id) : undefined;
  const selectedAccount = accounts.find((a) => a.id === source?.accountId);

  const numericAmount = parseFloat(amount || "0");
  const minAmount = ops?.amountRangeRub?.min ?? 100;
  const maxAmount = ops?.amountRangeRub?.max ?? 12000;
  const amountInRange = numericAmount >= minAmount && numericAmount <= maxAmount;

  // Автоопределение оператора по префиксу (учебное — любые правила).
  // Не перезаписывает выбор, который пользователь уже сделал вручную в сетке.
  useEffect(() => {
    if (operatorManual.current) return;
    if (rawPhone.length >= 3 && ops?.operators.length) {
      const prefix = rawPhone.slice(0, 3);
      const map: Record<string, string> = {
        "900": "MTSha",
        "999": "MTSha",
        "916": "MegaFun",
        "925": "MegaFun",
        "903": "Babline",
        "985": "TelePanda",
        "996": "YotaLike",
      };
      const detected = map[prefix];
      if (detected && ops.operators.includes(detected)) setOperator(detected);
    }
  }, [rawPhone, ops]);

  async function submit(otp: string) {
    setBusy(true);
    setOtpError(null);
    try {
      const { data } = await api.post<{ id: number }>("/payments/mobile", {
        account_id: source?.accountId,
        operator,
        phone: country.code + rawPhone,
        amount,
        otp_code: otp,
      });
      setCompletedTxId(data.id);
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setStep(3);
    } catch (e: any) {
      setOtpError(mapError(apiErrorCode(e) ?? undefined) ?? "Не удалось выполнить платёж");
    } finally {
      setBusy(false);
    }
  }

  function resetAll() {
    setStep(0);
    setRawPhone("");
    setOperator(null);
    operatorManual.current = false;
    setSource(null);
    setAmount("");
    setOtpError(null);
  }

  return (
    <TransferShell
      title="Мобильная связь"
      step={step}
      total={4}
      onBack={() => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))}
      canGoBack={step > 0 && step < 3}
    >
      {step === 0 && (
        <div>
          <Label>Номер телефона</Label>
          <div className="flex gap-2 mb-1">
            <CountryCodePicker
              value={country}
              onChange={(c) => {
                setCountry(c);
                setRawPhone("");
                setOperator(null);
                operatorManual.current = false;
              }}
            />
            <input
              value={formatMask(rawPhone, country.length)}
              onChange={(e) =>
                setRawPhone(e.target.value.replace(/\D/g, "").slice(0, country.length))
              }
              placeholder={maskPlaceholder(country.length)}
              inputMode="numeric"
              className="input flex-1 font-mono tracking-wide h-[42px]"
              data-testid="mobile-phone-input"
            />
          </div>
          <div className="text-[11px] text-ink-muted mb-3">
            {country.length} цифр без {country.code}
          </div>

          {isPhoneValid && ops?.operators && (
            <>
              <Label>Оператор</Label>
              <div className="grid grid-cols-2 gap-1.5 mb-4">
                {ops.operators.map((op) => (
                  <button
                    key={op}
                    onClick={() => {
                      operatorManual.current = true;
                      setOperator(op);
                    }}
                    className={`card-nested text-[13px] font-medium transition ${
                      operator === op ? "border-brand ring-1 ring-brand/40" : "hover:bg-surface-3"
                    }`}
                    data-testid={`operator-${op}`}
                  >
                    {op}
                  </button>
                ))}
              </div>
            </>
          )}

          <button
            onClick={() => setStep(1)}
            disabled={!isPhoneValid || !operator}
            className={`w-full py-2.5 rounded-control font-medium transition ${
              isPhoneValid && operator
                ? "btn-primary"
                : "bg-fill-control text-ink-muted cursor-not-allowed"
            }`}
          >
            Далее
          </button>
        </div>
      )}

      {step === 1 && (
        <div>
          <Label>Откуда платим (карта или счёт) · только RUB</Label>
          <div className="mb-4">
            <PaymentSourcePicker
              cards={cards}
              accounts={accounts}
              value={source}
              onChange={setSource}
              currencyFilter="RUB"
              invalid={numericAmount > 0}
            />
          </div>

          <Label>Сумма, ₽</Label>
          <div className="card-nested flex items-baseline gap-2 mb-2">
            <span className="text-[22px] text-ink-muted">₽</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
              placeholder="0"
              className="bg-transparent border-none outline-none text-[24px] font-medium flex-1 min-w-0"
              inputMode="decimal"
              data-testid="mobile-amount-input"
            />
          </div>
          <div className="text-[11px] text-ink-muted mb-3">
            От {minAmount} ₽ до {maxAmount.toLocaleString("ru-RU")} ₽
          </div>
          <div className="flex gap-1.5 mb-4">
            {[100, 300, 500, 1000].map((v) => (
              <button
                key={v}
                onClick={() =>
                  setAmount((parseFloat(amount || "0") + v).toString())
                }
                className="text-[11px] px-3 py-1 rounded-pill bg-brand-soft border border-brand/30 text-accent"
              >
                +{v}
              </button>
            ))}
          </div>

          {selectedAccount && numericAmount > parseFloat(selectedAccount.balance) && (
            <div className="text-[12px] text-danger bg-danger-soft rounded-control px-3 py-2 mb-3 flex items-center gap-2">
              <i className="ti ti-alert-circle" aria-hidden="true"></i>
              Сумма больше остатка ({formatMoney(selectedAccount.balance, "RUB")})
            </div>
          )}

          <button
            onClick={() => setStep(2)}
            disabled={
              !source ||
              !selectedAccount ||
              !amountInRange ||
              (selectedAccount &&
                numericAmount > parseFloat(selectedAccount.balance))
            }
            className="btn-primary w-full py-2.5"
          >
            Продолжить
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="card-nested mb-4">
            <SumRow label="Оператор" value={operator ?? "—"} />
            <SumRow label="Номер" value={country.code + " " + formatMask(rawPhone, country.length)} />
            <SumRow
              label={source?.kind === "card" ? "С карты" : "Со счёта"}
              value={
                source?.kind === "card" && selectedCard
                  ? `•• ${selectedCard.last4}`
                  : selectedAccount
                  ? `«${selectedAccount.name}»`
                  : "—"
              }
            />
            <div className="h-px bg-line my-2"></div>
            <SumRow label="К оплате" value={formatMoney(numericAmount, "RUB")} bold money />
          </div>
          <OtpConfirm
            onSubmit={submit}
            submitLabel={`Оплатить ${formatMoney(numericAmount, "RUB")}`}
            busy={busy}
            error={otpError}
          />
        </div>
      )}

      {step === 3 && (
        <TransferSuccess
          amount={numericAmount}
          currency="RUB"
          recipientLabel={`${operator} · ${country.code} ${formatMask(rawPhone, country.length)}`}
          fromLabel={
            source?.kind === "card" && selectedCard && selectedAccount
              ? `Карта •• ${selectedCard.last4} · «${selectedAccount.name}»`
              : selectedAccount
              ? `Счёт «${selectedAccount.name}»`
              : undefined
          }
          transactionId={completedTxId}
          onNew={resetAll}
        />
      )}
    </TransferShell>
  );
}

function formatMask(digits: string, length: number = 10): string {
  const d = digits.slice(0, length);
  if (length === 10) {
    const p: string[] = [];
    if (d.length > 0) p.push(d.slice(0, 3));
    if (d.length > 3) p.push(d.slice(3, 6));
    if (d.length > 6) p.push(d.slice(6, 8));
    if (d.length > 8) p.push(d.slice(8, 10));
    return p.join(" ");
  }
  return (d.match(/.{1,3}/g) || []).join(" ");
}
function maskPlaceholder(length: number): string {
  return formatMask("0".repeat(length), length);
}
function mapError(detail: string | undefined): string | null {
  if (!detail) return null;
  const map: Record<string, string> = {
    payment_operator_not_supported: "Оператор не поддерживается",
    payment_amount_out_of_range: "Сумма вне допустимого диапазона",
    payment_requires_rub_account: "Оплата возможна только с RUB счёта",
    insufficient_funds: "Недостаточно средств",
    invalid_otp_code: "Неверный OTP-код",
  };
  return map[detail] ?? detail;
}
