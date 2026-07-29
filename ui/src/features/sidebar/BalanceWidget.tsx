import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Account, Currency } from "@/shared/api/types";
import { formatMoney, currencySymbol } from "@/shared/lib/format";

const CURRENCY_ORDER: Currency[] = ["RUB", "USD", "EUR", "CNY"];

/**
 * Верхняя плашка сайдбара:
 *  - Сумма всех балансов в выбранной валюте (переключается стрелками, свайпом или точками)
 *  - Кнопка скрыть/показать
 * Показываются только валюты, где есть хотя бы один счёт.
 */
export function BalanceWidget() {
  const [hidden, setHidden] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => (await api.get("/accounts")).data,
  });

  // Валюты, где у пользователя есть счета — в фиксированном порядке.
  const currencies = useMemo(() => {
    const set = new Set(accounts.map((a) => a.currency));
    return CURRENCY_ORDER.filter((c) => set.has(c));
  }, [accounts]);

  const [idx, setIdx] = useState(0);
  const active = currencies[idx] ?? "RUB";

  const total = accounts
    .filter((a) => a.currency === active)
    .reduce((s, a) => s + parseFloat(a.balance), 0);

  const canSwitch = currencies.length > 1;

  function prev() {
    setIdx((i) => (i - 1 + currencies.length) % currencies.length);
  }
  function next() {
    setIdx((i) => (i + 1) % currencies.length);
  }

  // Свайп (touch): фиксируем startX, при отпускании — направление
  const touchStartX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) next();
    else prev();
  }

  return (
    <div className="sidebar-block" data-testid="sidebar-balance">
      <div className="flex justify-between items-center mb-1.5">
        <div className="text-[12px] text-ink-secondary flex items-center gap-1.5">
          Всего средств
          <span className="text-ink-muted">·</span>
          <span className="font-mono text-ink-primary">{active}</span>
        </div>
        <button
          onClick={() => setHidden((v) => !v)}
          aria-label={hidden ? "Показать сумму" : "Скрыть сумму"}
          className="text-ink-muted hover:text-ink-primary transition"
          data-testid="sidebar-balance-toggle"
        >
          <i className={`ti ti-${hidden ? "eye-off" : "eye"} text-sm`} aria-hidden="true"></i>
        </button>
      </div>

      <div
        className="flex items-center justify-between gap-2"
        onTouchStart={canSwitch ? onTouchStart : undefined}
        onTouchEnd={canSwitch ? onTouchEnd : undefined}
      >
        {canSwitch && (
          <button
            onClick={prev}
            aria-label="Другая валюта"
            data-testid="balance-prev-btn"
            className="w-6 h-6 rounded-full flex items-center justify-center text-ink-muted hover:text-ink-primary hover:bg-fill-hover transition"
          >
            <i className="ti ti-chevron-left text-sm" aria-hidden="true"></i>
          </button>
        )}
        <div
          key={active}
          className="flex-1 text-center text-[22px] font-medium tracking-tight fade-up"
          style={{ animationDuration: "0.35s" }}
          data-testid="sidebar-balance-value"
        >
          {hidden
            ? `${currencySymbol(active)} ••• •••`
            : formatMoney(total, active)}
        </div>
        {canSwitch && (
          <button
            onClick={next}
            aria-label="Другая валюта"
            data-testid="balance-next-btn"
            className="w-6 h-6 rounded-full flex items-center justify-center text-ink-muted hover:text-ink-primary hover:bg-fill-hover transition"
          >
            <i className="ti ti-chevron-right text-sm" aria-hidden="true"></i>
          </button>
        )}
      </div>

      {canSwitch && (
        <div className="flex justify-center gap-1.5 mt-2" data-testid="balance-dots">
          {currencies.map((c, i) => (
            <button
              key={c}
              onClick={() => setIdx(i)}
              aria-label={`Показать ${c}`}
              data-testid={`balance-dot-${c}`}
              className={`transition-all ${
                i === idx
                  ? "w-4 h-1 rounded-pill bg-brand-strong"
                  : "w-1 h-1 rounded-full bg-line-strong hover:bg-ink-muted"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
