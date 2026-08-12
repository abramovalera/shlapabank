import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// Типы отражают схемы бэкенда (backend/app/schemas.py, раздел «Инвестиции»).
export type InstrumentClass = "stock" | "bond" | "fund" | "fx";
export type OrderSide = "BUY" | "SELL";
export type OrderKind = "MARKET" | "LIMIT";
export type OrderStatus = "ACTIVE" | "EXECUTED" | "CANCELLED";

export interface Instrument {
  ticker: string;
  name: string;
  cls: InstrumentClass;
  sector: string;
  lot: number;
  currency: string;
  isin: string;
  price: string;
  change: string;
  change_pct: number;
}

export interface InstrumentDetail extends Instrument {
  open: string;
  high: string;
  low: string;
  volume: number;
  series: string[];
  dividend: string | null;
  coupon: string | null;
  maturity: string | null;
  position_qty: number;
  position_avg_price: string | null;
}

export interface OrderBookLevel {
  price: string;
  qty: number;
}
export interface OrderBook {
  ticker: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: string;
}

export interface Position {
  ticker: string;
  name: string;
  cls: InstrumentClass;
  quantity: number;
  avg_price: string;
  last_price: string;
  value: string;
  pl: string;
  pl_pct: number;
}

export interface Portfolio {
  broker_account_id: number;
  broker_account_number: string;
  cash: string;
  positions_value: string;
  total: string;
  pl_total: string;
  pl_total_pct: number;
  positions: Position[];
}

export interface Order {
  id: number;
  ticker: string;
  side: OrderSide;
  order_type: OrderKind;
  quantity: number;
  price: string;
  executed_price: string | null;
  fee: string;
  status: OrderStatus;
  created_at: string;
  executed_at: string | null;
}

export interface Dividend {
  ticker: string;
  name: string;
  kind: "dividend" | "coupon";
  per_unit: string;
  note: string;
}

export interface Quote {
  ticker: string;
  price: string;
  change_pct: number;
}

export interface CreateOrderPayload {
  ticker: string;
  side: OrderSide;
  order_type: OrderKind;
  quantity: number;
  price?: string;
  otp_code: string;
}

// ---- Каталог / котировки ----
export function useInstruments(params: { cls?: string; sector?: string; q?: string }) {
  const { cls, sector, q } = params;
  return useQuery({
    queryKey: ["invest", "instruments", cls ?? "", sector ?? "", q ?? ""],
    queryFn: async (): Promise<Instrument[]> =>
      (await api.get("/invest/instruments", { params: { cls, sector, q } })).data,
    refetchInterval: 2500, // цены живые — тикают
  });
}

export function useQuotes() {
  return useQuery({
    queryKey: ["invest", "quotes"],
    queryFn: async (): Promise<{ updated_at: string; items: Quote[] }> =>
      (await api.get("/invest/quotes")).data,
    refetchInterval: 2500,
  });
}

export function useInstrument(ticker: string | undefined) {
  return useQuery({
    queryKey: ["invest", "instrument", ticker],
    enabled: !!ticker,
    queryFn: async (): Promise<InstrumentDetail> =>
      (await api.get(`/invest/instruments/${ticker}`)).data,
    refetchInterval: 3000,
  });
}

export function useOrderbook(ticker: string | undefined) {
  return useQuery({
    queryKey: ["invest", "orderbook", ticker],
    enabled: !!ticker,
    queryFn: async (): Promise<OrderBook> =>
      (await api.get(`/invest/instruments/${ticker}/orderbook`)).data,
    refetchInterval: 2000, // стакан перерисовывается чаще
  });
}

// ---- Портфель / заявки ----
export function usePortfolio() {
  return useQuery({
    queryKey: ["invest", "portfolio"],
    queryFn: async (): Promise<Portfolio> => (await api.get("/invest/portfolio")).data,
    refetchInterval: 4000, // подтягивает P&L и созревшие лимитки
  });
}

export function useOrders(status?: OrderStatus) {
  return useQuery({
    queryKey: ["invest", "orders", status ?? "all"],
    queryFn: async (): Promise<Order[]> =>
      (await api.get("/invest/orders", { params: { status } })).data,
    refetchInterval: 4000,
  });
}

function invalidateInvest(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["invest", "portfolio"] });
  qc.invalidateQueries({ queryKey: ["invest", "orders"] });
  qc.invalidateQueries({ queryKey: ["accounts"] });
  qc.invalidateQueries({ queryKey: ["transactions"] });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateOrderPayload): Promise<Order> =>
      (await api.post("/invest/orders", payload)).data,
    onSuccess: () => invalidateInvest(qc),
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: number) => (await api.delete(`/invest/orders/${orderId}`)).data,
    onSuccess: () => invalidateInvest(qc),
  });
}

export function useCancelAllOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post("/invest/orders/cancel-all")).data,
    onSuccess: () => invalidateInvest(qc),
  });
}

export function useBrokerCash(kind: "deposit" | "withdraw") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { account_id: number; amount: string; otp_code: string }) =>
      (await api.post(`/invest/cash/${kind}`, payload)).data,
    onSuccess: () => invalidateInvest(qc),
  });
}

/** Скачивает CSV заявок авторизованным запросом (blob → файл). */
export async function downloadOrdersCsv(): Promise<void> {
  const res = await api.get("/invest/orders/export.csv", { responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "invest-orders.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function useDividends() {
  return useQuery({
    queryKey: ["invest", "dividends"],
    queryFn: async (): Promise<{ items: Dividend[] }> => (await api.get("/invest/dividends")).data,
  });
}
