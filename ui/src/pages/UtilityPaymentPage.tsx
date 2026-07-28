import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Account } from "@/shared/api/types";
import { useCards } from "@/features/cards/api";
import { TransferShell } from "@/features/transfers/TransferShell";
import { PaymentSourcePicker, PaymentSource } from "@/features/transfers/PaymentSourcePicker";
import { OtpConfirm } from "@/features/transfers/OtpConfirm";
import { TransferSuccess } from "@/features/transfers/TransferSuccess";
import { Select } from "@/shared/ui/Select";
import { formatMoney } from "@/shared/lib/format";

interface ProvidersResponse {
  providers: { name: string; accountLength: number }[];
}

type Step = 0 | 1 | 2 | 3;
type CatKey = "utilities" | "internet" | "education" | "charity";

const CATEGORIES: { key: CatKey; label: string; icon: string; providers: string[] }[] = [
  { key: "utilities",  label: "ЖКХ",              icon: "bolt",    providers: ["ZhKH-Service", "UO-Gorod", "DomComfort", "GasEnergy", "CityWater"] },
  { key: "internet",   label: "Интернет и ТВ",    icon: "wifi",    providers: ["RostelCom+", "TV360", "FiberNet"] },
  { key: "education",  label: "Образование",      icon: "school",  providers: ["UniEdu", "EduCenter+"] },
  { key: "charity",    label: "Благотворительность", icon: "heart", providers: ["GoodHands", "KindKids"] },
];

/** Расширения — специфичные поля для каждой категории. */
interface Extras {
  // ЖКХ
  readingHot?: string;
  readingCold?: string;
  readingElectricity?: string;
  passReadings?: boolean;
  // Интернет
  contractNumber?: string;
  enableAutoPay?: boolean;
  // Образование
  studentId?: string;
  paymentPeriod?: string; // семестр / месяц
  fullName?: string;
  // Благотворительность
  anonymous?: boolean;
  purpose?: string;
  regularDonation?: boolean;
}

