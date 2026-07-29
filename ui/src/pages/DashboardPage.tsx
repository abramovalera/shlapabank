import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { Transaction } from "@/shared/api/types";
import { PromoCarousel } from "@/features/promo/PromoCarousel";
import { formatMoney, formatRelativeDate, formatTime } from "@/shared/lib/format";
import { presentTransaction } from "@/features/history/txPresenter";
import { TransactionDetailsModal } from "@/features/history/TransactionDetailsModal";
import { GlobalSearch } from "@/features/search/GlobalSearch";

const QUICK_TILES = [
  { icon: "phone", label: "По номеру телефона", to: "/transfers/by-phone", primary: true, testId: "qt-by-phone" },
  { icon: "credit-card", label: "По номеру карты", to: "/transfers/by-card", testId: "qt-by-card" },
  { icon: "arrows-exchange", label: "Между своими", to: "/transfers", testId: "qt-own" },
  { icon: "currency-dollar", label: "Обмен валют", to: "/transfers/exchange", testId: "qt-exchange" },
  { icon: "device-mobile", label: "Мобильная связь", to: "/payments/mobile", testId: "qt-mobile" },
  { icon: "home", label: "ЖКХ и поставщики", to: "/payments/utility", testId: "qt-utilities" },
  { icon: "refresh", label: "Автоплатежи", to: "/payments", testId: "qt-autopay" },
];

/** Главная страница — правая колонка. Сайдбар слева живёт в AppLayout. */
export function DashboardPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Transaction | null>(null);

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: async (): Promise<Transaction[]> => (await api.get("/transactions")).data,
  });

  const recent = transactions.slice(0, 4);

  return (
    <div className="space-y-4">
      <GlobalSearch />

      <PromoCarousel />

      <section>
        <div className="flex justify-between items-center mb-3">
          <div className="text-[16px] font-medium">Платежи и переводы</div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {QUICK_TILES.map((t) => (
            <button
              key={t.testId}
              onClick={() => navigate(t.to)}
              className="card flex items-center gap-3 hover:bg-surface-2 transition text-left"
              data-testid={t.testId}
            >
              <i
                className={`ti ti-${t.icon} text-[22px] ${t.primary ? "text-accent" : "text-ink-secondary"}`}
                aria-hidden="true"
              ></i>
              <span className="text-[14px]">{t.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex justify-between items-center mb-3">
          <div className="text-[16px] font-medium">Последние операции</div>
          <button
            onClick={() => navigate("/history")}
            className="text-[13px] text-accent hover:underline"
            data-testid="recent-see-all"
          >
            Смотреть все →
          </button>
        </div>
        <div className="card p-0 overflow-hidden">
          {recent.length === 0 ? (
            <div className="text-[13px] text-ink-muted text-center py-8">
              Операций пока нет
            </div>
          ) : (
            recent.map((tx, i) => (
              <TxRow
                key={tx.id}
                tx={tx}
                isLast={i === recent.length - 1}
                onClick={() => setSelected(tx)}
              />
            ))
          )}
        </div>
      </section>

      <TransactionDetailsModal tx={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function TxRow({
  tx,
  isLast,
  onClick,
}: {
  tx: Transaction;
  isLast: boolean;
  onClick: () => void;
}) {
  const p = presentTransaction(tx);
  return (
    <button
      onClick={onClick}
      className={`w-full flex justify-between items-center px-4 py-3 hover:bg-surface-2 transition text-left ${
        isLast ? "" : "border-b border-line"
      }`}
      data-testid={`dashboard-tx-${tx.id}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: p.bgColor, color: p.color }}
        >
          <i className={`ti ti-${p.icon} text-[15px]`} aria-hidden="true"></i>
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-medium truncate">{p.title}</div>
          <div className="text-[11px] text-ink-muted truncate">
            {formatRelativeDate(tx.created_at)} · {formatTime(tx.created_at)}
          </div>
        </div>
      </div>
      <div className={`text-[13px] shrink-0 ml-2 ${p.isIncoming ? "text-success" : ""}`}>
        {p.amountLabel}
      </div>
    </button>
  );
}
