import { useSearchParams } from "react-router-dom";
import { useAccounts, useAllOperations, useOperationsList, useSingleFlight } from "../api/hooks";
import type { OperationType, OperationsQuery } from "../api/types";
import { Card, EmptyState, LoadError, RowsSkeleton, Skeleton } from "../ui/blocks";
import { Button, ButtonLink } from "../ui/Button";
import { formatDayLong, formatMoney, mskPeriodStart } from "../ui/format";
import { OperationRow, groupByDay, totals } from "../ui/operation";

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "transfers", label: "Переводы" },
  { id: "payments", label: "Платежи" },
  { id: "topups", label: "Пополнения" },
  { id: "declined", label: "Отклонённые" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

const FILTER_TYPES: Partial<Record<FilterId, OperationType[]>> = {
  transfers: ["PHONE_TRANSFER", "CARD_TRANSFER", "OWN_TRANSFER", "INCOMING_TRANSFER"],
  payments: ["MOBILE", "UTILITY"],
  topups: ["TOPUP"],
};

const PERIODS = [
  { id: "7", label: "Последние 7 дней" },
  { id: "30", label: "Последние 30 дней" },
  { id: "90", label: "Последние 90 дней" },
  { id: "all", label: "За всё время" },
];

const DEFAULT_PERIOD = "30";

/** Итог дня: «−1 515 ₽ · +10 000 ₽» или «−7 598,50 ₽ · +207 150,00 ₽» — копейки у обеих частей одинаково. */
function dayTotalText(out: number, inc: number): string {
  const parts: string[] = [];
  const compact = out % 100 === 0 && inc % 100 === 0;
  if (out > 0) parts.push(formatMoney(out / 100, { sign: "-", compact }));
  if (inc > 0) parts.push(formatMoney(inc / 100, { sign: "+", compact }));
  return parts.join(" · ");
}

/** Крупные суммы (от 10 млн ₽) — мельче, чтобы не вылезали за карточку. */
function sumSize(cents: number): string {
  return Math.abs(cents) >= 1_000_000_000 ? "text-xl" : "text-2xl";
}

function Summary30() {
  const q = useAllOperations({ date_from: mskPeriodStart(30), status: "DONE" });
  const t = q.data ? totals(q.data) : null;
  return (
    <aside
      data-testid="history-summary"
      className="flex w-full min-w-0 flex-[1_1_280px] flex-col gap-3.5 rounded-card bg-white px-[22px] py-5 lg:max-w-[360px]"
    >
      <h2 className="text-[17px] font-semibold">За 30 дней</h2>
      {q.isPending ? (
        <>
          <Skeleton className="h-12 w-40" />
          <Skeleton className="h-12 w-40" />
          <Skeleton className="h-10 w-32" />
        </>
      ) : q.isError || !t ? (
        <div className="text-sm text-danger" data-testid="history-summary-error">
          Не удалось посчитать сводку
        </div>
      ) : (
        <>
          <div className="min-w-0">
            <div className="text-[13px] text-ink-muted">Потрачено</div>
            <div className={`break-words font-bold ${sumSize(t.out)}`} data-testid="history-summary-spent">
              {formatMoney(t.out / 100)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[13px] text-ink-muted">Поступило</div>
            <div className={`break-words font-bold text-success ${sumSize(t.inc)}`} data-testid="history-summary-received">
              {formatMoney(t.inc / 100, { sign: "+" })}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[13px] text-ink-muted">Комиссии</div>
            <div className="break-words text-lg font-semibold text-fee" data-testid="history-summary-fees">
              {formatMoney(t.fee / 100)}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS.find((f) => f.id === params.get("filter"))?.id ?? "all") as FilterId;
  const period = PERIODS.find((p) => p.id === params.get("period"))?.id ?? DEFAULT_PERIOD;
  const accountParam = params.get("account_id");
  const accountId = accountParam && /^\d+$/.test(accountParam) ? Number(accountParam) : undefined;
  const accounts = useAccounts();
  const account = accounts.data?.find((a) => a.id === accountId);

  const query: Omit<OperationsQuery, "limit" | "offset"> = {
    ...(FILTER_TYPES[filter] ? { type: FILTER_TYPES[filter] } : {}),
    ...(filter === "declined" ? { status: "DECLINED" } : {}),
    ...(period !== "all" ? { date_from: mskPeriodStart(Number(period)) } : {}),
    ...(accountId ? { account_id: accountId } : {}),
  };
  const list = useOperationsList(query);
  const loadMoreOnce = useSingleFlight();
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const groups = groupByDay(items);
  const filtered = filter !== "all" || period !== DEFAULT_PERIOD || !!accountId;

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  return (
    <main className="mx-auto flex max-w-page flex-wrap items-start gap-6 px-4 py-7 sm:px-6">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
        <h1 className="text-[26px] font-bold leading-[34px] tracking-[-0.3px]">История</h1>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Фильтры операций">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              data-testid={`history-filter-${f.id}`}
              aria-pressed={filter === f.id}
              onClick={() => setParam("filter", f.id === "all" ? null : f.id)}
              className={`h-9 rounded-full px-3.5 text-sm ${
                filter === f.id ? "bg-navy font-semibold text-white" : "bg-white font-medium text-ink hover:bg-line"
              }`}
            >
              {f.label}
            </button>
          ))}
          <div className="relative sm:ml-auto">
            <label htmlFor="history-period" className="sr-only">
              Период
            </label>
            <select
              id="history-period"
              data-testid="history-period"
              value={period}
              onChange={(e) => setParam("period", e.target.value === DEFAULT_PERIOD ? null : e.target.value)}
              className="h-9 cursor-pointer appearance-none rounded-full bg-white pl-3.5 pr-9 text-sm font-medium text-ink outline-none focus:shadow-focus"
            >
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7a8c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>

        {accountId && (
          <div className="flex items-center gap-2 text-sm" data-testid="history-account-filter">
            <span className="text-ink-muted">Счёт:</span>
            <span className="font-semibold">{account?.name ?? "—"}</span>
            <button
              type="button"
              data-testid="history-account-filter-clear"
              onClick={() => setParam("account_id", null)}
              className="font-medium text-primary hover:text-primary-hover hover:underline"
            >
              Показать все счета
            </button>
          </div>
        )}

        <Card className="py-2" testId="history-list">
          {list.isPending ? (
            <RowsSkeleton rows={6} testId="history-loading" />
          ) : list.isError ? (
            <LoadError testId="history-error" message={list.error.message} onRetry={() => list.refetch()} />
          ) : groups.length === 0 ? (
            filtered ? (
              <EmptyState
                testId="history-empty"
                title="Ничего не найдено"
                text="Попробуйте другой фильтр или период."
                action={
                  <Button size="sm" variant="secondary" data-testid="history-reset-filters" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                    Сбросить фильтры
                  </Button>
                }
              />
            ) : (
              <EmptyState
                testId="history-empty"
                title="Операций пока нет"
                text="Здесь появятся ваши переводы, платежи и пополнения."
                action={
                  <ButtonLink to="/transfer/phone" size="sm" data-testid="history-empty-transfer">
                    Сделать перевод
                  </ButtonLink>
                }
              />
            )
          ) : (
            groups.map((g, gi) => {
              const t = totals(g.items);
              // Последний день на странице при «Показать ещё» может быть загружен не целиком — итог не показываем
              const partial = list.hasNextPage && gi === groups.length - 1;
              const dayTotal = partial ? "" : dayTotalText(t.out, t.inc);
              return (
                <div key={g.key} data-testid={`history-day-${g.key}`}>
                  <div
                    className={`flex justify-between gap-3 px-4 pb-1 text-[13px] font-semibold text-ink-faint sm:px-6 ${gi === 0 ? "pt-3" : "pt-3.5"}`}
                  >
                    <span>{formatDayLong(g.iso)}</span>
                    {dayTotal && (
                      <span className="text-right" data-testid={`history-day-total-${g.key}`}>
                        {dayTotal}
                      </span>
                    )}
                  </div>
                  {g.items.map((op, i) => (
                    <OperationRow key={op.id} op={op} last={gi === groups.length - 1 && i === g.items.length - 1} />
                  ))}
                </div>
              );
            })
          )}
        </Card>

        {list.hasNextPage && (
          <Button
            variant="white"
            data-testid="history-load-more"
            loading={list.isFetchingNextPage}
            onClick={() => {
              // Двойной клик: второй вызов не запускаем (cancelRefetch: false — идущий запрос не перезапускать)
              if (!list.isFetchingNextPage) loadMoreOnce(() => list.fetchNextPage({ cancelRefetch: false }));
            }}
            className="h-11"
          >
            Показать ещё
          </Button>
        )}
        {!list.isPending && items.length > 0 && (
          <div className="text-center text-[13px] text-ink-faint" data-testid="history-count">
            Показано {items.length} из {total}
          </div>
        )}
      </div>

      <Summary30 />
    </main>
  );
}
