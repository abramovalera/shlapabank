import { useEffect, useRef } from "react";
import { useOrderbook } from "./api";

/** Стакан заявок: живой (перерисовывается на каждом обновлении), без стабильных id у строк. */
export function OrderBook({ ticker }: { ticker: string }) {
  const { data, isLoading } = useOrderbook(ticker);
  if (isLoading || !data) {
    return <div className="text-[12px] text-ink-muted py-4 text-center">Загрузка стакана…</div>;
  }
  const maxQty = Math.max(
    1,
    ...data.bids.map((b) => b.qty),
    ...data.asks.map((a) => a.qty)
  );

  return (
    <div data-testid="orderbook">
      <div className="grid grid-cols-2 text-[10px] uppercase tracking-wide text-ink-muted px-1 mb-1">
        <span>Bid · покупка</span>
        <span className="text-right">Ask · продажа</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3">
        <div className="flex flex-col gap-0.5">
          {data.bids.map((b, i) => (
            <div key={i} className="relative flex justify-between items-center px-1.5 py-0.5 text-[12px]">
              <span
                className="absolute inset-y-0 right-0 rounded-sm"
                style={{ width: `${(b.qty / maxQty) * 100}%`, background: "rgba(43,224,140,0.14)" }}
              />
              <span className="relative text-success font-medium tabular-nums">{b.price}</span>
              <span className="relative text-ink-secondary tabular-nums">{b.qty.toLocaleString("ru-RU")}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-0.5">
          {data.asks.map((a, i) => (
            <div key={i} className="relative flex justify-between items-center px-1.5 py-0.5 text-[12px]">
              <span
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{ width: `${(a.qty / maxQty) * 100}%`, background: "rgba(255,90,117,0.14)" }}
              />
              <span className="relative text-ink-secondary tabular-nums">{a.qty.toLocaleString("ru-RU")}</span>
              <span className="relative text-danger font-medium tabular-nums">{a.price}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-ink-muted text-center mt-2">спред ≈ {data.spread} ₽</div>
    </div>
  );
}

/** Мини-график цены по внутридневному ряду. */
export function PriceChart({ series, up }: { series: string[]; up: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const pts = series.map((s) => parseFloat(s)).filter((n) => !Number.isNaN(n));
    if (pts.length < 2) return;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const pad = 8;
    const span = max - min || 1;
    const x = (i: number) => (i / (pts.length - 1)) * W;
    const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);

    // сетка
    ctx.strokeStyle = "rgba(148,166,205,0.14)";
    ctx.lineWidth = 1;
    for (let g = 1; g < 4; g++) {
      ctx.beginPath();
      ctx.moveTo(0, (H / 4) * g);
      ctx.lineTo(W, (H / 4) * g);
      ctx.stroke();
    }

    const stroke = up ? "#33C173" : "#ED5F73";
    const fill = up ? "rgba(51,193,115,0.18)" : "rgba(237,95,115,0.16)";

    ctx.beginPath();
    ctx.moveTo(0, H);
    pts.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    pts.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    const lastX = x(pts.length - 1);
    const lastY = y(pts[pts.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = stroke;
    ctx.fill();
  }, [series, up]);

  return <canvas ref={ref} className="w-full" style={{ height: 140, display: "block" }} />;
}
