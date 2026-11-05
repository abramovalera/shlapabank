import { useState } from "react";
import { useMobileOperators, useTariffs } from "../../api/hooks";
import { LoadError } from "../../ui/blocks";
import { AccountSelect } from "../../ui/account";
import { Field, PhoneInput } from "../../ui/fields";
import { centsToApi, feeText, formatMoney } from "../../ui/format";
import { amountProblem, calcFee, findTariff, onlyDigits, parseAmount, phoneToApi, rangeOf } from "../../ui/validate";
import {
  AmountField,
  amountFieldError,
  DailyLimitCard,
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

const P = "mobile";

export function MobilePage() {
  const tariffs = useTariffs();
  const operators = useMobileOperators();
  const acc = useAccountChoice();
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const op = useOperationSubmit("mobile", ["phone", "amount", "from_account_id"]);

  const digits = onlyDigits(phone);
  const prefix = digits.slice(0, 3);
  const operator = prefix.length === 3 ? operators.data?.find((o) => o.prefixes.includes(prefix)) : undefined;
  const operatorUnknown = prefix.length === 3 && !!operators.data && !operator;
  const tariff = findTariff(tariffs.data, "MOBILE");
  const range = rangeOf(tariff);
  const cents = parseAmount(amount);
  const fee = tariff && cents ? calcFee(cents, tariff.fee_percent, tariff.fee_min) : 0;

  const funds = useFundsProblem(acc.account, cents != null ? cents + fee : null, true);

  // Текст как у API (operator_not_found), чтобы не расходился с ответом сервера
  const phoneError = op.fieldError("phone") ?? (operatorUnknown ? "Оператор для этого номера не найден" : null);
  const problem =
    digits.length < 10
      ? "Введите номер телефона полностью"
      : operators.isPending
        ? "Определяем оператора…"
        : operatorUnknown
          ? "Оператор для этого номера не найден"
          : !acc.account
            ? "Выберите счёт списания"
            : amountProblem(cents, range) ?? funds;

  function submit() {
    if (problem || !acc.account || cents == null) return;
    op.submit({ from_account_id: acc.account.id, phone: phoneToApi(digits), amount: centsToApi(cents) });
  }

  return (
    <FormLayout
      testId={P}
      title="Мобильная связь"
      subtitle="Пополнение баланса телефона"
      aside={
        <>
          <FeeCard
            prefix={P}
            loading={tariffs.isPending}
            rows={tariff ? [{ label: "Оплата связи", value: feeText(tariff.fee_percent, tariff.fee_min, "мин.") }] : []}
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
          <Field id={`${P}-phone`} label="Номер телефона" testId={`${P}-phone`} error={phoneError}>
            <PhoneInput
              id={`${P}-phone`}
              data-testid={`${P}-phone`}
              value={phone}
              onValueChange={(v) => {
                setPhone(v);
                op.clearError();
              }}
              invalid={!!phoneError}
            />
            {operator && (
              <div className="text-[13px] text-ink-muted">
                Оператор{" "}
                <span className="font-semibold text-ink" data-testid={`${P}-operator`}>
                  {operator.name}
                </span>
              </div>
            )}
            {operators.isError && (
              <div className="text-[13px] text-danger" data-testid={`${P}-operators-error`}>
                Не удалось загрузить список операторов.
              </div>
            )}
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
            apiError={op.fieldError("amount")}
          />

          {cents != null && cents > 0 && tariff && (
            <SummaryBox
              prefix={P}
              amountLabel="Сумма платежа"
              amountCents={cents}
              feeCents={fee}
              feePercent={fee > 0 ? tariff.fee_percent : null} feeMin={tariff.fee_min}
            />
          )}

          <SubmitBlock
            prefix={P}
            label={problem || cents == null ? "Оплатить" : `Оплатить ${formatMoney((cents + fee) / 100)}`}
            problem={problem}
            pending={op.pending}
            error={op.generalError}
            fieldErrors={[phoneError, amountFieldError(amount, range, op.fieldError("amount")), op.fieldError("from_account_id")]}
            cancelled={op.cancelled}
          />
        </form>
      )}
      {op.modal}
    </FormLayout>
  );
}
