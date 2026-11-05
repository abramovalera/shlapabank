import { Link } from "react-router-dom";
import { useAccounts, useAllOperations, useRecentOperations, useWaitingOperations } from "../../api/hooks";
import { Card, EmptyState, LoadError, RowsSkeleton, Skeleton } from "../../ui/blocks";
import { ButtonLink } from "../../ui/Button";
import { dayKey, formatDay, formatMoney, moneyParts, toCents, toIsoDate } from "../../ui/format";
import { OperationIcon, OperationRow, groupByDay, totals } from "../../ui/operation";
import { PaymentTiles } from "../payments/PaymentTiles";
import { AccountsSection } from "./AccountsSection";
import { CardSection } from "./CardSection";

/** Размер шрифта крупной суммы: чем длиннее число, тем мельче, чтобы не вылезать за карточку. */
function bigMoneySize(int: string): { int: string; rest: string } {
  if (int.length > 13) return { int: "text-[24px] leading-[32px]", rest: "text-lg" };
  if (int.length > 10) return { int: "text-[28px] leading-[36px]", rest: "text-xl" };
  return { int: "text-[34px] leading-[42px]", rest: "text-2xl" };
}

function TotalBalance() {
  const accounts = useAccounts();
  const todayIso = toIsoDate(new Date());
  const today = useAllOperations({ date_from: todayIso, status: "DONE" });
  const total = (accounts.data ?? []).reduce((s, a) => s + toCents(a.balance), 0);
  const parts = moneyParts(total / 100);
  const size = bigMoneySize(parts.int);
  // Чистое изменение за сегодня: поступления − списания с комиссией (только DONE)
  const t = today.data ? totals(today.data.filter((op) => dayKey(op.created_at) === todayIso)) : null;
  const change = t ? t.inc - t.out : 0;

  return (
    <Card className="min-w-0 px-6 py-[22px]">
      <div className="text-[13px] text-ink-muted">Всего на счетах</div>
      {accounts.isPending ? (
        <Skeleton className="mt-2 h-9 w-48" />
      ) : accounts.isError ? (
        <div className="mt-1 text-sm text-danger">Не удалось загрузить баланс</div>
      ) : (
        <div className={`mt-0.5 break-words font-bold tracking-[-0.5px] ${size.int}`} data-testid="home-total-balance">
          {parts.int}
          <span className={`text-ink-faint ${size.rest}`}>{parts.rest}</span>
        </div>
      )}
      {change !== 0 && (
        <div
          className={`mt-1.5 text-[13px] font-medium ${change > 0 ? "text-success" : "text-ink-muted"}`}
          data-testid="home-income-today"
          data-sign={change > 0 ? "plus" : "minus"}
        >
          {formatMoney(change / 100, { sign: change > 0 ? "+" : "-", compact: true })} за сегодня
        </div>
      )}
    </Card>
  );
}

function HomeTiles() {
  return (
    <section>
      <h2 className="mb-3 text-[17px] font-semibold">Платежи и переводы</h2>
      <PaymentTiles />
    </section>
  );
}

/**
 * Операции, которые ждут кода из SMS (например, страницу обновили на шаге ввода кода).
 * Нет таких — блока нет. После подтверждения/отмены список обновляется (invalidate операций).
 */
function WaitingOperations() {
  const waiting = useWaitingOperations();
  const items = waiting.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <Card className="py-2" testId="home-waiting">
      <div className="px-4 pb-1.5 pt-3 sm:px-6">
        <h2 className="text-[17px] font-semibold">Ждут подтверждения</h2>
        <div className="mt-0.5 text-[13px] text-ink-muted">Деньги не списаны, пока вы не введёте код из SMS</div>
      </div>
      {items.map((op) => (
        <div
          key={op.id}
          className="flex items-center gap-3 px-4 py-2.5 sm:px-6"
          data-testid="home-waiting-item"
          data-operation-id={op.id}
        >
          <OperationIcon op={op} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold" data-testid="home-waiting-title">
              {op.title}
            </span>
            {op.subtitle && <span className="block truncate text-[13px] text-ink-muted">{op.subtitle}</span>}
          </span>
          {/* На узком экране сумма над кнопкой — названию остаётся место */}
          <span className="flex flex-none flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="whitespace-nowrap font-semibold" data-testid="home-waiting-amount">
              {formatMoney(op.total)}
            </span>
            <ButtonLink to={`/operations/${op.id}`} size="sm" data-testid="home-waiting-enter-code">
              Ввести код
            </ButtonLink>
          </span>
        </div>
      ))}
    </Card>
  );
}

function RecentOperations() {
  const recent = useRecentOperations(5);
  const groups = groupByDay(recent.data?.items ?? []);
  return (
    <Card className="py-2" testId="home-recent">
      <div className="flex items-baseline justify-between px-4 pb-1.5 pt-3 sm:px-6">
        <h2 className="text-[17px] font-semibold">Последние операции</h2>
        <Link to="/history" data-testid="home-history-link" className="font-medium">
          Вся история
        </Link>
      </div>
      {recent.isPending ? (
        <RowsSkeleton rows={4} testId="home-recent-loading" />
      ) : recent.isError ? (
        <LoadError testId="home-recent-error" message={recent.error.message} onRetry={() => recent.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          testId="home-recent-empty"
          title="Операций пока нет"
          text="Пополните счёт с карты другого банка, чтобы начать пользоваться счётом."
          action={
            <ButtonLink to="/topup" size="sm" data-testid="home-recent-empty-topup">
              Пополнить счёт
            </ButtonLink>
          }
        />
      ) : (
        groups.map((g, gi) => (
          <div key={g.key}>
            <div className={`px-4 pb-0.5 text-[13px] font-medium text-ink-faint sm:px-6 ${gi === 0 ? "pt-1.5" : "pt-2.5"}`}>
              {formatDay(g.iso)}
            </div>
            {g.items.map((op, i) => (
              <OperationRow key={op.id} op={op} last={gi === groups.length - 1 && i === g.items.length - 1} />
            ))}
          </div>
        ))
      )}
    </Card>
  );
}

export function HomePage() {
  return (
    <main className="mx-auto flex max-w-page flex-wrap items-start gap-6 px-4 py-7 sm:px-6">
      <div className="flex min-w-0 max-w-full flex-[1_1_340px] flex-col gap-4 lg:max-w-[380px]">
        <TotalBalance />
        <AccountsSection />
        <CardSection />
      </div>
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
        <HomeTiles />
        <WaitingOperations />
        <RecentOperations />
      </div>
    </main>
  );
}
