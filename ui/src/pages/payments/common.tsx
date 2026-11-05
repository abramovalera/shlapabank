// Общие части форм переводов и платежей.
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccounts, useCreateOperation, useGuardedMutate, useLimits } from "../../api/hooks";
import type { Account, Operation, OperationBodies, OperationKind, Recipient } from "../../api/types";
import { Badge, Card, Notice, ProgressBar, Skeleton } from "../../ui/blocks";
import { Button } from "../../ui/Button";
import { AmountInput, Field } from "../../ui/fields";
import { Avatar } from "../../ui/operation";
import { formatMoney, formatPercent, toCents } from "../../ui/format";
import { amountProblem, feeIsMinimum, parseAmount, rangeText, type AmountRange } from "../../ui/validate";
import { CancelledNotice, ConfirmModal } from "./ConfirmModal";

export function FormLayout({
  testId,
  title,
  subtitle,
  aside,
  children,
}: {
  testId: string;
  title: string;
  subtitle?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex max-w-page flex-wrap items-start gap-6 px-4 py-7 sm:px-6">
      <section
        data-testid={testId}
        className="flex min-w-0 flex-[999_1_520px] flex-col gap-[22px] rounded-card bg-white p-5 sm:p-7"
      >
        <div>
          <Link to="/" className="text-sm font-medium" data-testid={`${testId}-back`}>
            ← На главную
          </Link>
          <h1 className="mt-2.5 text-[26px] font-bold leading-[34px] tracking-[-0.3px]">{title}</h1>
          {subtitle && <div className="mt-1 text-ink-muted">{subtitle}</div>}
        </div>
        {children}
      </section>
      {/* На десктопе колонка фиксированной ширины — подписи тарифов помещаются в одну строку */}
      {aside && (
        <aside className="flex w-full min-w-0 flex-[1_1_280px] flex-col gap-4 lg:max-w-[380px] lg:flex-[0_0_340px]">{aside}</aside>
      )}
    </main>
  );
}

/** Заглушка формы на время загрузки счетов/справочников. */
export function FormSkeleton() {
  return (
    <div className="flex flex-col gap-[22px]" aria-busy="true" aria-label="Загрузка">
      {[52, 56, 60].map((h, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <span className="block rounded-control bg-[#eceef2]" style={{ height: h }} />
        </div>
      ))}
    </div>
  );
}

/** Счета клиента и выбранный счёт (по умолчанию первый). */
export function useAccountChoice(initial?: number | null) {
  const accounts = useAccounts();
  const [chosen, setChosen] = useState<number | null>(initial ?? null);
  const list = accounts.data ?? [];
  const id = chosen != null && list.some((a) => a.id === chosen) ? chosen : list[0]?.id ?? null;
  const account: Account | undefined = list.find((a) => a.id === id);
  return { accounts, list, id, account, setId: setChosen };
}

/**
 * Хватит ли денег на счёте и уложимся ли в лимиты (сумма + комиссия, в копейках).
 * withLimits = false — для переводов между своими: они в лимиты не входят.
 */
export function useFundsProblem(account: Account | undefined, totalCents: number | null, withLimits: boolean): string | null {
  const limits = useLimits(withLimits);
  if (!account || totalCents == null || totalCents <= 0) return null;
  if (totalCents > toCents(account.balance)) return "Недостаточно средств на счёте";
  const l = withLimits ? limits.data : undefined;
  if (!l) return null;
  if (totalCents > toCents(l.per_operation)) {
    return `Превышен лимит на одну операцию: до ${formatMoney(l.per_operation, { compact: true })} вместе с комиссией`;
  }
  if (totalCents > toCents(l.daily.left)) return `Превышен дневной лимит: осталось ${formatMoney(l.daily.left, { compact: true })}`;
  if (totalCents > toCents(l.monthly.left)) return `Превышен месячный лимит: осталось ${formatMoney(l.monthly.left, { compact: true })}`;
  return null;
}

/** Поле суммы с подсказкой диапазона. */
export function AmountField({
  prefix,
  value,
  onChange,
  range,
  rangeSuffix = "",
  apiError,
  children,
}: {
  prefix: string;
  value: string;
  onChange: (v: string) => void;
  range: AmountRange | null;
  rangeSuffix?: string;
  apiError?: string | null;
  children?: ReactNode;
}) {
  const error = amountFieldError(value, range, apiError);
  const hint = range ? `${capitalize(rangeText(range))}${rangeSuffix}` : null;
  return (
    <Field id={`${prefix}-amount`} label="Сумма" testId={`${prefix}-amount`} error={error} hint={children ? null : hint}>
      <AmountInput
        id={`${prefix}-amount`}
        data-testid={`${prefix}-amount`}
        value={value}
        onValueChange={onChange}
        invalid={!!error}
      />
      {children}
    </Field>
  );
}

