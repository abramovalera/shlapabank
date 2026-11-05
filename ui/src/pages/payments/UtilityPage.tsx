import { useState } from "react";
import { useProviders, useTariffs } from "../../api/hooks";
import type { Provider } from "../../api/types";
import { LoadError } from "../../ui/blocks";
import { AccountSelect } from "../../ui/account";
import { Field, MaskedInput, SelectBox, inputBox } from "../../ui/fields";
import { centsToApi, feeText, formatMoney, plural } from "../../ui/format";
import { amountProblem, calcFee, findTariff, onlyDigits, parseAmount, rangeOf } from "../../ui/validate";
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

const P = "utility";

function groupByCategory(list: Provider[]) {
  const map = new Map<string, Provider[]>();
  for (const p of list) {
    const g = map.get(p.category) ?? [];
    g.push(p);
    map.set(p.category, g);
  }
  return [...map.entries()];
}

export function UtilityPage() {
  const tariffs = useTariffs();
  const providers = useProviders();
  const acc = useAccountChoice();
  const [providerCode, setProviderCode] = useState("");
  const [payer, setPayer] = useState("");
  const [payerTouched, setPayerTouched] = useState(false);
  const [amount, setAmount] = useState("");
  const op = useOperationSubmit("utility", ["provider_code", "payer_account", "amount", "from_account_id"]);

  const provider = providers.data?.find((p) => p.code === providerCode);
  const len = provider?.payer_account_length ?? 0;
  const payerDigits = onlyDigits(payer);
  const tariff = findTariff(tariffs.data, "UTILITY");
  const range = rangeOf(tariff);
  const cents = parseAmount(amount);
  const fee = tariff && cents ? calcFee(cents, tariff.fee_percent, tariff.fee_min) : 0;
  const funds = useFundsProblem(acc.account, cents != null ? cents + fee : null, true);

  const problem = !provider
    ? "Выберите поставщика услуг"
    : payerDigits.length !== len
      ? `Лицевой счёт — ${len} ${plural(len, "цифра", "цифры", "цифр")}`
      : !acc.account
        ? "Выберите счёт списания"
        : amountProblem(cents, range) ?? funds;

  function submit() {
    if (problem || !acc.account || !provider || cents == null) return;
    op.submit({
      from_account_id: acc.account.id,
      provider_code: provider.code,
      payer_account: payerDigits,
      amount: centsToApi(cents),
    });
  }

  // Неполный лицевой счёт — ошибка у поля после ухода с него
  const payerError =
    op.fieldError("payer_account") ||
    (provider && payerTouched && payerDigits.length !== len ? `Лицевой счёт — ${len} ${plural(len, "цифра", "цифры", "цифр")}` : null);

  return (
    <FormLayout
      testId={P}
      title="ЖКХ и услуги"
      subtitle="Квартплата, вода, электричество, интернет и ТВ"
      aside={
        <>
          <FeeCard
            prefix={P}
            loading={tariffs.isPending}
            rows={tariff ? [{ label: "Оплата услуг", value: feeText(tariff.fee_percent, tariff.fee_min, "мин.") }] : []}
          />
          <DailyLimitCard prefix={P} />
        </>
      }
    >
      {acc.accounts.isPending || providers.isPending ? (
        <FormSkeleton />
      ) : acc.accounts.isError || providers.isError ? (
        <LoadError
          className="!px-0"
          testId={`${P}-load-error`}
          message={(acc.accounts.error ?? providers.error)?.message}
          onRetry={() => {
            acc.accounts.refetch();
            providers.refetch();
          }}
        />
      ) : (
        <form className="flex flex-col gap-[22px]" onSubmit={onFormSubmit(submit)} noValidate>
          <Field id={`${P}-provider`} label="Поставщик услуг" testId={`${P}-provider`} error={op.fieldError("provider_code")}>
            <SelectBox
              id={`${P}-provider`}
              testId={`${P}-provider`}
              value={providerCode}
              invalid={!!op.fieldError("provider_code")}
              onChange={(v) => {
                setProviderCode(v);
                setPayer("");
                setPayerTouched(false);
                op.clearError();
              }}
            >
              <option value="" disabled>
                Выберите поставщика
              </option>
              {groupByCategory(providers.data ?? []).map(([category, items]) => (
                <optgroup key={category} label={category}>
                  {items.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectBox>
          </Field>

          <Field
            id={`${P}-payer`}
            label="Лицевой счёт"
            testId={`${P}-payer`}
            error={payerError}
            hint={provider ? `${len} ${plural(len, "цифра", "цифры", "цифр")}, указан в квитанции` : "Сначала выберите поставщика"}
          >
            <div className={`flex h-12 items-center ${inputBox} ${payerError ? "shadow-invalid" : ""}`}>
              <MaskedInput
                id={`${P}-payer`}
                data-testid={`${P}-payer`}
                value={payer}
                disabled={!provider}
                onValueChange={(v) => {
                  setPayer(v);
                  op.clearError();
                }}
                onBlur={() => setPayerTouched(true)}
                format={(raw) => onlyDigits(raw).slice(0, len)}
                inputMode="numeric"
                autoComplete="off"
                maxLength={len || undefined}
                invalid={!!payerError}
                className="h-full min-w-0 flex-1 bg-transparent px-4 text-[15px] tracking-[0.5px] text-ink outline-none disabled:cursor-not-allowed"
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
            fieldErrors={[op.fieldError("provider_code"), payerError, amountFieldError(amount, range, op.fieldError("amount")), op.fieldError("from_account_id")]}
            cancelled={op.cancelled}
          />
        </form>
      )}
      {op.modal}
    </FormLayout>
  );
}
