import { useState } from "react";
import { useRecipientByPhone, useTariffs } from "../../api/hooks";
import { Notice, LoadError } from "../../ui/blocks";
import { AccountSelect } from "../../ui/account";
import { Field, PhoneInput, TextInput } from "../../ui/fields";
import { centsToApi, feeText, formatMoney } from "../../ui/format";
import {
  MESSAGE_MAX,
  amountProblem,
  calcFee,
  findTariff,
  onlyDigits,
  parseAmount,
  phoneToApi,
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

const P = "phone-transfer";

export function PhoneTransferPage() {
  const tariffs = useTariffs();
  const acc = useAccountChoice();
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const op = useOperationSubmit("phone-transfer", ["phone", "amount", "message", "from_account_id"]);

  const digits = onlyDigits(phone);
  const recipientQ = useRecipientByPhone(digits.length === 10 ? phoneToApi(digits) : null);
  const recipient = digits.length === 10 ? recipientQ.data : undefined;
  const tariff = transferTariff(tariffs.data, "PHONE", recipient);
  const range = rangeOf(tariff);
  const cents = parseAmount(amount);
  const fee = recipient && cents ? calcFee(cents, recipient.fee_percent, recipient.fee_min) : 0;
  const msg = message.trim();
  const funds = useFundsProblem(acc.account, cents != null ? cents + fee : null, true);

  const recipientError = digits.length === 10 && recipientQ.isError ? recipientQ.error.message : null;
  const phoneError = op.fieldError("phone") ?? recipientError;
  const problem =
    digits.length < 10
      ? "Введите номер телефона получателя полностью"
      : recipientQ.isFetching && !recipient
        ? "Проверяем получателя…"
        : recipientError
          ? recipientError // уже показана под полем — под кнопкой не повторяем
          : !recipient
            ? "Проверяем получателя…"
            : !acc.account
              ? "Выберите счёт списания"
              : amountProblem(cents, range) ??
                (msg.length > MESSAGE_MAX ? `Сообщение — до ${MESSAGE_MAX} символов` : null) ??
                funds;

  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    op.clearError();
  };

  function submit() {
    if (problem || !acc.account || cents == null) return;
    op.submit({
      from_account_id: acc.account.id,
      phone: phoneToApi(digits),
      amount: centsToApi(cents),
      ...(msg ? { message: msg } : {}),
    });
  }

  const own = findTariff(tariffs.data, "PHONE_OWN_BANK");
  const other = findTariff(tariffs.data, "PHONE_OTHER_BANK");

  return (
    <FormLayout
      testId={P}
      title="Перевод по номеру телефона"
      aside={
        <>
          <FeeCard
            prefix={P}
            loading={tariffs.isPending}
            rows={[
              ...(own ? [{ label: "Клиенту ShlapaBank", value: feeText(own.fee_percent, own.fee_min, "мин.") }] : []),
              ...(other ? [{ label: "В другой банк", value: feeText(other.fee_percent, other.fee_min, "мин.") }] : []),
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
          {/* Ошибка — сразу под полем, получатель и пояснение — ниже неё */}
          <Field
            id={`${P}-phone`}
            label="Телефон получателя"
            testId={`${P}-phone`}
            error={phoneError}
            after={
              <>
                <RecipientBox prefix={P} recipient={recipient} loading={digits.length === 10 && recipientQ.isFetching && !recipient} />
                <Notice tone="info">Банк получателя определяется по номеру сам.</Notice>
              </>
            }
          >
            <PhoneInput
              id={`${P}-phone`}
              data-testid={`${P}-phone`}
              value={phone}
              onValueChange={edit(setPhone)}
              invalid={!!phoneError}
              autoComplete="off"
            />
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
            onChange={edit(setAmount)}
            range={range}
            rangeSuffix=" за перевод"
            apiError={op.fieldError("amount")}
          />

          <Field
            id={`${P}-message`}
            label="Сообщение получателю"
            testId={`${P}-message`}
            error={op.fieldError("message")}
            hint={message ? `${message.length} из ${MESSAGE_MAX}` : null}
          >
            <TextInput
              id={`${P}-message`}
              data-testid={`${P}-message`}
              value={message}
              onValueChange={edit(setMessage)}
              maxLength={MESSAGE_MAX}
              placeholder={`Необязательно, до ${MESSAGE_MAX} символов`}
              autoComplete="off"
              invalid={!!op.fieldError("message")}
            />
          </Field>

          {cents != null && cents > 0 && recipient && (
            <SummaryBox prefix={P} amountCents={cents} feeCents={fee} feePercent={fee > 0 ? recipient.fee_percent : null} feeMin={recipient.fee_min} />
          )}

          <SubmitBlock
            prefix={P}
            label={problem || cents == null ? "Перевести" : `Перевести ${formatMoney((cents + fee) / 100)}`}
            problem={problem}
            pending={op.pending}
            error={op.generalError}
            cancelled={op.cancelled}
            fieldErrors={[phoneError, amountFieldError(amount, range, op.fieldError("amount")), op.fieldError("from_account_id"), op.fieldError("message")]}
          />
        </form>
      )}
      {op.modal}
    </FormLayout>
  );
}