/** Ошибка, которую поле суммы показывает красным: ошибка API или (если сумма уже введена) выход за диапазон. */
export function amountFieldError(value: string, range: AmountRange | null, apiError?: string | null): string | null {
  if (apiError) return apiError;
  const cents = parseAmount(value);
  return value && cents !== null ? amountProblem(cents, range) : null;
}

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Блок «Сумма / Комиссия / Спишем со счёта». */
export function SummaryBox({
  prefix,
  amountCents,
  feeCents,
  feePercent,
  feeMin,
  amountLabel = "Сумма перевода",
}: {
  prefix: string;
  amountCents: number;
  feeCents: number;
  feePercent?: string | number | null;
  /** Минимальная комиссия тарифа — чтобы подписать, что сработал минимум */
  feeMin?: string | number | null;
  amountLabel?: string;
}) {
  const p = Number(feePercent ?? 0);
  // Процент от суммы меньше минимума — взяли минимум, а не «1%»
  const byMin = feeCents > 0 && p > 0 && feeIsMinimum(amountCents, p, feeMin ?? 0);
  const feeLabel = byMin
    ? `Комиссия: минимум ${formatMoney(feeMin ?? 0, { compact: true })}`
    : `Комиссия${p > 0 ? ` ${formatPercent(p)}` : ""}`;
  return (
    <div className="flex flex-col gap-2 rounded-control px-4 py-3.5 shadow-outline" data-testid={`${prefix}-summary`}>
      <div className="flex justify-between gap-3">
        <span className="text-ink-muted">{amountLabel}</span>
        <span className="font-semibold" data-testid={`${prefix}-summary-amount`}>
          {formatMoney(amountCents / 100)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-ink-muted" data-testid={`${prefix}-summary-fee-label`}>
          {feeLabel}
        </span>
        {feeCents > 0 ? (
          <span className="font-semibold text-fee" data-testid={`${prefix}-summary-fee`}>
            +{formatMoney(feeCents / 100)}
          </span>
        ) : (
          <span data-testid={`${prefix}-summary-fee`}>
            <Badge tone="green">бесплатно</Badge>
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-3 pt-2.5 shadow-row-top">
        <span className="font-semibold">Спишем со счёта</span>
        <span className="text-xl font-bold" data-testid={`${prefix}-summary-total`}>
          {formatMoney((amountCents + feeCents) / 100)}
        </span>
      </div>
    </div>
  );
}

/** Ошибка API, кнопка отправки и подсказка, почему она неактивна. */
export function SubmitBlock({
  prefix,
  label,
  problem,
  pending,
  error,
  cancelled,
  fieldErrors = [],
}: {
  prefix: string;
  label: string;
  problem: string | null;
  pending: boolean;
  error: string | null;
  cancelled?: boolean;
  /** Ошибки, уже показанные под полями: такую же подсказку под кнопкой не повторяем */
  fieldErrors?: (string | null | undefined)[];
}) {
  // Причина уже горит красным у поля — под кнопкой только отсылка к нему, без повтора текста
  const hint = problem ? (fieldErrors.includes(problem) ? "Исправьте ошибку в поле выше" : problem) : null;
  return (
    <div className="flex flex-col gap-2.5">
      {cancelled && <CancelledNotice />}
      {error && (
        <Notice tone="error" testId={`${prefix}-error`}>
          {error}
        </Notice>
      )}
      <Button type="submit" size="lg" data-testid={`${prefix}-submit`} disabled={!!problem} loading={pending}>
        {label}
      </Button>
      {hint && (
        <div className="text-center text-[13px] text-ink-muted" data-testid={`${prefix}-submit-hint`}>
          {hint}
        </div>
      )}
    </div>
  );
}

/** Найденный получатель: имя, банк, бейдж. */
export function RecipientBox({
  prefix,
  recipient,
  loading,
}: {
  prefix: string;
  recipient: Recipient | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-control bg-page px-3.5 py-3" data-testid={`${prefix}-recipient-loading`} aria-busy="true">
        <Skeleton className="h-10 w-10 flex-none rounded-full bg-line" />
        <span className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-28 bg-line" />
          <Skeleton className="h-3 w-40 bg-line" />
        </span>
      </div>
    );
  }
  if (!recipient) return null;
  return (
    <div className="flex items-center gap-3 rounded-control bg-page px-3.5 py-3" data-testid={`${prefix}-recipient`}>
      <Avatar name={recipient.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold" data-testid={`${prefix}-recipient-name`}>
          {recipient.name}
        </span>
        <span className="text-[13px] text-ink-muted">
          Клиент банка{" "}
          <span className="font-semibold text-ink" data-testid={`${prefix}-recipient-bank`}>
            {recipient.bank_name}
          </span>
        </span>
      </span>
      {recipient.own_bank ? (
        <Badge tone="blue" testId={`${prefix}-recipient-badge`}>
          ShlapaBank
        </Badge>
      ) : (
        <Badge tone="orange" testId={`${prefix}-recipient-badge`}>
          Другой банк
        </Badge>
      )}
    </div>
  );
}

export interface FeeRow {
  label: string;
  /** null — бесплатно */
  value: string | null;
}

export function FeeCard({ prefix, rows, loading }: { prefix: string; rows: FeeRow[]; loading?: boolean }) {
  return (
    <Card className="flex flex-col gap-3 px-[22px] py-5" testId={`${prefix}-fee-card`}>
      <h2 className="text-[17px] font-semibold">Комиссия</h2>
      {loading ? (
        <>
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </>
      ) : (
        rows.map((r, i) => (
          <div key={r.label} className="flex items-center justify-between gap-3" data-testid={`${prefix}-fee-row-${i + 1}`}>
            <span className="min-w-0 truncate whitespace-nowrap" title={r.label}>
              {r.label}
            </span>
            {r.value ? (
              <span className="flex-none whitespace-nowrap font-semibold">{r.value}</span>
            ) : (
              <Badge tone="green">бесплатно</Badge>
            )}
          </div>
        ))
      )}
      <Link to="/limits" className="text-sm font-medium" data-testid={`${prefix}-tariffs-link`}>
        Все тарифы
      </Link>
    </Card>
  );
}

export function DailyLimitCard({ prefix }: { prefix: string }) {
  const limits = useLimits();
  const d = limits.data?.daily;
  const used = d ? toCents(d.used) : 0;
  const limit = d ? toCents(d.limit) : 0;
  return (
    <Card className="flex flex-col gap-2.5 px-[22px] py-5" testId={`${prefix}-limit-card`}>
      <h2 className="text-[17px] font-semibold">Лимит на сегодня</h2>
      {limits.isPending ? (
        <>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-2 w-full" />
        </>
      ) : limits.isError || !d ? (
        <div className="text-sm text-danger">Не удалось загрузить лимиты</div>
      ) : (
        <>
          <div className="text-[22px] font-bold" data-testid={`${prefix}-limit-left`}>
            {formatMoney(d.left, { compact: true })}{" "}
            <span className="text-sm font-medium text-ink-muted">осталось</span>
          </div>
          <ProgressBar percent={limit ? (used / limit) * 100 : 0} />
          <div className="text-[13px] text-ink-muted">
            Потрачено {formatMoney(d.used, { compact: true, noCurrency: true })} из {formatMoney(d.limit, { compact: true })}
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * Создание операции: защита от двойного клика, модалка с кодом,
 * переход на страницу результата.
 */
export function useOperationSubmit<K extends OperationKind>(kind: K, formFields: string[]) {
  const navigate = useNavigate();
  const create = useCreateOperation(kind);
  // isPending + синхронный флаг: второй клик/Enter до перерисовки второй запрос не отправит
  const createOnce = useGuardedMutate(create);
  // Операция, ждущая кода, и момент получения ответа (от него считаются таймеры кода)
  const [waiting, setWaiting] = useState<{ op: Operation; at: number } | null>(null);
  const [cancelled, setCancelled] = useState(false);

  function submit(body: OperationBodies[K]) {
    if (waiting || create.isPending) return;
    setCancelled(false);
    createOnce(body, {
      onSuccess: (op) => {
        if (op.status === "WAITING_CODE") setWaiting({ op, at: Date.now() });
        else navigate(`/operations/${op.id}`);
      },
    });
  }

  const err = create.error;
  const modal = waiting ? (
    <ConfirmModal
      operation={waiting.op}
      receivedAt={waiting.at}
      onFinished={(id) => navigate(`/operations/${id}`)}
      onCancelled={() => {
        setWaiting(null);
        setCancelled(true);
        create.reset();
      }}
    />
  ) : null;

  return {
    submit,
    pending: create.isPending || !!waiting,
    modal,
    cancelled,
    /** Сбросить ошибку API при правке формы */
    clearError: () => {
      if (create.error) create.reset();
      if (cancelled) setCancelled(false);
    },
    fieldError: (f: string) => (err && err.field === f ? err.message : null),
    generalError: err && !(err.field && formFields.includes(err.field)) ? err.message : null,
  };
}

/** onSubmit формы без перезагрузки. */
export function onFormSubmit(fn: () => void) {
  return (e: FormEvent) => {
    e.preventDefault();
    fn();
  };
}
