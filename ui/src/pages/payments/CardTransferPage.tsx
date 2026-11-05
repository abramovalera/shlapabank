import { useState } from "react";
import { useRecipientByCard, useTariffs } from "../../api/hooks";
import { LoadError } from "../../ui/blocks";
import { AccountSelect } from "../../ui/account";
import { Field, MaskedInput, inputBox } from "../../ui/fields";
import { centsToApi, feeText, formatMoney, maskCard } from "../../ui/format";
import {
  CARD_LENGTH,
  amountProblem,
  calcFee,
  findTariff,
  onlyDigits,
  parseAmount,
  rangeOf,
  transferTariff,
} from "../../ui/validate";
import {
  AmountField,
  amountFieldError,
  DailyLimitCard,
  FeeCard,
  FormLayout,
  FormSkeleton,
  RecipientBox,
  SubmitBlock,
  SummaryBox,
  onFormSubmit,
  useAccountChoice,
  useFundsProblem,
  useOperationSubmit,
} from "./common";

const P = "card-transfer";

export function CardTransferPage() {
  const tariffs = useTariffs();
  const acc = useAccountChoice();
  const [card, setCard] = useState("");
  const [amount, setAmount] = useState("");
  const op = useOperationSubmit("card-transfer", ["card_number", "amount", "from_account_id"]);

  const digits = onlyDigits(card);
  // Луна проверяет сервер при поиске получателя — показываем его текст ошибки
  const lookup = digits.length === CARD_LENGTH ? digits : null;
  const recipientQ = useRecipientByCard(lookup);
  const recipient = lookup ? recipientQ.data : undefined;
  const tariff = transferTariff(tariffs.data, "CARD", recipient);
  const range = rangeOf(tariff);
  const cents = parseAmount(amount);
  const fee = recipient && cents ? calcFee(cents, recipient.fee_percent, recipient.fee_min) : 0;

  const recipientError = lookup && recipientQ.isError ? recipientQ.error.message : null;
  const cardFieldError = op.fieldError("card_number") ?? recipientError;
  const funds = useFundsProblem(acc.account, cents != null ? cents + fee : null, true);

  const problem =
    digits.length < CARD_LENGTH
      ? "Введите номер карты полностью"
      : recipientError
        ? recipientError // уже показана под полем — под кнопкой не повторяем
        : !recipient
          ? "Проверяем карту…"
          : !acc.account
            ? "Выберите счёт списания"
            : amountProblem(cents, range) ?? funds;

  function submit() {
    if (problem || !acc.account || cents == null) return;
    op.submit({ from_account_id: acc.account.id, card_number: digits, amount: centsToApi(cents) });
  }

  const own = findTariff(tariffs.data, "CARD_OWN_BANK");
  const other = findTariff(tariffs.data, "CARD_OTHER_BANK");

  return (
    <FormLayout
      testId={P}
      title="Перевод на карту"
      aside={
        <>
          <FeeCard
            prefix={P}
            loading={tariffs.isPending}
            rows={[
              ...(own ? [{ label: "Карта ShlapaBank", value: feeText(own.fee_percent, own.fee_min, "мин.") }] : []),
              ...(other ? [{ label: "Карта другого банка", value: feeText(other.fee_percent, other.fee_min, "мин.") }] : []),
            ]}
          />
          <DailyLimitCard prefix={P} />
        </>
      }
    >
      {acc.accounts.isPending ? (
        <FormSkeleton />
      ) : acc.accounts.isError ? (
        <LoadError className="!px-0" testId={`${P}-load-error`} message={acc.accounts.error.message} onRetry={() => acc.accounts.refetch()} />
      ) : (
        <form className="flex flex-col gap-[22px]" onSubmit={onFormSubmit(submit)} noValidate>
          <Field
            id={`${P}-card`}
            label="Номер карты получателя"
            testId={`${P}-card`}
            error={cardFieldError}
            after={<RecipientBox prefix={P} recipient={recipient} loading={!!lookup && recipientQ.isFetching && !recipient} />}
          >
            <div className={`flex h-[52px] items-center ${inputBox} ${cardFieldError ? "shadow-invalid" : ""}`}>
              <MaskedInput
                id={`${P}-card`}
                data-testid={`${P}-card`}
                value={card}
                onValueChange={(v) => {
                  setCard(v);
                  op.clearError();
                }}
                format={(raw) => maskCard(raw)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0000 0000 0000 0000"
                maxLength={19}
                invalid={!!cardFieldError}
                className="h-full min-w-0 flex-1 bg-transparent px-4 text-[17px] font-medium tracking-[1px] text-ink outline-none placeholder:font-normal placeholder:text-ink-faint"
              />
            </div>
          </Field>

          <Field id={`${P}-from`} label="Счёт списания" testId={`${P}-from`} error={op.fieldError("from_account_id")}>
            <AccountSelect
              id={`${P}-from`}
              testId={`${P}-from`}
              accounts={acc.list}
              value={acc.id}
              onChange={(id) => {
                acc.setId(id);
                op.clearError();
              }}
            />
          </Field>

          <AmountField
            prefix={P}
            value={amount}
            onChange={(v) => {
              setAmount(v);
              op.clearError();
            }}
            range={range}
            rangeSuffix=" за перевод"
            apiError={op.fieldError("amount")}
          />

          {cents != null && cents > 0 && recipient && (
            <SummaryBox prefix={P} amountCents={cents} feeCents={fee} feePercent={fee > 0 ? recipient.fee_percent : null} feeMin={recipient.fee_min} />
          )}

          <SubmitBlock
            prefix={P}
            label={problem || cents == null ? "Перевести" : `Перевести ${formatMoney((cents + fee) / 100)}`}
            problem={problem}
            pending={op.pending}
            error={op.generalError}
            fieldErrors={[cardFieldError, amountFieldError(amount, range, op.fieldError("amount")), op.fieldError("from_account_id")]}
            cancelled={op.cancelled}
          />
        </form>
      )}
      {op.modal}
    </FormLayout>
  );
}
