import { useState } from "react";
import { useTariffs } from "../../api/hooks";
import { EmptyState, LoadError } from "../../ui/blocks";
import { ButtonLink } from "../../ui/Button";
import { AccountSelect } from "../../ui/account";
import { Field } from "../../ui/fields";
import { centsToApi, feeText, formatMoney } from "../../ui/format";
import { amountProblem, findTariff, parseAmount, rangeOf } from "../../ui/validate";
import {
  AmountField,
  amountFieldError,
  FeeCard,
  FormLayout,
  FormSkeleton,
  SubmitBlock,
  SummaryBox,
  onFormSubmit,
  useAccountChoice,
  useFundsProblem,
  useOperationSubmit,
} from "./common";

const P = "own-transfer";

export function OwnTransferPage() {
  const tariffs = useTariffs();
  const from = useAccountChoice();
  const [toChosen, setToChosen] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const op = useOperationSubmit("own-transfer", ["from_account_id", "to_account_id", "amount"]);

  const others = from.list.filter((a) => a.id !== from.id);
  const to = others.find((a) => a.id === toChosen) ?? others[0];
  const tariff = findTariff(tariffs.data, "OWN_TRANSFER");
  const range = rangeOf(tariff);
  const cents = parseAmount(amount);
  // Между своими — без комиссии и вне лимитов, проверяем только баланс
  const funds = useFundsProblem(from.account, cents, false);

  const problem = !from.account
    ? "Выберите счёт списания"
    : !to
      ? "Выберите счёт зачисления"
      : amountProblem(cents, range) ?? funds;

  function submit() {
    if (problem || !from.account || !to || cents == null) return;
    op.submit({ from_account_id: from.account.id, to_account_id: to.id, amount: centsToApi(cents) });
  }

  return (
    <FormLayout
      testId={P}
      title="Между своими счетами"
      subtitle="Без комиссии и кода из SMS, деньги приходят сразу"
      aside={
        <FeeCard
          prefix={P}
          loading={tariffs.isPending}
          rows={tariff ? [{ label: "Между своими счетами", value: feeText(tariff.fee_percent, tariff.fee_min, "мин.") }] : []}
        />
      }
    >
      {from.accounts.isPending ? (
        <FormSkeleton />
      ) : from.accounts.isError ? (
        <LoadError className="!px-0" testId={`${P}-load-error`} message={from.accounts.error.message} onRetry={() => from.accounts.refetch()} />
      ) : from.list.length < 2 ? (
        <EmptyState
          testId={`${P}-empty`}
          title="Нужен второй счёт"
          text="Чтобы переводить между своими счетами, откройте ещё один счёт на главной."
          action={
            <ButtonLink to="/" size="sm" data-testid={`${P}-empty-home`}>
              Открыть счёт
            </ButtonLink>
          }
        />
      ) : (
        <form className="flex flex-col gap-[22px]" onSubmit={onFormSubmit(submit)} noValidate>
          <Field id={`${P}-from`} label="Откуда" testId={`${P}-from`} error={op.fieldError("from_account_id")}>
            <AccountSelect
              id={`${P}-from`}
              testId={`${P}-from`}
              accounts={from.list}
              value={from.id}
              onChange={(id) => {
                from.setId(id);
                if (id === toChosen) setToChosen(null);
                op.clearError();
              }}
            />
          </Field>
          <Field id={`${P}-to`} label="Куда" testId={`${P}-to`} error={op.fieldError("to_account_id")}>
            <AccountSelect
              id={`${P}-to`}
              testId={`${P}-to`}
              accounts={from.list}
              exclude={from.id}
              value={to?.id ?? null}
              onChange={(id) => {
                setToChosen(id);
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
            apiError={op.fieldError("amount")}
          />
          {cents != null && cents > 0 && <SummaryBox prefix={P} amountCents={cents} feeCents={0} />}
          <SubmitBlock
            prefix={P}
            label={problem || cents == null ? "Перевести" : `Перевести ${formatMoney(cents / 100)}`}
            problem={problem}
            pending={op.pending}
            error={op.generalError}
            fieldErrors={[op.fieldError("from_account_id"), op.fieldError("to_account_id"), amountFieldError(amount, range, op.fieldError("amount"))]}
          />
        </form>
      )}
      {op.modal}
    </FormLayout>
  );
}
