import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatMoney } from "@/shared/lib/format";
import { apiErrorMessage } from "@/shared/api/errors";
import { BuySellModal } from "@/features/invest/BuySellModal";
import { CashModal } from "@/features/invest/CashModal";
import {
  Instrument,
  OrderSide,
  downloadOrdersCsv,
  useCancelAllOrders,
  useCancelOrder,
  useDividends,
  useInstruments,
  useOrders,
  usePortfolio,
  useQuotes,
} from "@/features/invest/api";

const CLASS_TABS: { key: string; label: string }[] = [
  { key: "stock", label: "Акции" },
  { key: "bond", label: "Облигации" },
  { key: "fund", label: "Фонды" },
  { key: "fx", label: "Валюта" },
];
const SECTOR_CHIPS: { key: string; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "bank", label: "Банки" },
  { key: "tele", label: "Телеком" },
  { key: "util", label: "ЖКХ" },
  { key: "fin", label: "Финансы" },
];

export function tickerToSlug(t: string): string {
  return t.replace(/\//g, "~");
}

export function InvestTerminalPage() {
  const navigate = useNavigate();
  const { data: portfolio } = usePortfolio();
  const [toast, setToast] = useState<string | null>(null);

  const [buy, setBuy] = useState<{ ticker: string; side: OrderSide } | null>(null);
  const [cash, setCash] = useState<"deposit" | "withdraw" | null>(null);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }

  const plTotal = portfolio ? parseFloat(portfolio.pl_total) : 0;

  return (
    <div className="space-y-3">
      {/* Заголовок + брокерский счёт */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-medium">Инвестиции</h1>
          <div className="text-[12px] text-ink-muted">
            Брокерский счёт{" "}
            <span className="font-mono">{portfolio?.broker_account_number ?? "—"}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn text-[13px]" data-testid="broker-deposit" onClick={() => setCash("deposit")}>
            <i className="ti ti-plus text-sm" aria-hidden="true"></i> Пополнить
          </button>
          <button className="btn text-[13px]" data-testid="broker-withdraw" onClick={() => setCash("withdraw")}>
            <i className="ti ti-arrow-down text-sm" aria-hidden="true"></i> Вывести
          </button>
        </div>
      </div>

      {/* Сводка портфеля — намеренно РАЗНЫЕ форматы одной и той же валюты */}
      <div className="card grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="portfolio-summary">
        <Stat label="Стоимость портфеля" value={formatMoney(portfolio?.total ?? "0", "RUB")} />
        <Stat
          label="Прибыль/убыток"
          value={`${plTotal >= 0 ? "+" : ""}${formatMoney(portfolio?.pl_total ?? "0", "RUB")}`}
          hint={`${portfolio?.pl_total_pct ?? 0} %`}
          tone={plTotal >= 0 ? "up" : "down"}
        />
        <Stat label="Свободно (кэш)" value={`RUB ${portfolio?.cash ?? "0.00"}`} />
        <Stat label="В бумагах" value={`${portfolio?.positions_value ?? "0.00"} RUB`} />
      </div>

      {/* Бегущая строка котировок */}
      <TickerTape onOpen={(t) => navigate(`/invest/instrument/${tickerToSlug(t)}`)} />

      <div className="grid lg:grid-cols-2 gap-3 items-start">
        {/* Левая колонка */}
        <div className="space-y-3">
          <PositionsPanel
            onBuy={(t) => setBuy({ ticker: t, side: "BUY" })}
            onSell={(t) => setBuy({ ticker: t, side: "SELL" })}
            onOpen={(t) => navigate(`/invest/instrument/${tickerToSlug(t)}`)}
          />
          <OrdersPanel onError={flash} />
        </div>

        {/* Правая колонка */}
        <div className="space-y-3">
          <QuotesPanel
            onBuy={(t) => setBuy({ ticker: t, side: "BUY" })}
            onSell={(t) => setBuy({ ticker: t, side: "SELL" })}
            onOpen={(t) => navigate(`/invest/instrument/${tickerToSlug(t)}`)}
          />
          <DividendsPanel />
        </div>
      </div>

      <BuySellModal
        open={!!buy}
        ticker={buy?.ticker ?? null}
        side={buy?.side ?? "BUY"}
        onClose={() => setBuy(null)}
        onDone={flash}
      />
      <CashModal
        open={!!cash}
        mode={cash ?? "deposit"}
        brokerCash={portfolio?.cash ?? "0"}
        onClose={() => setCash(null)}
        onDone={flash}
      />

      {toast && (
        <div className="fixed left-1/2 bottom-6 -translate-x-1/2 z-[120] bg-surface-2 border border-success/50 text-ink-primary px-4 py-2.5 rounded-control text-[13px] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down";
}) {
  const cls = tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "";
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-ink-muted">{label}</div>
      <div className={`text-[16px] font-medium tabular-nums truncate ${cls}`}>{value}</div>
      {hint && <div className={`text-[11px] tabular-nums ${cls}`}>{hint}</div>}
    </div>
  );
}

function TickerTape({ onOpen }: { onOpen: (t: string) => void }) {
  const { data } = useQuotes();
  const items = data?.items ?? [];
  return (
    <div className="card !py-2 overflow-x-auto">
      <div className="flex gap-5 whitespace-nowrap">
        {items.map((q) => {
          const up = q.change_pct >= 0;
          return (
            <button
              key={q.ticker}
              onClick={() => onOpen(q.ticker)}
              className="text-[12px] shrink-0 hover:opacity-80 transition"
            >
              <span className="font-medium">{q.ticker}</span>{" "}
              <span className="tabular-nums">{q.price}</span>{" "}
              <span className={`tabular-nums ${up ? "text-success" : "text-danger"}`}>
                {up ? "+" : ""}
                {q.change_pct}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PositionsPanel({
  onBuy,
  onSell,
  onOpen,
}: {
  onBuy: (t: string) => void;
  onSell: (t: string) => void;
  onOpen: (t: string) => void;
}) {
  const { data: portfolio } = usePortfolio();
  const positions = portfolio?.positions ?? [];
  return (
    <div className="card">
      <PanelHead title="Портфель" count={positions.length} />
      {positions.length === 0 ? (
        <div className="text-[13px] text-ink-muted py-3">Пока нет позиций — купите первую бумагу.</div>
      ) : (
        <div className="divide-y divide-line">
          {positions.map((p) => {
            const up = parseFloat(p.pl) >= 0;
            return (
              <div key={p.ticker} className="py-2.5 flex items-center gap-3">
                <button className="text-left min-w-0 flex-1" onClick={() => onOpen(p.ticker)}>
                  <div className="text-[13px] font-medium truncate">
                    {p.ticker} <span className="text-ink-muted">×{p.quantity}</span>
                  </div>
                  <div className="text-[11px] text-ink-muted truncate">{p.name}</div>
                </button>
                <div className="text-right shrink-0">
                  <div className="text-[13px] font-medium tabular-nums">{formatMoney(p.value, "RUB")}</div>
                  <div className={`text-[11px] tabular-nums ${up ? "text-success" : "text-danger"}`}>
                    {up ? "+" : ""}
                    {p.pl} · {up ? "+" : ""}
                    {p.pl_pct}%
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    className="btn !py-1 !px-2.5 text-[11px] text-success border-success/40"
                    data-testid="invest-buy-btn"
                    onClick={() => onBuy(p.ticker)}
                  >
                    Купить
                  </button>
                  <button
                    className="btn !py-1 !px-2.5 text-[11px] text-danger border-danger/40"
                    data-testid="invest-sell-btn"
                    onClick={() => onSell(p.ticker)}
                  >
                    Продать
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuotesPanel({
  onBuy,
  onSell,
  onOpen,
}: {
  onBuy: (t: string) => void;
  onSell: (t: string) => void;
  onOpen: (t: string) => void;
}) {
  const [cls, setCls] = useState("stock");
  const [sector, setSector] = useState("all");
  const { data: instruments = [] } = useInstruments({ cls, sector: cls === "stock" ? sector : undefined });

  return (
    <div className="card">
      <PanelHead title="Котировки" count={instruments.length} />
      <div className="flex gap-1 border-b border-line mb-2 -mt-1">
        {CLASS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setCls(t.key)}
            className={`px-3 py-1.5 text-[12px] border-b-2 -mb-px transition ${
              cls === t.key
                ? "border-brand-strong text-ink-primary font-medium"
                : "border-transparent text-ink-secondary hover:text-ink-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {cls === "stock" && (
        <div className="flex gap-1.5 flex-wrap mb-2">
          {SECTOR_CHIPS.map((c) => (
            <button
              key={c.key}
              onClick={() => setSector(c.key)}
              className={`text-[11px] px-2.5 py-1 rounded-pill border transition ${
                sector === c.key
                  ? "border-brand bg-brand-soft text-accent"
                  : "border-line text-ink-secondary hover:border-line-strong"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-ink-muted text-left">
              <th className="py-1.5 font-medium">Тикер</th>
              <th className="py-1.5 font-medium text-right">Цена</th>
              <th className="py-1.5 font-medium text-right">Изм.</th>
              <th className="py-1.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {instruments.map((i: Instrument) => {
              const up = i.change_pct >= 0;
              return (
                <tr key={i.ticker} className="border-t border-line hover:bg-fill-hover">
                  <td className="py-1.5">
                    <button className="text-left" onClick={() => onOpen(i.ticker)}>
                      <div className="text-[12px] font-medium">{i.ticker}</div>
                      <div className="text-[10px] text-ink-muted truncate max-w-[120px]">{i.name}</div>
                    </button>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-[12px]">{i.price}</td>
                  <td className={`py-1.5 text-right tabular-nums text-[12px] ${up ? "text-success" : "text-danger"}`}>
                    {up ? "+" : ""}
                    {i.change_pct}%
                  </td>
                  <td className="py-1.5">
                    <div className="flex gap-1 justify-end">
                      <button
                        className="btn !py-0.5 !px-2 text-[11px] text-success border-success/40"
                        data-testid="invest-buy-btn"
                        onClick={() => onBuy(i.ticker)}
                      >
                        Купить
                      </button>
                      <button
                        className="btn !py-0.5 !px-2 text-[11px] text-danger border-danger/40"
                        data-testid="invest-sell-btn"
                        onClick={() => onSell(i.ticker)}
                      >
                        Продать
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrdersPanel({ onError }: { onError: (msg: string) => void }) {
  const { data: orders = [] } = useOrders();
  const cancel = useCancelOrder();
  const cancelAll = useCancelAllOrders();
  const [csvBusy, setCsvBusy] = useState(false);

  const active = orders.filter((o) => o.status === "ACTIVE").length;

  async function exportCsv() {
    setCsvBusy(true);
    try {
      await downloadOrdersCsv();
    } catch (e) {
      onError(apiErrorMessage(e));
    } finally {
      setCsvBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <PanelHead title="Заявки" count={orders.length} inline />
        <div className="flex gap-2">
          <button
            className="text-[11px] text-accent hover:underline disabled:opacity-50"
            onClick={exportCsv}
            disabled={csvBusy}
          >
            {csvBusy ? "Готовим…" : "Экспорт CSV"}
          </button>
          <button
            className="text-[11px] text-danger hover:underline disabled:opacity-40"
            disabled={active === 0 || cancelAll.isPending}
            onClick={() => cancelAll.mutate()}
          >
            Отменить все
          </button>
        </div>
      </div>
      {orders.length === 0 ? (
        <div className="text-[13px] text-ink-muted py-2">Заявок пока нет.</div>
      ) : (
        <div className="divide-y divide-line">
          {orders.map((o) => (
            <div key={o.id} className="py-2 flex items-center gap-2 text-[12px]">
              <span className="font-mono text-ink-muted">№{o.id}</span>
              <span className="font-medium">{o.ticker}</span>
              <span className={o.side === "BUY" ? "text-success" : "text-danger"}>
                {o.side === "BUY" ? "Купить" : "Продать"}
              </span>
              <span className="text-ink-secondary tabular-nums">
                {o.order_type === "MARKET" ? "Рынок" : "Лимит"} · {o.quantity} × {o.price} ₽
              </span>
              <span className="ml-auto">
                <OrderBadge status={o.status} />
              </span>
              {o.status === "ACTIVE" && (
                <button
                  className="text-ink-muted hover:text-danger"
                  title="Отменить заявку"
                  onClick={() => cancel.mutate(o.id)}
                >
                  <i className="ti ti-x" aria-hidden="true"></i>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DividendsPanel() {
  const { data } = useDividends();
  const items = data?.items ?? [];
  return (
    <div className="card">
      <PanelHead title="Дивиденды и купоны" count={items.length} />
      <div className="divide-y divide-line">
        {items.map((d) => (
          <div key={d.ticker} className="py-2 flex items-center justify-between gap-2 text-[12px]">
            <div className="min-w-0">
              <span className="font-medium">{d.ticker}</span>{" "}
              <span className="text-ink-muted truncate">{d.name}</span>
            </div>
            <div className="text-ink-secondary text-right shrink-0">{d.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelHead({
  title,
  count,
  inline,
}: {
  title: string;
  count?: number;
  inline?: boolean;
}) {
  return (
    <div className={inline ? "flex items-center gap-2" : "flex items-center gap-2 mb-2"}>
      <h2 className="text-[14px] font-medium">{title}</h2>
      {count !== undefined && (
        <span className="badge bg-brand-soft text-accent border border-brand/30">{count}</span>
      )}
    </div>
  );
}

function OrderBadge({ status }: { status: "ACTIVE" | "EXECUTED" | "CANCELLED" }) {
  if (status === "ACTIVE") return <span className="badge bg-warning-soft text-warning">Активна</span>;
  if (status === "EXECUTED") return <span className="badge bg-success-soft text-success">Исполнена</span>;
  return <span className="badge bg-fill-control text-ink-secondary">Отменена</span>;
}