export function UtilityPaymentPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(0);
  const [categoryKey, setCategoryKey] = useState<CatKey | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [source, setSource] = useState<PaymentSource | null>(null);
  const [amount, setAmount] = useState("");
  const [extras, setExtras] = useState<Extras>({});
  const [busy, setBusy] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [completedTxId, setCompletedTxId] = useState<number | null>(null);

  const { data: cards = [] } = useCards();
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => (await api.get("/accounts")).data,
  });
  const { data: prov } = useQuery({
    queryKey: ["payments", "vendor-providers"],
    queryFn: async (): Promise<ProvidersResponse> =>
      (await api.get("/payments/vendor/providers")).data,
  });

  const category = CATEGORIES.find((c) => c.key === categoryKey);
  const providerMeta = prov?.providers.find((p) => p.name === provider);
  const selectedCard =
    source?.kind === "card" ? cards.find((c) => c.id === source.id) : undefined;
  const selectedAccount = accounts.find((a) => a.id === source?.accountId);

  const acctValid = providerMeta ? accountNumber.length === providerMeta.accountLength : false;
  const numericAmount = parseFloat(amount || "0");
  const overBalance = selectedAccount && numericAmount > parseFloat(selectedAccount.balance);

  async function submit(otp: string) {
    setBusy(true);
    setOtpError(null);
    try {
      // extras пакуем в description на будущее — бэку сейчас только базовый vendor нужен
      const extrasSuffix = buildExtrasSuffix(categoryKey!, extras);
      // extras пока не отправляем на бэк — показываем только в сводке шага и success-экране
      void extrasSuffix;
      const { data } = await api.post<{ id: number }>("/payments/vendor", {
        account_id: source?.accountId,
        provider,
        account_number: accountNumber,
        amount,
        otp_code: otp,
      });
      setCompletedTxId(data.id);
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setStep(3);
    } catch (e: any) {
      setOtpError(mapError(e?.response?.data?.detail) ?? "Не удалось выполнить платёж");
    } finally {
      setBusy(false);
    }
  }

  function resetAll() {
    setStep(0);
    setCategoryKey(null);
    setProvider(null);
    setAccountNumber("");
    setSource(null);
    setAmount("");
    setExtras({});
    setOtpError(null);
  }

  return (
    <TransferShell
      title="Платёж поставщику"
      step={step}
      total={4}
      onBack={() => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))}
      canGoBack={step > 0 && step < 3}
    >
      {step === 0 && (
        <div>
          <Label>Категория</Label>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => {
                  setCategoryKey(c.key);
                  setProvider(null);
                  setExtras({});
                }}
                className={`card-nested flex flex-col items-center gap-1.5 py-3 transition ${
                  categoryKey === c.key ? "border-brand ring-1 ring-brand/40" : "hover:bg-surface-3"
                }`}
                data-testid={`category-${c.key}`}
              >
                <i className={`ti ti-${c.icon} text-[22px] text-accent`} aria-hidden="true"></i>
                <span className="text-[12px]">{c.label}</span>
              </button>
            ))}
          </div>

          {category && (
            <>
              <Label>Поставщик</Label>
              <Select
                value={provider}
                onChange={setProvider}
                options={category.providers.map((n) => ({ value: n, label: n }))}
                placeholder="Выберите поставщика"
                testId="provider-select"
              />
              <div className="mb-4" />
            </>
          )}

          <button
            onClick={() => setStep(1)}
            disabled={!provider}
            className={`w-full py-2.5 rounded-control font-medium transition ${
              provider ? "btn-primary" : "bg-fill-control text-ink-muted cursor-not-allowed"
            }`}
          >
            Далее
          </button>
        </div>
      )}

      {step === 1 && (
        <div>
          {/* ------- Специфичные поля per category ------- */}
          {categoryKey === "utilities" && (
            <UtilitiesFields
              accountNumber={accountNumber}
              setAccountNumber={setAccountNumber}
              providerLength={providerMeta?.accountLength}
              extras={extras}
              setExtras={setExtras}
            />
          )}
          {categoryKey === "internet" && (
            <InternetFields
              accountNumber={accountNumber}
              setAccountNumber={setAccountNumber}
              providerLength={providerMeta?.accountLength}
              extras={extras}
              setExtras={setExtras}
            />
          )}
          {categoryKey === "education" && (
            <EducationFields
              accountNumber={accountNumber}
              setAccountNumber={setAccountNumber}
              providerLength={providerMeta?.accountLength}
              extras={extras}
              setExtras={setExtras}
            />
          )}
          {categoryKey === "charity" && (
            <CharityFields
              accountNumber={accountNumber}
              setAccountNumber={setAccountNumber}
              providerLength={providerMeta?.accountLength}
              extras={extras}
              setExtras={setExtras}
            />
          )}

          <Label>Откуда платим (карта или счёт) · только RUB</Label>
          <div className="mb-4">
            <PaymentSourcePicker
              cards={cards}
              accounts={accounts}
              value={source}
              onChange={setSource}
              currencyFilter="RUB"
            />
          </div>

          <Label>Сумма, ₽</Label>
          <div className="card-nested flex items-baseline gap-2 mb-1">
            <span className="text-[22px] text-ink-muted">₽</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
              placeholder="0"
              className="bg-transparent border-none outline-none text-[24px] font-medium flex-1 min-w-0"
              inputMode="decimal"
              data-testid="utility-amount-input"
            />
          </div>
          {overBalance && (
            <div className="text-[12px] text-danger bg-danger-soft rounded-control px-3 py-2 mt-1 mb-3 flex items-center gap-2">
              <i className="ti ti-alert-circle" aria-hidden="true"></i>
              Сумма больше остатка ({formatMoney(selectedAccount!.balance, "RUB")})
            </div>
          )}
          <div className="flex gap-1.5 mt-2 mb-4">
            {[500, 1000, 3000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount((parseFloat(amount || "0") + v).toString())}
                className="text-[11px] px-3 py-1 rounded-pill bg-brand-soft border border-brand/30 text-accent"
              >
                +{v}
              </button>
            ))}
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!acctValid || !source || numericAmount <= 0 || !!overBalance}
            className={`w-full py-2.5 rounded-control font-medium transition ${
              acctValid && source && numericAmount > 0 && !overBalance
                ? "btn-primary"
                : "bg-fill-control text-ink-muted cursor-not-allowed"
            }`}
          >
            Продолжить
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="card-nested mb-4">
            <SumRow label="Поставщик" value={provider ?? "—"} />
            <SumRow label="Категория" value={category?.label ?? "—"} />
            <SumRow label="Лицевой счёт" value={accountNumber} />
            {renderExtrasSummary(categoryKey!, extras)}
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
            <SumRow label="К оплате" value={formatMoney(numericAmount, "RUB")} bold />
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
          recipientLabel={`${provider} · ${category?.label ?? ""} · л/с ${accountNumber}`}
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

