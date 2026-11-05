import { useState, type ReactNode } from "react";
import { useTariffs } from "../../api/hooks";
import { LoadError } from "../../ui/blocks";
import { AccountSelect } from "../../ui/account";
import { Field, MaskedInput } from "../../ui/fields";
import { centsToApi, formatMoney, maskCard, maskExpiry } from "../../ui/format";
import {
  CARD_LENGTH,
  amountProblem,
  cardProblem,
  expiryProblem,
  findTariff,
  formatAmountInput,
  onlyDigits,
  parseAmount,
  paymentSystem,
  rangeOf,
  rangeText,
} from "../../ui/validate";
import {
  AmountField,
  amountFieldError,
  FormLayout,
  FormSkeleton,
  SubmitBlock,
  onFormSubmit,
  useAccountChoice,
  useOperationSubmit,
} from "./common";

const P = "topup";
const CHIPS = [1000, 5000, 10000];

const darkInput =
  "w-full rounded-small bg-white/10 px-3.5 font-semibold text-white outline-none placeholder:font-normal placeholder:text-white/40 focus:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.6)]";

/** Поле на тёмной карточке: подпись, поле, ошибка. */
function DarkField({ id, label, error, testId, children }: { id: string; label: string; error: string | null; testId: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-ink-soft">
        {label}
      </label>
      {children}
      {error && (
        <span role="alert" data-testid={`${testId}-error`} className="text-xs font-medium text-[#ffb4ab]">
          {error}
        </span>
      )}
    </div>
  );
}

