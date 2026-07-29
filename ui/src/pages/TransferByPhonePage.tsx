import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useAccounts } from "@/features/accounts/api";
import { useCards } from "@/features/cards/api";
import { TransferShell } from "@/features/transfers/TransferShell";
import { SourceCardPicker } from "@/features/transfers/SourceCardPicker";
import { OtpConfirm } from "@/features/transfers/OtpConfirm";
import { TransferSuccess } from "@/features/transfers/TransferSuccess";
import { formatMoney } from "@/shared/lib/format";
import { CountryCodePicker, COUNTRIES, CountryOption } from "@/features/transfers/CountryCodePicker";
import { Dropdown } from "@/shared/ui/Dropdown";
import { apiErrorCode } from "@/shared/api/errors";
import { Label, SumRow } from "@/features/transfers/shared";

interface BankOption {
  id: string;
  label: string;
}

interface PhoneCheck {
  inOurBank: boolean;
  availableBanks: BankOption[];
  recipientHint?: string | null;
  primaryBankId?: string | null;
}

interface RecentContact {
  phone: string;
  display_name: string;
  transfers_count: number;
  last_transfer_at: string | null;
}

type Step = 0 | 1 | 2 | 3 | 4;

const OUR_BANK_CODE = "SHLAPABANK";
const EXTERNAL_FEE_RATE = 0.02;

