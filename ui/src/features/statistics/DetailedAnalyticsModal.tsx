import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Modal } from "@/shared/ui/Modal";
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
  spent: string;
  categories: Category[];
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
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Разбивка расходов по категориям за выбранный месяц — общая статистика, без привязки к какому-либо лимиту. */
export function DetailedAnalyticsModal({ open, onClose }: Props) {
  // 0 — текущий месяц, -1 — предыдущий и т.д. Вперёд дальше текущего уйти нельзя.
  const [monthOffset, setMonthOffset] = useState(0);

  useEffect(() => {
    if (open) setMonthOffset(0);
  }, [open]);

  const target = new Date();
  target.setDate(1); // чтобы не перескочить месяц из-за разной длины
  target.setMonth(target.getMonth() + monthOffset);
  const year = target.getFullYear();
  const month = target.getMonth() + 1;

  const { data } = useQuery({
    queryKey: ["statistics", "monthly", year, month],
    queryFn: async (): Promise<MonthlyStats> =>
      (await api.get("/statistics/monthly", { params: { year, month } })).data,
    enabled: open,
  });

  const monthLabel = data
    ? (() => {
        const [y, m] = data.period.split("-").map((x) => parseInt(x, 10));
        return `${MONTH_LABELS[m - 1]} ${y}`;
      })()
    : `${MONTH_LABELS[month - 1]} ${year}`;

  const total = data ? parseFloat(data.spent) : 0;
  const slices = (data?.categories ?? []).map((c) => ({
    key: c.key,
    value: parseFloat(c.amount),
    color: CATEGORY_COLORS[c.key] ?? "#888780",
  }));

  return (
    <Modal open={open} onClose={onClose} title="Подробная аналитика" maxWidth={380}>
      <div className="flex items-center justify-between mb-4" data-testid="analytics-month-switcher">
        <button
          type="button"
          onClick={() => setMonthOffset((o) => o - 1)}
          className="w-8 h-8 rounded-control flex items-center justify-center text-ink-secondary hover:bg-fill-hover hover:text-ink-primary transition"
          aria-label="Предыдущий месяц"
          data-testid="analytics-month-prev"
        >
          <i className="ti ti-chevron-left text-lg" aria-hidden="true"></i>
        </button>
        <div className="text-[14px] font-medium">{monthLabel}</div>
        <button
          type="button"
          onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}
          disabled={monthOffset >= 0}
          className="w-8 h-8 rounded-control flex items-center justify-center text-ink-secondary hover:bg-fill-hover hover:text-ink-primary transition disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Следующий месяц"
          data-testid="analytics-month-next"
        >
          <i className="ti ti-chevron-right text-lg" aria-hidden="true"></i>
        </button>
      </div>

      {!data ? (
        <div className="text-xs text-ink-muted text-center py-8">Загружаем…</div>
      ) : slices.length === 0 ? (
        <div className="text-center py-6">
          <DonutChart
            slices={[{ key: "empty", value: 1, color: "rgba(15, 23, 42, 0.08)" }]}
            size={160}
            centerLabel={formatMoney(0, data.currency)}
          />
          <div className="text-xs text-ink-muted mt-3">Расходов в этом месяце нет</div>
        </div>
      ) : (
        <>
          <div className="flex justify-center mb-4">
            <DonutChart
              slices={slices}
              size={160}
              centerLabel={formatMoney(data.spent, data.currency)}
              centerSubLabel="Потрачено"
            />
          </div>
          <ul className="flex flex-col gap-2" data-testid="analytics-category-list">
            {data.categories.map((c) => {
              const pct = total > 0 ? Math.round((parseFloat(c.amount) / total) * 100) : 0;
              return (
                <li
                  key={c.key}
                  className="flex justify-between items-center text-[13px]"
                  data-testid={`analytics-category-${c.key}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                      style={{ background: CATEGORY_COLORS[c.key] ?? "#888780" }}
                    />
                    <span className="text-ink-primary">{c.label}</span>
                    <span className="text-[11px] text-ink-muted">{pct}%</span>
                  </div>
                  <span className="text-ink-secondary font-mono">
                    {formatMoney(c.amount, data.currency)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="text-[13px] font-medium mt-3 pt-3 border-t border-line flex justify-between">
            <span>Итого за месяц</span>
            <span>{formatMoney(data.spent, data.currency)}</span>
          </div>
        </>
      )}
    </Modal>
  );
}
