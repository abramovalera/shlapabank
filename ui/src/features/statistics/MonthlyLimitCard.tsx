import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { DonutChart } from "./DonutChart";
import { formatMoney } from "@/shared/lib/format";

interface Category {
  key: string;
  label: string;
  amount: string;
}

interface MonthlyStats {
  period: string;
  currency: string;
  limit: string;
  spent: string;
  percent: number;
  categories: Category[];
}

// Палитра для категорий — стабильна для одного и того же ключа.
// Палитра Halo. Категория → цвет из акцентных.
const CATEGORY_COLORS: Record<string, string> = {
  utilities: "#F5D547",   // amber
  mobile: "#3DD7E5",      // cyan
  internet_tv: "#2BE08C", // green
  education: "#7F8AFF",   // indigo
  charity: "#FF5A75",     // red-pink
  transfers: "#F7DE6E",   // pale amber
  other: "rgba(242,244,248,0.4)",
};

const STORAGE_KEY = "sb_monthly_limit_collapsed";

export function MonthlyLimitCard() {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) === "1"
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const { data, isLoading } = useQuery({
    queryKey: ["statistics", "monthly"],
    queryFn: async (): Promise<MonthlyStats> =>
      (await api.get("/statistics/monthly")).data,
  });

  const slices = (data?.categories ?? []).map((c) => ({
    key: c.key,
    value: parseFloat(c.amount),
    color: CATEGORY_COLORS[c.key] ?? "#888780",
  }));

  return (
    <section className="card" data-testid="monthly-limit-card">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex justify-between items-center text-left"
        data-testid="monthly-limit-toggle"
        aria-expanded={!collapsed}
      >
        <div className="flex items-baseline gap-2">
          <div className="text-[15px] font-medium">Лимит на месяц</div>
          {data && <div className="text-xs text-ink-secondary">{data.percent}%</div>}
        </div>
        <i
          className={`ti ti-chevron-${collapsed ? "down" : "up"} text-base text-ink-secondary transition-transform`}
          aria-hidden="true"
        ></i>
      </button>

      {collapsed ? (
        <div className="mt-2.5">
          <div className="h-1.5 bg-fill-control rounded overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${data?.percent ?? 0}%`,
                background:
                  (data?.percent ?? 0) >= 90
                    ? "#FF3A5C"
                    : (data?.percent ?? 0) >= 70
                    ? "#F5D547"
                    : "#5B6BFF",
              }}
            />
          </div>
          <div className="text-xs text-ink-muted mt-1.5">
            {data
              ? `${formatMoney(data.spent, data.currency)} из ${formatMoney(data.limit, data.currency)}`
              : "…"}
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {isLoading ? (
            <div className="text-xs text-ink-muted text-center py-6">Загружаем…</div>
          ) : slices.length === 0 ? (
            <div className="text-center py-4">
              <DonutChart
                slices={[{ key: "empty", value: 1, color: "rgba(15, 23, 42, 0.08)" }]}
                size={140}
                centerLabel={data ? `${data.percent}%` : "0%"}
                centerSubLabel={data ? formatMoney(data.limit, data.currency) : undefined}
              />
              <div className="text-xs text-ink-muted mt-2">
                Расходов в этом месяце пока нет
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-center">
                <DonutChart
                  slices={slices}
                  size={140}
                  centerLabel={data ? `${data.percent}%` : ""}
                  centerSubLabel={
                    data ? formatMoney(data.spent, data.currency) : undefined
                  }
                />
              </div>
              <ul className="mt-3 flex flex-col gap-1.5" data-testid="monthly-limit-legend">
                {data!.categories.map((c) => (
                  <li
                    key={c.key}
                    className="flex justify-between items-center text-xs"
                    data-testid={`monthly-category-${c.key}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ background: CATEGORY_COLORS[c.key] ?? "#888780" }}
                      />
                      <span className="text-ink-primary">{c.label}</span>
                    </div>
                    <span className="text-ink-secondary font-mono">
                      {formatMoney(c.amount, data!.currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="text-xs text-ink-muted mt-3 pt-2.5 border-t border-line">
                Лимит: {formatMoney(data!.limit, data!.currency)}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