// ============ КАТЕГОРИЙНЫЕ ФОРМЫ ============

function UtilitiesFields({
  accountNumber,
  setAccountNumber,
  providerLength,
  extras,
  setExtras,
}: {
  accountNumber: string;
  setAccountNumber: (v: string) => void;
  providerLength?: number;
  extras: Extras;
  setExtras: (u: Extras) => void;
}) {
  return (
    <>
      <Label>
        Лицевой счёт{" "}
        <span className="text-ink-muted">— {providerLength ?? "…"} цифр</span>
      </Label>
      <input
        value={accountNumber}
        onChange={(e) =>
          setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, providerLength ?? 30))
        }
        placeholder={"0".repeat(providerLength ?? 10)}
        className="input font-mono tracking-wider mb-3"
        data-testid="ls-input"
      />

      <label className="flex items-center gap-2 text-[13px] mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={!!extras.passReadings}
          onChange={(e) => setExtras({ ...extras, passReadings: e.target.checked })}
        />
        <span>Передать показания счётчиков</span>
      </label>

      {extras.passReadings && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div>
            <Label>Хол. вода</Label>
            <input
              className="input font-mono"
              value={extras.readingCold ?? ""}
              onChange={(e) => setExtras({ ...extras, readingCold: e.target.value })}
              placeholder="0000"
              inputMode="numeric"
            />
          </div>
          <div>
            <Label>Гор. вода</Label>
            <input
              className="input font-mono"
              value={extras.readingHot ?? ""}
              onChange={(e) => setExtras({ ...extras, readingHot: e.target.value })}
              placeholder="0000"
              inputMode="numeric"
            />
          </div>
          <div>
            <Label>Свет</Label>
            <input
              className="input font-mono"
              value={extras.readingElectricity ?? ""}
              onChange={(e) => setExtras({ ...extras, readingElectricity: e.target.value })}
              placeholder="00000"
              inputMode="numeric"
            />
          </div>
        </div>
      )}
    </>
  );
}

function InternetFields({
  accountNumber,
  setAccountNumber,
  providerLength,
  extras,
  setExtras,
}: {
  accountNumber: string;
  setAccountNumber: (v: string) => void;
  providerLength?: number;
  extras: Extras;
  setExtras: (u: Extras) => void;
}) {
  return (
    <>
      <Label>Номер договора</Label>
      <input
        value={accountNumber}
        onChange={(e) =>
          setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, providerLength ?? 30))
        }
        placeholder={"0".repeat(providerLength ?? 12)}
        className="input font-mono tracking-wider mb-3"
        data-testid="ls-input"
      />

      <Label>Контактный телефон (необязательно)</Label>
      <input
        value={extras.contractNumber ?? ""}
        onChange={(e) => setExtras({ ...extras, contractNumber: e.target.value })}
        placeholder="+7 900 000 00 00"
        className="input mb-3"
      />

      <label className="flex items-center gap-2 text-[13px] mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={!!extras.enableAutoPay}
          onChange={(e) => setExtras({ ...extras, enableAutoPay: e.target.checked })}
        />
        <span>Подключить автоплатёж на этот тариф</span>
      </label>
    </>
  );
}

function EducationFields({
  accountNumber,
  setAccountNumber,
  providerLength,
  extras,
  setExtras,
}: {
  accountNumber: string;
  setAccountNumber: (v: string) => void;
  providerLength?: number;
  extras: Extras;
  setExtras: (u: Extras) => void;
}) {
  return (
    <>
      <Label>ФИО студента</Label>
      <input
        value={extras.fullName ?? ""}
        onChange={(e) => setExtras({ ...extras, fullName: e.target.value })}
        placeholder="Иван Иванович Иванов"
        className="input mb-3"
      />

      <Label>Номер договора / студенческого билета</Label>
      <input
        value={accountNumber}
        onChange={(e) =>
          setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, providerLength ?? 30))
        }
        placeholder={"0".repeat(providerLength ?? 16)}
        className="input font-mono tracking-wider mb-3"
        data-testid="ls-input"
      />

      <Label>Период оплаты</Label>
      <Select
        value={extras.paymentPeriod ?? null}
        onChange={(v) => setExtras({ ...extras, paymentPeriod: v as string })}
        options={[
          { value: "monthly", label: "Ежемесячно" },
          { value: "semester", label: "За семестр" },
          { value: "year", label: "За учебный год" },
        ]}
        placeholder="Выберите период"
      />
      <div className="mb-4" />
    </>
  );
}

