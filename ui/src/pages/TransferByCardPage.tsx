import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Account, Card } from "@/shared/api/types";
import { useAccounts } from "@/features/accounts/api";
import { useCards } from "@/features/cards/api";
import { TransferShell } from "@/features/transfers/TransferShell";
import { SourceCardPicker } from "@/features/transfers/SourceCardPicker";
import { OtpConfirm } from "@/features/transfers/OtpConfirm";
import { TransferSuccess } from "@/features/transfers/TransferSuccess";
import { formatCardInput, luhnValid, detectPaymentSystem } from "@/features/transfers/cardUtils";
import { Label, SumRow } from "@/features/transfers/shared";
import { formatMoney, currencySymbol } from "@/shared/lib/format";
import { apiErrorCode } from "@/shared/api/errors";

interface CardCheck {
  found: boolean;
  in_our_bank: boolean;
  masked: string;
  holder_hint?: string | null;
  currency?: string | null;
  is_own?: boolean;
  is_blocked?: boolean;
}

type Step = 0 | 1 | 2 | 3;

const EXTERNAL_FEE_RATE = 0.015;

export function TransferByCardPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(0);

  // 1: карта получателя
  const [rawCard, setRawCard] = useState("");
  const [check, setCheck] = useState<CardCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // 2: карта источника + сумма
  const [fromCardId, setFromCardId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // 3: OTP
  const [otpError, setOtpError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [completedTxId, setCompletedTxId] = useState<number | null>(null);

  const { data: cards = [] } = useCards();
  const { data: accounts = [] } = useAccounts();

  const digits = rawCard.replace(/\D/g, "").slice(0, 16);
  const isFilled = digits.length === 16;
  const luhnOk = isFilled ? luhnValid(digits) : false;
  const paySystem = useMemo(() => detectPaymentSystem(digits), [digits]);

  async function runCheck(clean: string) {
    setChecking(true);
    setCheckError(null);
    try {
      const { data } = await api.get<CardCheck>("/transfers/by-card/check", {
        params: { number: clean },
      });
      setCheck(data);
    } catch (e: any) {
      setCheck(null);
      setCheckError(mapError(apiErrorCode(e) ?? undefined) ?? "Не удалось проверить карту");
    } finally {
      setChecking(false);
    }
  }

  // Автопроверка при вводе валидной длины (16–19 цифр) с дебаунсом 400 мс.
  useEffect(() => {
    if (!isFilled) {
      setCheck(null);
      setCheckError(null);
      setChecking(false);
      return;
    }
    const t = setTimeout(() => {
      runCheck(digits);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits, isFilled]);

  const selectedCard: Card | undefined = cards.find((c) => c.id === fromCardId);
  const selectedAccount: Account | undefined = accounts.find(
    (a) => a.id === selectedCard?.account_id
  );
  const isExternal = check ? !check.in_our_bank : false;

  const numericAmount = parseFloat(amount || "0");
  const fee = isExternal ? +(numericAmount * EXTERNAL_FEE_RATE).toFixed(2) : 0;
  const totalDebit = numericAmount + fee;

  function canProceedStep2(): boolean {
    if (!selectedCard || !selectedAccount) return false;
    if (numericAmount <= 0) return false;
    if (totalDebit > parseFloat(selectedAccount.balance)) return false;
    if (check?.in_our_bank && check.currency && selectedAccount.currency !== check.currency)
      return false;
    return true;
  }

  async function submitTransfer(otp: string) {
    setBusy(true);
    setOtpError(null);
    try {
      const { data } = await api.post<{ id: number }>("/transfers/by-card", {
        from_card_id: fromCardId,
        to_card_number: digits,
        amount: amount,
        otp_code: otp,
        comment: comment.trim() || undefined,
      });
      setCompletedTxId(data.id);
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["cards"] });
      setStep(3);
    } catch (e: any) {
      setOtpError(mapError(apiErrorCode(e) ?? undefined) ?? "Не удалось отправить перевод");
    } finally {
      setBusy(false);
    }
  }

  function resetAll() {
    setStep(0);
    setRawCard("");
    setCheck(null);
    setCheckError(null);
    setFromCardId(null);
    setAmount("");
    setComment("");
    setOtpError(null);
  }

  function stepBack() {
    setStep((s) => (s > 0 ? ((s - 1) as Step) : s));
  }

  const recipientLabel = check?.holder_hint
    ? check.holder_hint
    : check?.in_our_bank
    ? "получателю"
    : `на •• ${digits.slice(-4)}`;

  return (
    <TransferShell
      title="Перевод по карте"
      step={step}
      total={4}
      onBack={stepBack}
      canGoBack={step > 0 && step < 3}
    >
      {step === 0 && (
        <div>
          <Label>Номер карты получателя</Label>
          <input
            value={formatCardInput(rawCard)}
            onChange={(e) => setRawCard(e.target.value)}
            placeholder="0000 0000 0000 0000"
            inputMode="numeric"
            autoComplete="cc-number"
            className="input font-mono text-[15px] tracking-widest h-12"
            data-testid="card-number-input"
          />

          {/* Всегда видимый статус-блок под инпутом */}
          <div className="mt-3" data-testid="card-status">
            {digits.length === 0 && (
              <div className="text-[11px] text-ink-muted">Введите 16–19 цифр карты</div>
            )}
            {digits.length > 0 && digits.length < 16 && (
              <div className="text-[11px] text-ink-muted">
                Введено {digits.length} из 16 цифр
              </div>
            )}
            {isFilled && checking && (
              <div className="text-[12px] text-ink-secondary flex items-center gap-2">
                <i className="ti ti-loader-2 animate-spin" aria-hidden="true"></i>
                Проверяем карту…
              </div>
            )}
            {isFilled && !checking && checkError && (
              <div className="rounded-control bg-danger-soft border border-danger/30 px-3 py-2.5 text-[13px] text-danger">
                {checkError}
              </div>
            )}
            {isFilled && !checking && !checkError && check?.is_own && (
              <div className="rounded-control bg-warning-soft border border-warning/30 px-3 py-2.5">
                <div className="text-[13px] font-medium text-warning">Это ваша карта</div>
                <div className="text-[11px] text-ink-secondary mt-0.5">
                  Для перевода между своими счетами используйте «Между своими».
                </div>
              </div>
            )}
            {isFilled && !checking && !checkError && check?.is_blocked && (
              <div className="rounded-control bg-danger-soft border border-danger/30 px-3 py-2.5">
                <div className="text-[13px] font-medium text-danger">
                  Карта получателя недоступна
                </div>
                <div className="text-[11px] text-ink-secondary mt-0.5">
                  Заблокирована или истёк срок действия.
                </div>
              </div>
            )}
            {isFilled && !checking && !checkError && check && !check.is_own && !check.is_blocked && (
              <div
                className={`rounded-control px-3 py-2.5 border ${
                  check.in_our_bank
                    ? "bg-success-soft border-success/30"
                    : "bg-warning-soft border-warning/30"
                }`}
                data-testid="card-recipient-info"
              >
                <div className="text-[13px] font-medium flex items-center gap-2">
                  {check.in_our_bank ? (
                    <>
                      <i className="ti ti-check text-success" aria-hidden="true"></i>
                      В ShlapaBank · {check.masked}
                    </>
                  ) : (
                    <>
                      <i className="ti ti-alert-triangle text-warning" aria-hidden="true"></i>
                      Внешний банк · {check.masked}
                    </>
                  )}
                </div>
                <div className="text-[11px] text-ink-secondary mt-0.5">
                  {check.in_our_bank
                    ? `Получатель: ${check.holder_hint ?? "—"} · ${check.currency ?? ""} · без комиссии`
                    : `Комиссия 1.5% · до 3 рабочих дней`}
                </div>
              </div>
            )}
          </div>

          {(() => {
            const canProceed = !!check?.found && !check.is_blocked && !check.is_own;
            return (
              <button
                onClick={() => canProceed && setStep(1)}
                disabled={!canProceed}
                className={`w-full mt-5 py-2.5 rounded-control font-medium transition ${
                  canProceed
                    ? "btn-primary"
                    : "bg-fill-control text-ink-muted cursor-not-allowed"
                }`}
                data-testid="card-next-btn"
              >
                Далее
              </button>
            );
          })()}
        </div>
      )}

      {step === 1 && (
        <div>
          <Recipient check={check} rawDigits={digits} />

          <Label>С какой карты</Label>
          <div className="mb-4">
            <SourceCardPicker
              cards={cards}
              accounts={accounts}
              selectedId={fromCardId}
              onSelect={setFromCardId}
              currencyFilter={check?.currency ?? undefined}
            />
          </div>

          <Label>Сумма</Label>
          <div className="card-nested flex items-baseline gap-2 mb-2">
            <span className="text-[22px] text-ink-muted">
              {selectedAccount ? currencySymbol(selectedAccount.currency) : "—"}
            </span>
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
            {[1000, 5000, 10000].map((v) => (
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
            {selectedAccount && (
              <button
                onClick={() => setAmount(selectedAccount.balance)}
                className="text-[11px] px-3 py-1 rounded-pill bg-brand-soft border border-brand/30 text-accent"
              >
                Всё
              </button>
            )}
          </div>

          <Label>
            Сообщение получателю <span className="text-ink-muted">— необязательно</span>
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
              <div className="flex justify-between text-[12px]"><span className="text-ink-muted">Сумма</span><span>{formatMoney(numericAmount, selectedAccount?.currency ?? "RUB")}</span></div>
              <div className="flex justify-between text-[12px] mt-1"><span className="text-warning">Комиссия 1.5%</span><span className="text-warning">+ {formatMoney(fee, selectedAccount?.currency ?? "RUB")}</span></div>
              <div className="h-px bg-line my-2"></div>
              <div className="flex justify-between text-[13px] font-medium"><span>Спишется</span><span>{formatMoney(totalDebit, selectedAccount?.currency ?? "RUB")}</span></div>
            </div>
          )}

          {!isExternal && check?.in_our_bank && (
            <div className="text-[12px] text-success mb-3 rounded-control bg-success-soft px-3 py-2">
              <i className="ti ti-check mr-1" aria-hidden="true"></i>
              Без комиссии — перевод внутри ShlapaBank
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
              Сумма больше доступного остатка ({formatMoney(selectedAccount.balance, selectedAccount.currency)})
            </div>
          )}
          {selectedAccount && numericAmount > 0 && totalDebit <= parseFloat(selectedAccount.balance) && (
            <div className="text-[11px] text-ink-muted mb-3">
              После перевода останется:{" "}
              {formatMoney(parseFloat(selectedAccount.balance) - totalDebit, selectedAccount.currency)}
            </div>
          )}

          <button
            onClick={() => {
              if (!canProceedStep2()) {
                setStep2Error("Заполните карту, сумму и убедитесь, что средств достаточно");
                return;
              }
              setStep2Error(null);
              setStep(2);
            }}
            disabled={!canProceedStep2()}
            className="btn-primary w-full py-2.5"
            data-testid="step2-next-btn"
          >
            Продолжить
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="card-nested mb-4">
            <SumRow label="С карты" value={selectedCard ? `•• ${selectedCard.last4}` : "—"} />
            <SumRow label="На карту" value={check?.masked ?? "—"} />
            <SumRow label="Сумма" value={formatMoney(numericAmount, selectedAccount?.currency ?? "RUB")} />
            <SumRow label="Комиссия" value={formatMoney(fee, selectedAccount?.currency ?? "RUB")} />
            <div className="h-px bg-line my-2"></div>
            <SumRow label="Итого спишется" value={formatMoney(totalDebit, selectedAccount?.currency ?? "RUB")} bold />
          </div>

          <OtpConfirm
            onSubmit={submitTransfer}
            submitLabel={`Перевести ${formatMoney(numericAmount, selectedAccount?.currency ?? "RUB")}`}
            busy={busy}
            error={otpError}
          />
        </div>
      )}

      {step === 3 && (
        <TransferSuccess
          amount={numericAmount}
          currency={selectedAccount?.currency ?? "RUB"}
          recipientLabel={
            check?.holder_hint
              ? `${check.holder_hint} · •• ${digits.slice(-4)}`
              : `Карта •• ${digits.slice(-4)}`
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

function Recipient({ check, rawDigits }: { check: CardCheck | null; rawDigits: string }) {
  if (!check) return null;
  const grouped = rawDigits.match(/.{1,4}/g)?.join(" ") ?? rawDigits;
  return (
    <div className="mb-4 card-nested flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-brand-soft text-accent flex items-center justify-center shrink-0">
        <i className="ti ti-credit-card text-lg" aria-hidden="true"></i>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium">
          {check.in_our_bank ? check.holder_hint ?? "Получатель" : "Получатель"}
        </div>
        <div className="text-[11px] font-mono tracking-wider">{grouped}</div>
        <div className="text-[10px] text-ink-muted">
          {check.in_our_bank ? "ShlapaBank" : "Внешний банк"}
        </div>
      </div>
    </div>
  );
}

function mapError(detail: string | undefined): string | null {
  if (!detail) return null;
  const map: Record<string, string> = {
    invalid_card_number: "Неверный номер карты",
    invalid_card_length: "Номер должен быть 16–19 цифр",
    card_not_found: "Карта не найдена",
    card_not_active: "Карта не активна",
    account_not_found: "Счёт не найден",
    account_inactive: "Счёт неактивен",
    recipient_account_inactive: "Счёт получателя закрыт",
    recipient_card_not_active: "Карта получателя заблокирована",
    transfer_same_account: "Нельзя перевести на этот же счёт",
    currency_mismatch: "Валюты счёта и карты не совпадают",
    insufficient_funds: "Недостаточно средств",
    invalid_otp_code: "Неверный OTP-код",
    transfer_amount_too_small: "Сумма меньше минимальной",
    transfer_amount_exceeds_single_limit: "Сумма превышает разовый лимит",
    transfer_amount_exceeds_daily_limit: "Превышен суточный лимит",
  };
  return map[detail] ?? detail;
}
