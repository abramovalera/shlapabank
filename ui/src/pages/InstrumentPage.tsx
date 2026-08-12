import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatMoney } from "@/shared/lib/format";
import { BuySellModal } from "@/features/invest/BuySellModal";
import { OrderBook, PriceChart } from "@/features/invest/widgets";
import { OrderSide, useInstrument } from "@/features/invest/api";

const CLASS_LABELS: Record<string, string> = {
  stock: "Акция",
  bond: "Облигация",
  fund: "Биржевой фонд",
  fx: "Валютная пара",
};
const SECTOR_LABELS: Record<string, string> = {
  bank: "Банки",
  tele: "Телеком",
  util: "ЖКХ",
  fin: "Финансы",
  fx: "Валюта",
};

const TABS = ["overview", "orderbook", "dividends", "about"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: "Обзор",
  orderbook: "Стакан",
  dividends: "Дивиденды",
  about: "О бумаге",
};

export function InstrumentPage() {
  const navigate = useNavigate();
  const { ticker: slug } = useParams<{ ticker: string }>();
  const ticker = (slug ?? "").replace(/~/g, "/");
  const { data: instr, isLoading, isError } = useInstrument(ticker);
  const [tab, setTab] = useState<Tab>("overview");
  const [order, setOrder] = useState<OrderSide | null>(null);

  if (isLoading) {
    return <div className="card text-ink-muted text-sm">Загрузка инструмента…</div>;
  }
  if (isError || !instr) {
    return (
      <div className="card space-y-3">
        <div className="text-sm text-ink-secondary">Инструмент не найден.</div>
        <button className="btn text-[13px]" onClick={() => navigate("/invest")}>
          ← К терминалу
        </button>
      </div>
    );
  }

  const up = instr.change_pct >= 0;

  return (
    <div className="space-y-3">
      <button
        className="text-[12px] text-ink-secondary hover:text-ink-primary flex items-center gap-1"
        onClick={() => navigate("/invest")}
      >
        <i className="ti ti-chevron-left" aria-hidden="true"></i> К терминалу
      </button>

      {/* Шапка инструмента */}
      <div className="card flex items-center gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[18px] font-medium">
            {instr.ticker} <span className="text-ink-muted text-[14px]">· {instr.name}</span>
          </div>
          <div className="text-[11px] text-ink-muted">
            {CLASS_LABELS[instr.cls]} · {SECTOR_LABELS[instr.sector] ?? instr.sector} · лот {instr.lot} шт ·
            ISIN {instr.isin}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[20px] font-medium tabular-nums">{instr.price} ₽</div>
          <div className={`text-[12px] tabular-nums ${up ? "text-success" : "text-danger"}`}>
            {up ? "+" : ""}
            {instr.change} ₽ · {up ? "+" : ""}
            {instr.change_pct}%
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-primary text-[13px]"
            data-testid="invest-buy-btn"
            onClick={() => setOrder("BUY")}
          >
            Купить
          </button>
          <button
            className="btn text-[13px] text-danger border-danger/40"
            data-testid="invest-sell-btn"
            onClick={() => setOrder("SELL")}
            disabled={instr.position_qty <= 0}
            title={instr.position_qty <= 0 ? "Нет бумаг для продажи" : undefined}
          >
            Продать
          </button>
        </div>
      </div>

      {/* Позиция (если есть) */}
      {instr.position_qty > 0 && (
        <div className="card-nested flex items-center justify-between text-[12px]">
          <span className="text-ink-secondary">
            В портфеле: <span className="text-money">{instr.position_qty} шт</span> · средняя{" "}
            {instr.position_avg_price} ₽
          </span>
          <span className="text-ink-secondary">
            Оценка: {formatMoney(parseFloat(instr.price) * instr.position_qty, "RUB")}
          </span>
        </div>
      )}

      {/* Вкладки */}
      <div className="card">
        <div className="flex gap-1 border-b border-line mb-3">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-[13px] border-b-2 -mb-px transition ${
                tab === t
                  ? "border-brand-strong text-ink-primary font-medium"
                  : "border-transparent text-ink-secondary hover:text-ink-primary"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div>
            <PriceChart series={instr.series} up={up} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
              <Fact k="Открытие" v={`${instr.open} ₽`} />
              <Fact k="Максимум" v={`${instr.high} ₽`} />
              <Fact k="Минимум" v={`${instr.low} ₽`} />
              <Fact k="Объём" v={`${instr.volume.toLocaleString("ru-RU")} шт`} />
              <Fact k="Лот" v={`${instr.lot} шт`} />
              <Fact k="Валюта" v={instr.currency} />
            </div>
          </div>
        )}

        {tab === "orderbook" && <OrderBook ticker={ticker} />}

        {tab === "dividends" && (
          <div className="text-[13px] space-y-2">
            {instr.dividend ? (
              <Fact k="Дивиденд" v={`${instr.dividend} ₽ на бумагу (в год)`} />
            ) : instr.coupon ? (
              <>
                <Fact k="Купон" v={`${instr.coupon}% годовых`} />
                {instr.maturity && <Fact k="Погашение" v={instr.maturity} />}
              </>
            ) : (
              <div className="text-ink-muted">По этой бумаге выплат не предусмотрено.</div>
            )}
          </div>
        )}

        {tab === "about" && (
          <div className="text-[13px] text-ink-secondary space-y-2">
            <Fact k="Название" v={instr.name} />
            <Fact k="Тип" v={CLASS_LABELS[instr.cls]} />
            <Fact k="Сектор" v={SECTOR_LABELS[instr.sector] ?? instr.sector} />
            <Fact k="ISIN" v={instr.isin} />
            <p className="text-[12px] text-ink-muted pt-1">
              Учебный инструмент ShlapaBank. Цены — детерминированный симулятор рынка, реальным котировкам
              не соответствуют.
            </p>
          </div>
        )}
      </div>

      <BuySellModal
        open={!!order}
        ticker={ticker}
        side={order ?? "BUY"}
        onClose={() => setOrder(null)}
      />
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between sm:block gap-2">
      <div className="text-[11px] text-ink-muted">{k}</div>
      <div className="text-[13px] font-medium tabular-nums">{v}</div>
    </div>
  );
}
