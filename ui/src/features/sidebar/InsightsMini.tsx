import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { formatMoney } from "@/shared/lib/format";
import { DonutChart } from "@/features/statistics/DonutChart";
import { DetailedAnalyticsModal } from "@/features/statistics/DetailedAnalyticsModal";

interface MonthlyStats {
  period: string;
  currency: string;
  spent: string;
  categories: { key: string; label: string; amount: string }[];
}

const CATEGORY_COLORS: Record<string, string> = {
  utilities: "#F5D547",
  mobile: "#3DD7E5",
  internet_tv: "#2BE08C",
  education: "#7F8AFF",
  charity: "#FF5A75",
  transfers: "#F7DE6E",
  other: "rgba(242,244,248,0.4)",
};

const MONTH_LABELS = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

/**
 * Компактный виджет статистики для сайдбара: мини-донат по категориям
 * расходов + топ-2 категории + ссылка на подробную аналитику (модалка).
 * Общая статистика трат — без привязки к какому-либо лимиту (его в
 * проекте нет, показывать «из N ₽» было бы вводящим в заблуждение).
 */
export function InsightsMini() {
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["statistics", "monthly"],
    queryFn: async (): Promise<MonthlyStats> => (await api.get("/statistics/monthly")).data,
  });

  const monthLabel = data
    ? (() => {
        const [y, m] = data.period.split("-").map((x) => parseInt(x, 10));
        return `${MONTH_LABELS[m - 1]} ${y}`;
      })()
    : "";

  const slices = (data?.categories ?? []).map((c) => ({
    key: c.key,
    value: parseFloat(c.amount),
    color: CATEGORY_COLORS[c.key] ?? "#888780",
  }));

  const topCategories = (data?.categories ?? []).slice(0, 2);

  return (
    <div className="sidebar-block">
      <div className="flex justify-between items-center mb-3">
        <div className="text-[14px] font-medium">Инсайты</div>
        <span className="text-[11px] text-ink-muted">{monthLabel}</span>
      </div>

      <div className="flex items-center gap-3 mb-2.5">
        <div className="shrink-0">
          <DonutChart
            slices={slices.length > 0 ? slices : [{ key: "empty", value: 1, color: "rgba(242,244,248,0.08)" }]}
            size={60}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-ink-secondary">Потрачено в этом месяце</div>
          <div className="text-[15px] font-medium">
            {data ? formatMoney(data.spent, data.currency) : "—"}
          </div>
        </div>
      </div>

      {topCategories.length > 0 && (
        <div className="flex flex-col gap-1.5 text-[12px]">
          {topCategories.map((c) => (
            <div key={c.key} className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ background: CATEGORY_COLORS[c.key] ?? "#888" }}
                ></span>
                <span>{c.label}</span>
              </div>
              <span className="text-ink-secondary font-mono">
                {formatMoney(c.amount, data!.currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setAnalyticsOpen(true)}
        className="w-full mt-3 py-1.5 text-[12px] text-accent hover:underline"
      >
        Подробная аналитика →
      </button>

      <DetailedAnalyticsModal open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} />
    </div>
  );
}
