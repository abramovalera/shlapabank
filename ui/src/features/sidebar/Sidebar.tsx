import { BalanceWidget } from "./BalanceWidget";
import { AccountsBlock } from "./AccountsBlock";
import { InsightsMini } from "./InsightsMini";

/**
 * Статичный левый сайдбар. Рендерится один раз в AppLayout, при переключении
 * вкладок не перерисовывается — данные подтягиваются через React Query кэш.
 */
export function Sidebar() {
  return (
    <aside
      className="flex flex-col gap-2.5 w-[300px] shrink-0 self-start sticky top-4"
    >
      <BalanceWidget />
      <AccountsBlock />
      <InsightsMini />
    </aside>
  );
}
