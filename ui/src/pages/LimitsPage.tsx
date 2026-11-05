import { useLimits, useTariffs } from "../api/hooks";
import type { LimitUsage, Tariff } from "../api/types";
import { Badge, Card, LoadError, Notice, ProgressBar, Skeleton } from "../ui/blocks";
import { feeText, formatMoney, toCents } from "../ui/format";

function LimitCard({ title, usage, color, testId }: { title: string; usage: LimitUsage; color: string; testId: string }) {
  const limit = toCents(usage.limit);
  const used = toCents(usage.used);
  return (
    <Card className="flex flex-col gap-2.5 px-[22px] py-5" testId={testId}>
      <div className="text-[13px] font-medium text-ink-muted">{title}</div>
      <div className="text-[28px] font-bold leading-[34px]" data-testid={`${testId}-left`}>
        {formatMoney(usage.left, { compact: true })} <span className="text-sm font-medium text-ink-muted">осталось</span>
      </div>
      <ProgressBar percent={limit ? (used / limit) * 100 : 0} color={color} />
      <div className="text-[13px] text-ink-faint" data-testid={`${testId}-used`}>
        Потрачено {formatMoney(usage.used, { compact: true, noCurrency: true })} из {formatMoney(usage.limit, { compact: true })}
      </div>
    </Card>
  );
}

function CardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 px-[22px] py-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-2 w-full" />
    </Card>
  );
}

function limitsText(t: Tariff): string {
  const range = `от ${formatMoney(t.amount_min, { compact: true })} до ${formatMoney(t.amount_max, { compact: true })}`;
  return t.needs_code ? range : `${range}, без кода из SMS`;
}

export function LimitsPage() {
  const limits = useLimits();
  const tariffs = useTariffs();

  return (
    <main className="mx-auto flex max-w-page flex-col gap-5 px-4 py-7 sm:px-6">
      <h1 className="text-[26px] font-bold leading-[34px] tracking-[-0.3px]">Тарифы и лимиты</h1>

      {limits.isError ? (
        <Card>
          <LoadError testId="limits-error" message={limits.error.message} onRetry={() => limits.refetch()} />
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          {limits.isPending ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : (
            <>
              <Card className="flex flex-col gap-2.5 px-[22px] py-5" testId="limits-per-operation">
                <div className="text-[13px] font-medium text-ink-muted">Одна операция</div>
                <div className="text-[28px] font-bold leading-[34px]" data-testid="limits-per-operation-value">
                  до {formatMoney(limits.data.per_operation, { compact: true })}
                </div>
                <div className="text-[13px] text-ink-faint">Сумма вместе с комиссией</div>
              </Card>
              <LimitCard title="Сегодня" usage={limits.data.daily} color="#007dff" testId="limits-daily" />
              <LimitCard title="В этом месяце" usage={limits.data.monthly} color="#f79009" testId="limits-monthly" />
            </>
          )}
        </div>
      )}

      <Notice tone="info" className="!px-3.5 !py-3 !text-sm !leading-5">
        В лимиты входят переводы другим людям и платежи вместе с комиссией. Переводы между своими счетами и пополнения в
        лимиты не входят.
      </Notice>

      <Card className="overflow-hidden" testId="tariffs">
        <h2 className="px-4 pb-2.5 pt-[18px] text-[17px] font-semibold sm:px-6">Комиссии</h2>
        {tariffs.isPending ? (
          <div className="flex flex-col gap-3 px-6 pb-5">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : tariffs.isError ? (
          <LoadError testId="tariffs-error" message={tariffs.error.message} onRetry={() => tariffs.refetch()} />
        ) : (
          <div className="overflow-x-auto">
            {/* На узком экране колонки «Ограничения» нет — диапазон выводим под названием операции */}
            <table className="w-full border-collapse sm:min-w-[620px]">
              <thead>
                <tr className="text-left text-[13px] text-ink-muted">
                  <th className="px-4 py-2 font-medium sm:px-6">Операция</th>
                  <th className="px-4 py-2 font-medium sm:px-6">Комиссия</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell sm:px-6">Ограничения</th>
                </tr>
              </thead>
              <tbody>
                {tariffs.data.map((t) => {
                  const fee = feeText(t.fee_percent, t.fee_min, "минимум");
                  return (
                    <tr key={t.operation_type} className="shadow-row-top" data-testid={`tariff-row-${t.operation_type}`}>
                      <td className="px-4 py-3 align-top sm:px-6">
                        <span className="font-semibold">{t.title}</span>
                        <span
                          className="mt-0.5 block text-[13px] text-ink-muted sm:hidden"
                          data-testid={`tariff-limits-mobile-${t.operation_type}`}
                        >
                          {limitsText(t)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top sm:px-6" data-testid={`tariff-fee-${t.operation_type}`}>
                        {fee ? <span className="font-semibold text-fee">{fee}</span> : <Badge tone="green">бесплатно</Badge>}
                      </td>
                      <td
                        className="hidden px-4 py-3 align-top text-ink-muted sm:table-cell sm:px-6"
                        data-testid={`tariff-limits-${t.operation_type}`}
                      >
                        {limitsText(t)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}