function CharityFields({
  accountNumber,
  setAccountNumber,
  providerLength,
  extras,
  setExtras,
}: {
  accountNumber: string;
  setAccountNumber: (v: string) => void;
  providerLength?: number;
  extras: Extras;
  setExtras: (u: Extras) => void;
}) {
  return (
    <>
      <Label>Идентификатор проекта</Label>
      <input
        value={accountNumber}
        onChange={(e) =>
          setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, providerLength ?? 30))
        }
        placeholder={"0".repeat(providerLength ?? 10)}
        className="input font-mono tracking-wider mb-3"
        data-testid="ls-input"
      />

      <Label>На что направить (необязательно)</Label>
      <input
        value={extras.purpose ?? ""}
        onChange={(e) => setExtras({ ...extras, purpose: e.target.value })}
        placeholder="Лечение · продукты · приют"
        className="input mb-3"
        maxLength={70}
      />

      <label className="flex items-center gap-2 text-[13px] mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={!!extras.anonymous}
          onChange={(e) => setExtras({ ...extras, anonymous: e.target.checked })}
        />
        <span>Анонимный платёж (без ФИО)</span>
      </label>
    </>
  );
}

// ============ Утилиты ============

function buildExtrasSuffix(cat: CatKey, e: Extras): string {
  const parts: string[] = [];
  if (cat === "utilities" && e.passReadings) {
    parts.push(`cold:${e.readingCold ?? "-"}`);
    parts.push(`hot:${e.readingHot ?? "-"}`);
    parts.push(`elec:${e.readingElectricity ?? "-"}`);
  }
  if (cat === "internet" && e.enableAutoPay) parts.push("autopay");
  if (cat === "education") {
    if (e.fullName) parts.push(`fio:${e.fullName}`);
    if (e.paymentPeriod) parts.push(`period:${e.paymentPeriod}`);
  }
  if (cat === "charity") {
    if (e.anonymous) parts.push("anon");
    if (e.purpose) parts.push(`purpose:${e.purpose}`);
  }
  return parts.join("|");
}

function renderExtrasSummary(cat: CatKey, e: Extras): React.ReactNode {
  const out: React.ReactNode[] = [];
  if (cat === "utilities" && e.passReadings) {
    out.push(<SumRow key="cold" label="Хол. вода" value={e.readingCold ?? "—"} />);
    out.push(<SumRow key="hot" label="Гор. вода" value={e.readingHot ?? "—"} />);
    out.push(<SumRow key="elec" label="Электричество" value={e.readingElectricity ?? "—"} />);
  }
  if (cat === "internet" && e.enableAutoPay) {
    out.push(<SumRow key="ap" label="Автоплатёж" value="Подключить" />);
  }
  if (cat === "education") {
    if (e.fullName) out.push(<SumRow key="fio" label="Студент" value={e.fullName} />);
    if (e.paymentPeriod)
      out.push(<SumRow key="prd" label="Период" value={periodLabel(e.paymentPeriod)} />);
  }
  if (cat === "charity") {
    if (e.purpose) out.push(<SumRow key="pur" label="Направление" value={e.purpose} />);
    if (e.anonymous) out.push(<SumRow key="anon" label="Режим" value="Анонимно" />);
  }
  return out;
}

function periodLabel(v: string): string {
  return v === "monthly" ? "Ежемесячно" : v === "semester" ? "За семестр" : "За учебный год";
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-ink-secondary mb-1.5">{children}</div>;
}
function SumRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${bold ? "text-[14px] font-medium" : "text-[12px]"}`}>
      <span className={bold ? "" : "text-ink-muted"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
function mapError(detail: string | undefined): string | null {
  if (!detail) return null;
  const map: Record<string, string> = {
    payment_provider_not_supported: "Поставщик не поддерживается",
    payment_account_length_mismatch: "Неверная длина лицевого счёта",
    payment_amount_out_of_range: "Сумма вне допустимого диапазона",
    payment_requires_rub_account: "Оплата возможна только с RUB счёта",
    insufficient_funds: "Недостаточно средств",
    invalid_otp_code: "Неверный OTP-код",
  };
  return map[detail] ?? detail;
}