export function TransferByPhonePage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(0);

  // Шаг 0: страна + телефон
  const [country, setCountry] = useState<CountryOption>(COUNTRIES[0]);
  const [rawPhone, setRawPhone] = useState(""); // цифры без кода страны

  // Шаг 1: выбор банка
  const [check, setCheck] = useState<PhoneCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [bankId, setBankId] = useState<string | null>(null);

  // Шаг 2: карта источника + сумма
  const [fromCardId, setFromCardId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // Шаг 3: OTP
  const [busy, setBusy] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [completedTxId, setCompletedTxId] = useState<number | null>(null);

  const { data: cards = [] } = useCards();
  const { data: accounts = [] } = useAccounts();
  const { data: recentContacts = [] } = useQuery({
    queryKey: ["recent-phones"],
    queryFn: async (): Promise<RecentContact[]> =>
      (await api.get("/transfers/recent-phones")).data,
  });

  const fullPhone = country.code + rawPhone;
  const isPhoneValid = rawPhone.length === country.length;
  const sbpSupported = country.sbpSupported ?? false;

  const selectedCard = cards.find((c) => c.id === fromCardId);
  const selectedAccount = accounts.find((a) => a.id === selectedCard?.account_id);
  const isExternal = bankId !== null && bankId !== OUR_BANK_CODE;
  const numericAmount = parseFloat(amount || "0");
  const fee = isExternal ? +(numericAmount * EXTERNAL_FEE_RATE).toFixed(2) : 0;
  const totalDebit = numericAmount + fee;

  // Автопроверка при валидном телефоне и переходе на шаг 1
  useEffect(() => {
    if (step !== 1 || !isPhoneValid) return;
    setChecking(true);
    api
      .get<PhoneCheck>("/transfers/by-phone/check", { params: { phone: fullPhone } })
      .then((r) => {
        setCheck(r.data);
        // По-умолчанию выбираем primaryBank, если он в списке доступных
        const primary = r.data.primaryBankId;
        const preferred =
          primary && r.data.availableBanks.find((b) => b.id === primary)
            ? primary
            : r.data.availableBanks[0]?.id ?? null;
        setBankId(preferred);
      })
      .catch(() => setCheck(null))
      .finally(() => setChecking(false));
  }, [step, isPhoneValid, fullPhone]);

  const rubCards = useMemo(() => {
    return cards.filter((c) => {
      const a = accounts.find((x) => x.id === c.account_id);
      return a && a.currency === "RUB" && c.status === "ACTIVE";
    });
  }, [cards, accounts]);

  function canProceedStep2(): boolean {
    if (!selectedCard || !selectedAccount) return false;
    if (numericAmount <= 0) return false;
    if (totalDebit > parseFloat(selectedAccount.balance)) return false;
    return true;
  }

  async function submitTransfer(otp: string) {
    setBusy(true);
    setOtpError(null);
    try {
      const { data } = await api.post<{ id: number }>("/transfers/by-phone", {
        from_card_id: fromCardId,
        phone: fullPhone,
        amount,
        recipient_bank_id: bankId,
        otp_code: otp,
        comment: comment.trim() || undefined,
      });
      setCompletedTxId(data.id);
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["recent-phones"] });
      setStep(4);
    } catch (e: any) {
      setOtpError(mapError(apiErrorCode(e) ?? undefined) ?? "Не удалось отправить перевод");
    } finally {
      setBusy(false);
    }
  }

  function resetAll() {
    setStep(0);
    setRawPhone("");
    setCheck(null);
    setBankId(null);
    setFromCardId(null);
    setAmount("");
    setComment("");
    setOtpError(null);
  }

  const recipientLabel = check?.recipientHint ?? formatPhone(fullPhone);

  return (
    <TransferShell
      title="Перевод по номеру телефона"
      step={step}
      total={4}
      onBack={() => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))}
      canGoBack={step > 0 && step < 4}
    >
      {step === 0 && (
        <div>
          <Label>Номер телефона получателя</Label>
          <div className="flex gap-2 mb-1">
            <CountryCodePicker
              value={country}
              onChange={(c) => {
                setCountry(c);
                setRawPhone("");
              }}
            />
            <input
              value={formatMask(rawPhone, country.length)}
              onChange={(e) =>
                setRawPhone(e.target.value.replace(/\D/g, "").slice(0, country.length))
              }
              placeholder={placeholderFor(country.length)}
              inputMode="numeric"
              className="input flex-1 font-mono tracking-wide h-[42px]"
              data-testid="phone-input"
            />
          </div>
          <div className="text-[11px] text-ink-muted mb-1">
            Введите {country.length} цифр
          </div>
          {!sbpSupported && rawPhone.length > 0 && (
            <div className="mb-3 rounded-control bg-warning-soft border border-warning/30 px-3 py-2 text-[11px] text-warning">
              <i className="ti ti-alert-triangle mr-1" aria-hidden="true"></i>
              СБП работает только в РФ (+7). Для других стран — сначала «Между своими» или международный перевод.
            </div>
          )}
          {sbpSupported && <div className="mb-3" />}

          {recentContacts.length > 0 && (
            <>
              <Label>Недавние</Label>
              <div className="flex flex-col gap-1.5 mb-4" data-testid="recent-contacts">
                {recentContacts.map((c) => (
                  <button
                    key={c.phone}
                    onClick={() => {
                      const clean = c.phone.replace(/\D/g, "").replace(/^7/, "");
                      setRawPhone(clean.slice(0, 10));
                    }}
                    className="card-nested flex items-center gap-3 text-left hover:bg-surface-3 transition"
                    data-testid={`recent-${c.phone}`}
                  >
                    <div className="w-9 h-9 rounded-full bg-brand-soft text-accent flex items-center justify-center text-[12px] font-medium">
                      {initials(c.display_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{c.display_name}</div>
                      <div className="text-[10px] text-ink-muted">
                        {formatPhone(c.phone)} · {c.transfers_count}{" "}
                        {plural(c.transfers_count, "перевод", "перевода", "переводов")}
                      </div>
                    </div>
                    <i className="ti ti-chevron-right text-ink-muted" aria-hidden="true"></i>
                  </button>
                ))}
              </div>
            </>
          )}

          <button
            onClick={() => setStep(1)}
            disabled={!isPhoneValid || !sbpSupported}
            className={`w-full py-2.5 rounded-control font-medium transition ${
              isPhoneValid && sbpSupported
                ? "btn-primary"
                : "bg-fill-control text-ink-muted cursor-not-allowed"
            }`}
            data-testid="phone-next-btn"
          >
            Далее
          </button>
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="text-[13px] text-ink-secondary mb-3">
            {formatPhone(fullPhone)}
            {check?.recipientHint && ` · ${check.recipientHint}`}
          </div>

          {checking && (
            <div className="text-[13px] text-ink-muted py-4 text-center">Проверяем номер…</div>
          )}

          {!checking && check && check.availableBanks.length === 0 && (
            <div className="rounded-control bg-danger-soft border border-danger/30 px-3 py-2.5 mb-3">
              <div className="text-[13px] text-danger font-medium">
                Номер не зарегистрирован в СБП
              </div>
              <div className="text-[11px] text-ink-secondary mt-0.5">
                Получатель не подключен ни к одному банку.
              </div>
            </div>
          )}

          {!checking && check && check.availableBanks.length > 0 && (
            <>
              <Label>Банк получателя</Label>
              <div className="mb-3">
                <Dropdown
                  align="stretch"
                  testId="bank-dropdown"
                  trigger={<BankTrigger banks={check.availableBanks} activeId={bankId} primaryId={check.primaryBankId} />}
                >
                  {(close) => (
                    <>
                      {check.availableBanks.map((b) => {
                        const isOurs = b.id === OUR_BANK_CODE;
                        const isPrimary = check.primaryBankId === b.id;
                        const selected = bankId === b.id;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setBankId(b.id);
                              close();
                            }}
                            data-testid={`bank-${b.id}`}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition text-left ${
                              selected ? "bg-brand-soft text-accent" : "text-ink-primary hover:bg-fill-hover"
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-md flex items-center justify-center font-medium text-[12px] shrink-0 ${
                                isOurs ? "bg-brand text-[#0B1223]" : "bg-fill-control text-ink-primary"
                              }`}
                            >
                              {b.label.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium flex items-center gap-1.5">
                                {b.label}
                                {isPrimary && (
                                  <span className="badge bg-brand-soft text-accent text-[10px] px-1.5 py-0.5">
                                    основной
                                  </span>
                                )}
                              </div>
                              <div className={`text-[10px] ${isOurs ? "text-success" : "text-warning"}`}>
                                {isOurs ? "Без комиссии · мгновенно" : "Комиссия 2% · до 15 мин"}
                              </div>
                            </div>
                            {selected && <i className="ti ti-check text-accent" aria-hidden="true"></i>}
                          </button>
                        );
                      })}
                    </>
                  )}
                </Dropdown>
              </div>

              {check.inOurBank && check.primaryBankId !== OUR_BANK_CODE && (
                <div className="text-[11px] text-warning bg-warning-soft rounded-control px-3 py-2 mb-3">
                  <i className="ti ti-info-circle mr-1" aria-hidden="true"></i>
                  У получателя основной банк не ShlapaBank — перевод дойдёт, но обычно получатель
                  получает деньги в другой банк.
                </div>
              )}

              {!check.inOurBank && (
                <div className="text-[11px] text-ink-secondary bg-fill-control rounded-control px-3 py-2 mb-3">
                  <i className="ti ti-info-circle mr-1" aria-hidden="true"></i>
                  Не нашли этот номер среди клиентов ShlapaBank — либо он в другом банке, либо
                  клиент ShlapaBank просто не указал телефон в профиле. Если получатель точно
                  клиент ShlapaBank, надёжнее перевести по номеру карты или счёта.
                </div>
              )}
            </>
          )}

          <button
            onClick={() => setStep(2)}
            disabled={!bankId}
            className="btn-primary w-full py-2.5"
            data-testid="bank-next-btn"
          >
            Далее
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="mb-4 card-nested flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-soft text-accent flex items-center justify-center text-[12px] font-medium">
              {check?.recipientHint ? initials(check.recipientHint) : "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium">
                {check?.recipientHint ?? "Получатель"}
              </div>
              <div className="text-[10px] text-ink-muted">
                {formatPhone(fullPhone)} ·{" "}
                {check?.availableBanks.find((b) => b.id === bankId)?.label ?? bankId}
              </div>
            </div>
            <button
              onClick={() => setStep(0)}
              className="text-[11px] text-ink-muted hover:text-accent transition"
            >
              Изменить
            </button>
          </div>

          <Label>С какой карты · только RUB</Label>
          <div className="mb-4">
            <SourceCardPicker
              cards={rubCards}
              accounts={accounts}
              selectedId={fromCardId}
              onSelect={setFromCardId}
              currencyFilter="RUB"
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
              data-testid="amount-input"
            />
          </div>
          <div className="flex gap-1.5 mb-3">
            {[500, 1000, 5000].map((v) => (
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

          <Label>
            Сообщение <span className="text-ink-muted">— необязательно</span>
          </Label>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={70}
            placeholder="За обед"
            className="input mb-4"
            data-testid="comment-input"
          />

          {isExternal && numericAmount > 0 && (
            <div className="card-nested mb-3">
              <div className="flex justify-between text-[12px]"><span className="text-ink-muted">Сумма</span><span>{formatMoney(numericAmount, "RUB")}</span></div>
              <div className="flex justify-between text-[12px] mt-1"><span className="text-warning">Комиссия 2%</span><span className="text-warning">+ {formatMoney(fee, "RUB")}</span></div>
              <div className="h-px bg-line my-2"></div>
              <div className="flex justify-between text-[13px] font-medium"><span>Спишется</span><span>{formatMoney(totalDebit, "RUB")}</span></div>
            </div>
          )}

          {step2Error && (
            <div className="text-[13px] text-danger bg-danger-soft rounded-control px-3 py-2 mb-3">
              {step2Error}
            </div>
          )}
          {selectedAccount && totalDebit > parseFloat(selectedAccount.balance) && numericAmount > 0 && (
            <div className="text-[12px] text-danger bg-danger-soft rounded-control px-3 py-2 mb-3 flex items-center gap-2">
              <i className="ti ti-alert-circle" aria-hidden="true"></i>
              Сумма больше доступного остатка ({formatMoney(selectedAccount.balance, "RUB")})
            </div>
          )}
          {selectedAccount && numericAmount > 0 && totalDebit <= parseFloat(selectedAccount.balance) && (
            <div className="text-[11px] text-ink-muted mb-3">
              После перевода останется: {formatMoney(parseFloat(selectedAccount.balance) - totalDebit, "RUB")}
            </div>
          )}

          <button
            onClick={() => {
              if (!canProceedStep2()) {
                setStep2Error("Выберите карту и введите сумму");
                return;
              }
              setStep2Error(null);
              setStep(3);
            }}
            disabled={!canProceedStep2()}
            className="btn-primary w-full py-2.5"
            data-testid="step2-next-btn"
          >
            Продолжить
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <div className="card-nested mb-4">
            <SumRow label="Получатель" value={recipientLabel} />
            <SumRow label="Телефон" value={formatPhone(fullPhone)} />
            <SumRow label="Банк" value={check?.availableBanks.find((b) => b.id === bankId)?.label ?? "—"} />
            <SumRow label="С карты" value={selectedCard ? `•• ${selectedCard.last4}` : "—"} />
            <SumRow label="Сумма" value={formatMoney(numericAmount, "RUB")} />
            <SumRow label="Комиссия" value={formatMoney(fee, "RUB")} />
            <div className="h-px bg-line my-2"></div>
            <SumRow label="Итого спишется" value={formatMoney(totalDebit, "RUB")} bold />
          </div>
          <OtpConfirm
            onSubmit={submitTransfer}
            submitLabel={`Перевести ${formatMoney(numericAmount, "RUB")}`}
            busy={busy}
            error={otpError}
          />
        </div>
      )}

      {step === 4 && (
        <TransferSuccess
          amount={numericAmount}
          currency="RUB"
          recipientLabel={
            check?.recipientHint
              ? `${check.recipientHint} · ${formatPhone(fullPhone)}`
              : formatPhone(fullPhone)
          }
          fromLabel={
            selectedCard && selectedAccount
              ? `Карта •• ${selectedCard.last4} · «${selectedAccount.name}»`
              : undefined
          }
          comment={comment || undefined}
          transactionId={completedTxId}
          onNew={resetAll}
        />
      )}
    </TransferShell>
  );
}

function BankTrigger({
  banks,
  activeId,
  primaryId,
}: {
  banks: BankOption[];
  activeId: string | null;
  primaryId?: string | null;
}) {
  const active = banks.find((b) => b.id === activeId);
  const isOurs = active?.id === OUR_BANK_CODE;
  return (
    <div className="card-nested flex items-center gap-3 hover:bg-surface-3 transition cursor-pointer">
      <div
        className={`w-9 h-9 rounded-md flex items-center justify-center font-medium text-[13px] shrink-0 ${
          isOurs ? "bg-brand text-[#0B1223]" : "bg-fill-control text-ink-primary"
        }`}
      >
        {active?.label.slice(0, 1).toUpperCase() ?? "?"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium flex items-center gap-1.5">
          {active?.label ?? "Выберите банк"}
          {active && primaryId === active.id && (
            <span className="badge bg-brand-soft text-accent text-[10px] px-1.5 py-0.5">
              основной
            </span>
          )}
        </div>
        <div className={`text-[10px] ${isOurs ? "text-success" : "text-warning"}`}>
          {isOurs
            ? "Без комиссии · мгновенно"
            : active
            ? "Комиссия 2% · до 15 мин"
            : "—"}
        </div>
      </div>
      <i className="ti ti-chevron-down text-ink-muted" aria-hidden="true"></i>
    </div>
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
  // Универсальная разбивка по 3
  return (d.match(/.{1,3}/g) || []).join(" ");
}

function placeholderFor(length: number): string {
  return formatMask("0".repeat(length), length);
}
function formatPhone(p: string): string {
  const d = p.replace(/\D/g, "").slice(-10);
  if (d.length < 10) return p;
  return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "??";
}
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
function mapError(detail: string | undefined): string | null {
  if (!detail) return null;
  const map: Record<string, string> = {
    invalid_otp_code: "Неверный OTP-код",
    account_not_found: "Счёт не найден",
    account_inactive: "Счёт неактивен",
    card_not_found: "Карта не найдена",
    card_not_active: "Карта не активна",
    recipient_not_found_in_our_bank: "Получатель не найден в нашем банке",
    recipient_has_no_suitable_account: "У получателя нет подходящего счёта",
    insufficient_funds: "Недостаточно средств",
    transfer_amount_too_small: "Сумма меньше минимальной",
    transfer_amount_exceeds_single_limit: "Сумма превышает разовый лимит",
    transfer_amount_exceeds_daily_limit: "Превышен суточный лимит",
    transfer_not_allowed_from_savings: "Со сберегательного счёта переводы запрещены",
    source_required: "Не выбран источник",
  };
  return map[detail] ?? detail;
}
