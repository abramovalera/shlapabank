import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/shared/ui/Modal";
import { OtpConfirm } from "@/features/transfers/OtpConfirm";
import { formatMoney } from "@/shared/lib/format";
import { apiErrorMessage } from "@/shared/api/errors";
import {
  OrderKind,
  OrderSide,
  useCreateOrder,
  useInstrument,
  usePortfolio,
} from "./api";

interface Props {
  open: boolean;
  onClose: () => void;
  ticker: string | null;
  side: OrderSide;
  onDone?: (msg: string) => void;
}

const FEE_RATE = 0.003;

/**
 * Покупка/продажа инструмента: 3 шага — параметры → подтверждение → OTP.
 * Цена берётся живой из карточки инструмента, комиссия 0,3 %.
 */
export function BuySellModal({ open, onClose, ticker, side, onDone }: Props) {
  const { data: instr } = useInstrument(open && ticker ? ticker : undefined);
  const { data: portfolio } = usePortfolio();
  const createOrder = useCreateOrder();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<OrderKind>("MARKET");
  const [qty, setQty] = useState<string>("");
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const lot = instr?.lot ?? 1;
  const market = instr ? parseFloat(instr.price) : 0;
  const heldQty = instr?.position_qty ?? 0;
  const cash = portfolio ? parseFloat(portfolio.cash) : 0;

  // Сброс при открытии/смене инструмента.
  useEffect(() => {
    if (open) {
      setStep(1);
      setKind("MARKET");
      setQty(String(lot));
      setLimitPrice(instr ? instr.price : "");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticker]);

  const qtyNum = parseInt(qty || "0", 10) || 0;
  const priceNum = kind === "LIMIT" ? parseFloat(limitPrice || "0") || 0 : market;
  const amount = qtyNum * priceNum;
  const fee = amount * FEE_RATE;
  const totalBuy = amount + fee;
  const totalSell = amount - fee;

  const lotOk = qtyNum > 0 && qtyNum % lot === 0;
  // Бэкенд проверяет средства (BUY) и наличие бумаг (SELL) при создании заявки —
  // и для рыночных, и для лимитных. Гейтим одинаково, чтобы не ловить 400 на OTP-шаге.
  const fundsOk = side === "BUY" ? totalBuy <= cash : qtyNum <= heldQty;
  const priceOk = kind === "MARKET" || priceNum > 0;
  const canContinue = !!instr && lotOk && priceOk && fundsOk;

  const title = side === "BUY" ? "Покупка" : "Продажа";

  function submitOrder(code: string): Promise<void> {
    setError(null);
    return createOrder
      .mutateAsync({
        ticker: ticker!,
        side,
        order_type: kind,
        quantity: qtyNum,
        price: kind === "LIMIT" ? String(priceNum) : undefined,
        otp_code: code,
      })
      .then((order) => {
        const done =
          order.status === "EXECUTED"
            ? `${title} исполнена: ${qtyNum} ${ticker} по ${formatMoney(
                order.executed_price ?? order.price,
                "RUB"
              )}`
            : `Лимитная заявка выставлена: ${qtyNum} ${ticker} по ${formatMoney(order.price, "RUB")}`;
        onDone?.(done);
        onClose();
      })
      .catch((e) => {
        setError(apiErrorMessage(e));
        throw e;
      });
  }

  const lotHint = useMemo(
    () => (lot > 1 ? `1 лот = ${lot} шт — количество кратно ${lot}` : "любое количество ≥ 1"),
    [lot]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${title} · ${ticker ?? ""}`}
      subtitle={instr ? instr.name : "Загружаем инструмент…"}
      maxWidth={440}
    >
      {!instr ? (
        <div className="text-sm text-ink-muted py-6 text-center">Загрузка…</div>
      ) : step === 1 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            <TypeBtn active={kind === "MARKET"} onClick={() => setKind("MARKET")}>
              Рыночная
            </TypeBtn>
            <TypeBtn active={kind === "LIMIT"} onClick={() => setKind("LIMIT")}>
              Лимитная
            </TypeBtn>
          </div>

          <div>
            <div className="text-[12px] text-ink-secondary mb-1.5">
              Количество, шт <span className="text-ink-muted">· {lotHint}</span>
            </div>
            <input
              className="input w-full"
              inputMode="numeric"
              value={qty}
              data-testid="order-qty"
              onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
              placeholder={String(lot)}
            />
            <div className="flex gap-1.5 mt-1.5">
              {[1, 5, 10].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setQty(String(lot * m))}
                  className="text-[11px] px-2.5 py-1 rounded-pill bg-brand-soft border border-brand/30 text-accent"
                >
                  {lot * m} шт
                </button>
              ))}
            </div>
          </div>

          {kind === "LIMIT" && (
            <div>
              <div className="text-[12px] text-ink-secondary mb-1.5">
                Лимитная цена, ₽ <span className="text-ink-muted">· рынок {instr.price}</span>
              </div>
              <input
                className="input w-full"
                inputMode="decimal"
                value={limitPrice}
                data-testid="order-limit-price"
                onChange={(e) => setLimitPrice(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
              />
            </div>
          )}

          <div className="card-nested space-y-1">
            <Row k="Цена" v={kind === "MARKET" ? `${instr.price} ₽ (рыночная)` : `${limitPrice || "—"} ₽`} />
            <Row k="Сумма" v={formatMoney(amount, "RUB")} />
            <Row k="Комиссия 0,3 %" v={formatMoney(fee, "RUB")} />
            <Row
              k={side === "BUY" ? "Итого спишется" : "Итого получите"}
              v={formatMoney(side === "BUY" ? totalBuy : totalSell, "RUB")}
              strong
            />
          </div>

          {side === "BUY" && (
            <div className="text-[11px] text-ink-muted">
              Свободно на брокерском: <span className="text-money">{formatMoney(cash, "RUB")}</span>
            </div>
          )}
          {side === "SELL" && (
            <div className="text-[11px] text-ink-muted">
              В портфеле: <span className="text-money">{heldQty} шт</span>
            </div>
          )}

          {!lotOk && qty !== "" && (
            <div className="text-xs text-danger">Количество должно быть кратно {lot}</div>
          )}
          {side === "BUY" && !fundsOk && lotOk && (
            <div className="text-xs text-danger">Недостаточно средств на брокерском счёте</div>
          )}
          {side === "SELL" && !fundsOk && lotOk && (
            <div className="text-xs text-danger">В портфеле только {heldQty} шт</div>
          )}

          <div className="flex gap-2 pt-1">
            <button className="btn flex-1" onClick={onClose}>
              Отмена
            </button>
            <button
              className="btn-primary flex-[1.4]"
              disabled={!canContinue}
              data-testid="order-continue"
              onClick={() => setStep(2)}
            >
              Продолжить
            </button>
          </div>
        </div>
      ) : step === 2 ? (
        <div className="space-y-3">
          <div className="card-nested space-y-1">
            <Row k="Инструмент" v={`${ticker} · ${instr.name}`} />
            <Row k="Операция" v={side === "BUY" ? "Покупка" : "Продажа"} />
            <Row k="Тип" v={kind === "MARKET" ? "Рыночная" : "Лимитная"} />
            <Row k="Количество" v={`${qtyNum} шт`} />
            <Row k="Цена" v={`${kind === "MARKET" ? instr.price : String(priceNum)} ₽`} />
            <Row k="Комиссия 0,3 %" v={formatMoney(fee, "RUB")} />
            <Row
              k={side === "BUY" ? "Итого спишется" : "Итого получите"}
              v={formatMoney(side === "BUY" ? totalBuy : totalSell, "RUB")}
              strong
            />
          </div>
          {kind === "LIMIT" && (
            <div className="text-[11px] text-ink-muted">
              Лимитная заявка исполнится, когда рынок дойдёт до вашей цены. Пока висит — её можно отменить.
            </div>
          )}
          {error && <div className="text-xs text-danger bg-danger-soft rounded-control px-3 py-2">{error}</div>}
          <div className="flex gap-2">
            <button className="btn flex-1" onClick={() => setStep(1)}>
              ← Назад
            </button>
            <button className="btn-primary flex-[1.4]" data-testid="order-to-otp" onClick={() => setStep(3)}>
              Подтвердить кодом
            </button>
          </div>
        </div>
      ) : (
        <OtpConfirm
          submitLabel={side === "BUY" ? "Купить" : "Продать"}
          busy={createOrder.isPending}
          error={error}
          onSubmit={submitOrder}
        />
      )}
    </Modal>
  );
}

function TypeBtn({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[13px] p-2.5 rounded-control transition border ${
        active ? "border-brand bg-brand-soft text-accent" : "border-line hover:border-line-strong"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between items-baseline text-[13px]">
      <span className="text-ink-secondary">{k}</span>
      <span className={strong ? "font-medium text-[15px]" : "text-money"}>{v}</span>
    </div>
  );
}