export function TopUpPage() {
  const tariffs = useTariffs();
  const acc = useAccountChoice();
  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [amount, setAmount] = useState("");
  const op = useOperationSubmit("topup", ["card_number", "expiry", "cvc", "amount", "to_account_id"]);

  const digits = onlyDigits(card);
  const cardErr = cardProblem(digits);
  const expErr = expiryProblem(expiry);
  const tariff = findTariff(tariffs.data, "TOPUP");
  const range = rangeOf(tariff);
  const cents = parseAmount(amount);
  const system = digits.length >= 1 ? paymentSystem(digits) : null;

  // Локальные ошибки — только когда поле заполнено целиком
  const cardError = op.fieldError("card_number") ?? (digits.length === CARD_LENGTH ? cardErr : null);
  const expiryError = op.fieldError("expiry") ?? (expiry.length === 5 ? expErr : null);
  const cvcError = op.fieldError("cvc");

  const problem =
    digits.length < CARD_LENGTH
      ? "Введите номер карты полностью"
      : cardErr ??
        expErr ??
        (cvc.length !== 3 ? "Введите CVC — 3 цифры с обратной стороны карты" : null) ??
        (!acc.account ? "Выберите счёт зачисления" : null) ??
        amountProblem(cents, range);

  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    op.clearError();
  };

  function submit() {
    if (problem || !acc.account || cents == null) return;
    op.submit({
      to_account_id: acc.account.id,
      card_number: digits,
      expiry,
      cvc,
      amount: centsToApi(cents),
    });
  }

  const freeText =
    tariff && Number(tariff.fee_percent) === 0 ? "Без комиссии, деньги приходят сразу" : "Деньги приходят сразу";

  return (
    <FormLayout testId={P} title="Пополнить с карты другого банка" subtitle={freeText}>
      {acc.accounts.isPending ? (
        <FormSkeleton />
      ) : acc.accounts.isError ? (
        <LoadError className="!px-0" testId={`${P}-load-error`} message={acc.accounts.error.message} onRetry={() => acc.accounts.refetch()} />
      ) : (
        <form className="flex flex-col gap-[22px]" onSubmit={onFormSubmit(submit)} noValidate>
          <div className="flex flex-col gap-3.5 rounded-card bg-navy p-4 text-white sm:p-5" data-testid={`${P}-card-form`}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-ink-soft">Карта другого банка</span>
              {system && (
                <span className="rounded-full bg-white/[0.12] px-2.5 py-[3px] text-xs font-semibold" data-testid={`${P}-payment-system`}>
                  {system}
                </span>
              )}
            </div>
            <DarkField id={`${P}-card`} label="Номер карты" error={cardError} testId={`${P}-card`}>
              <MaskedInput
                id={`${P}-card`}
                data-testid={`${P}-card`}
                value={card}
                onValueChange={edit(setCard)}
                format={(raw) => maskCard(raw)}
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="0000 0000 0000 0000"
                maxLength={19}
                invalid={!!cardError}
                className={`h-12 text-lg tracking-[1.5px] ${darkInput} ${cardError ? "shadow-[inset_0_0_0_2px_#f04438]" : ""}`}
              />
            </DarkField>
            <div className="flex gap-3">
              <div className="flex-1">
                <DarkField id={`${P}-expiry`} label="Срок" error={expiryError} testId={`${P}-expiry`}>
                  <MaskedInput
                    id={`${P}-expiry`}
                    data-testid={`${P}-expiry`}
                    value={expiry}
                    onValueChange={edit(setExpiry)}
                    format={(raw) => maskExpiry(raw)}
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="ММ/ГГ"
                    maxLength={5}
                    invalid={!!expiryError}
                    className={`h-11 text-base ${darkInput} ${expiryError ? "shadow-[inset_0_0_0_2px_#f04438]" : ""}`}
                  />
                </DarkField>
              </div>
              <div className="flex-1">
                <DarkField id={`${P}-cvc`} label="CVC" error={cvcError} testId={`${P}-cvc`}>
                  <MaskedInput
                    id={`${P}-cvc`}
                    data-testid={`${P}-cvc`}
                    type="password"
                    value={cvc}
                    onValueChange={edit(setCvc)}
                    format={(raw) => onlyDigits(raw).slice(0, 3)}
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="•••"
                    maxLength={3}
                    invalid={!!cvcError}
                    className={`h-11 text-base ${darkInput} ${cvcError ? "shadow-[inset_0_0_0_2px_#f04438]" : ""}`}
                  />
                </DarkField>
              </div>
            </div>
          </div>

          <Field id={`${P}-to`} label="Куда зачислить" testId={`${P}-to`} error={op.fieldError("to_account_id")}>
            <AccountSelect
              id={`${P}-to`}
              testId={`${P}-to`}
              accounts={acc.list}
              value={acc.id}
              onChange={(id) => {
                acc.setId(id);
                op.clearError();
              }}
            />
          </Field>

          <AmountField prefix={P} value={amount} onChange={edit(setAmount)} range={range} apiError={op.fieldError("amount")}>
            <div className="flex flex-wrap items-center gap-2">
              {CHIPS.map((n) => {
                const active = cents === n * 100;
                return (
                  <button
                    key={n}
                    type="button"
                    data-testid={`${P}-chip-${n}`}
                    aria-pressed={active}
                    onClick={() => edit(setAmount)(formatAmountInput(String(n)))}
                    className={`rounded-full px-3 py-1.5 text-sm ${
                      active ? "bg-primary-soft font-semibold text-primary-hover" : "bg-page font-medium text-ink hover:bg-line"
                    }`}
                  >
                    {formatMoney(n, { compact: true, noCurrency: true })}
                  </button>
                );
              })}
              {range && (
                <span className="ml-auto text-[13px] text-ink-faint" data-testid={`${P}-amount-hint`}>
                  {rangeText(range)}
                </span>
              )}
            </div>
          </AmountField>

          <SubmitBlock
            prefix={P}
            label={problem || cents == null ? "Пополнить" : `Пополнить на ${formatMoney(cents / 100)}`}
            problem={problem}
            pending={op.pending}
            error={op.generalError}
            fieldErrors={[cardError, expiryError, cvcError, amountFieldError(amount, range, op.fieldError("amount")), op.fieldError("to_account_id")]}
          />
        </form>
      )}
    </FormLayout>
  );
}
