import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { Transaction } from "@/shared/api/types";
import { formatRelativeDate } from "@/shared/lib/format";
import { presentTransaction, transactionsToCsv } from "@/features/history/txPresenter";
import { TransactionDetailsModal } from "@/features/history/TransactionDetailsModal";
import {
  FilterModal,
  HistoryFilter,
  EMPTY_FILTER,
  activeFilterCount,
} from "@/features/history/FilterModal";
import { Dropdown } from "@/shared/ui/Dropdown";

type QuickChip = "all" | "expense" | "income" | "transfer" | "payment";

const PAGE_SIZE = 10;

export function HistoryPage() {
  const [chip, setChip] = useState<QuickChip>("all");
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async (): Promise<Transaction[]> => (await api.get("/transactions")).data,
  });

  const filtered = useMemo(() => {
    return transactions.filter((tx) => matches(tx, chip, filter));
  }, [transactions, chip, filter]);

  // Сброс лимита при смене фильтра
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [chip, filter]);

  const visible = filtered.slice(0, limit);
  const hasMore = filtered.length > visible.length;

  // Группировка ТОЛЬКО видимых операций
  const grouped = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    visible.forEach((tx) => {
      const key = new Date(tx.created_at).toISOString().slice(0, 10);
      (groups[key] ||= []).push(tx);
    });
    return Object.entries(groups).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [visible]);

  function downloadCsv() {
    const csv = transactionsToCsv(filtered);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shlapabank-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printView() {
    window.print();
  }

  const filterN = activeFilterCount(filter);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-medium">История</h1>
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilterOpen(true)}
            className={`btn text-xs py-1.5 px-2.5 ${filterN > 0 ? "border-brand text-accent" : ""}`}
            data-testid="history-filter-btn"
          >
            <i className="ti ti-filter text-sm" aria-hidden="true"></i>
            Фильтр
            {filterN > 0 && (
              <span className="badge bg-brand text-[#0B1223] px-1.5">{filterN}</span>
            )}
          </button>

          <Dropdown
            align="right"
            className="w-auto"
            testId="export-dropdown"
            trigger={
              <div className="btn text-xs py-1.5 px-2.5 flex items-center gap-1">
                <i className="ti ti-download text-sm" aria-hidden="true"></i>
                Экспорт
                <i className="ti ti-chevron-down text-xs text-ink-muted" aria-hidden="true"></i>
              </div>
            }
          >
            {(close) => (
              <div style={{ minWidth: 220 }}>
                <MenuItem
                  icon="file-type-csv"
                  label="CSV — таблица"
                  onClick={() => {
                    downloadCsv();
                    close();
                  }}
                  testId="export-csv"
                />
                <MenuItem
                  icon="printer"
                  label="Распечатать / сохранить PDF"
                  onClick={() => {
                    printView();
                    close();
                  }}
                  testId="export-print"
                />
              </div>
            )}
          </Dropdown>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap" data-testid="history-filters">
        <FilterChip active={chip === "all"} onClick={() => setChip("all")}>
          Все
        </FilterChip>
        <FilterChip active={chip === "expense"} onClick={() => setChip("expense")}>
          Расходы
        </FilterChip>
        <FilterChip active={chip === "income"} onClick={() => setChip("income")}>
          Доходы
        </FilterChip>
        <FilterChip active={chip === "transfer"} onClick={() => setChip("transfer")}>
          Переводы
        </FilterChip>
        <FilterChip active={chip === "payment"} onClick={() => setChip("payment")}>
          Платежи
        </FilterChip>
      </div>

      {isLoading ? (
        <div className="card text-center text-ink-muted py-10">Загружаем…</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center text-ink-muted py-10">
          По этому фильтру операций нет.
        </div>
      ) : (
        <>
          <div className="card p-0 overflow-hidden">
            {grouped.map(([day, list]) => (
              <div key={day}>
                <div className="px-4 py-2 bg-surface-2 text-[10px] uppercase tracking-wide text-ink-muted font-medium">
                  {formatRelativeDate(list[0].created_at)} ·{" "}
                  {new Date(day).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                </div>
                {list.map((tx, i) => (
                  <TxRow
                    key={tx.id}
                    tx={tx}
                    onClick={() => setSelected(tx)}
                    isLast={i === list.length - 1}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="text-center text-[11px] text-ink-muted mt-3">
            Показано {visible.length} из {filtered.length}
          </div>

          {hasMore && (
            <button
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              className="btn w-full mt-2 py-2.5"
              data-testid="history-show-more-btn"
            >
              <i className="ti ti-chevron-down" aria-hidden="true"></i>
              Показать ещё {Math.min(PAGE_SIZE, filtered.length - visible.length)}
            </button>
          )}
        </>
      )}

      <FilterModal
        open={filterOpen}
        value={filter}
        onClose={() => setFilterOpen(false)}
        onApply={(v) => {
          setFilter(v);
          setFilterOpen(false);
        }}
      />
      <TransactionDetailsModal tx={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function TxRow({ tx, onClick, isLast }: { tx: Transaction; onClick: () => void; isLast: boolean }) {
  const p = presentTransaction(tx);
  return (
    <button
      onClick={onClick}
      className={`w-full flex justify-between items-center px-4 py-3 hover:bg-surface-2 transition text-left ${
        isLast ? "" : "border-b border-line"
      }`}
      data-testid={`history-tx-${tx.id}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: p.bgColor, color: p.color }}
        >
          <i className={`ti ti-${p.icon} text-[16px]`} aria-hidden="true"></i>
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-medium truncate">{p.title}</div>
          <div className="text-[11px] text-ink-muted truncate">{p.subtitle}</div>
        </div>
      </div>
      <div className="text-right shrink-0 ml-3">
        <div className={`text-[14px] ${p.isIncoming ? "text-success" : ""}`}>{p.amountLabel}</div>
        {p.fee && <div className="text-[10px] text-warning">комиссия {p.fee}</div>}
      </div>
    </button>
  );
}

function FilterChip({
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
      className={`text-xs px-3 py-1.5 rounded-pill transition ${
        active
          ? "bg-brand text-[#0B1223] border border-brand font-medium"
          : "bg-surface-1 border border-line hover:border-line-strong"
      }`}
    >
      {children}
    </button>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  testId,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-primary hover:bg-fill-hover transition text-left"
    >
      <i className={`ti ti-${icon} text-lg text-ink-secondary`} aria-hidden="true"></i>
      <span>{label}</span>
    </button>
  );
}

function matches(tx: Transaction, chip: QuickChip, f: HistoryFilter): boolean {
  // Быстрые чипы имеют приоритет
  if (chip === "expense" && tx.type === "TOPUP") return false;
  if (chip === "income" && tx.type !== "TOPUP") return false;
  if (chip === "transfer" && tx.type !== "TRANSFER") return false;
  if (chip === "payment" && tx.type !== "PAYMENT") return false;

  // Модальный фильтр (типы — AND-сет)
  const isIncome = tx.type === "TOPUP";
  const isTransfer = tx.type === "TRANSFER";
  const isPayment = tx.type === "PAYMENT";
  const isExpense = !isIncome;

  const t = f.types;
  const anyTypeChecked = t.expense || t.income || t.transfer || t.payment;
  if (anyTypeChecked) {
    const passType =
      (t.income && isIncome) ||
      (t.expense && isExpense) ||
      (t.transfer && isTransfer) ||
      (t.payment && isPayment);
    if (!passType) return false;
  }

  if (f.from) {
    if (new Date(tx.created_at) < new Date(f.from + "T00:00:00")) return false;
  }
  if (f.to) {
    if (new Date(tx.created_at) > new Date(f.to + "T23:59:59")) return false;
  }
  if (f.minAmount != null && parseFloat(tx.money.total) < f.minAmount) return false;
  if (f.maxAmount != null && parseFloat(tx.money.total) > f.maxAmount) return false;

  return true;
}
