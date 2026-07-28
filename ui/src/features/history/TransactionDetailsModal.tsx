import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/shared/ui/Modal";
import { api } from "@/shared/api/client";
import { Account, Card, Transaction } from "@/shared/api/types";
import { presentTransaction } from "./txPresenter";
import { formatMoney } from "@/shared/lib/format";

interface Props {
  tx: Transaction | null;
  onClose: () => void;
}

export function TransactionDetailsModal({ tx, onClose }: Props) {
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => (await api.get("/accounts")).data,
    enabled: !!tx,
  });
  const { data: cards = [] } = useQuery({
    queryKey: ["cards"],
    queryFn: async (): Promise<Card[]> => (await api.get("/cards")).data,
    enabled: !!tx,
  });

  if (!tx) return null;

  const p = presentTransaction(tx);
  const fromAccount = accounts.find((a) => a.id === tx.from_account_id);
  const toAccount = accounts.find((a) => a.id === tx.to_account_id);
  const card = cards.find((c) => c.id === tx.card_id);

  const dateStr = new Date(tx.created_at).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const total = parseFloat(tx.money.total);
  const amountValue = parseFloat(tx.money.amount);
  const fee = parseFloat(tx.money.fee);

  function downloadReceipt() {
    // Backend отдаёт HTML-чек — открываем в новой вкладке, а браузер уже позволит распечатать/сохранить как PDF.
    window.open(`/api/v1/transactions/${tx!.id}/receipt`, "_blank", "noopener");
  }

  return (
    <Modal open={!!tx} onClose={onClose} title="Операция" maxWidth={460} testId="tx-details-modal">
      <div className="flex items-start gap-3 mb-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{ background: p.bgColor, color: p.color }}
        >
          <i className={`ti ti-${p.icon} text-xl`} aria-hidden="true"></i>
        </div>
        <div className="flex-1">
          <div className="text-[13px] text-ink-muted">{p.categoryLabel} · {timeOnly(tx.created_at)}</div>
          <div className={`text-[26px] font-semibold mt-0.5 ${p.isIncoming ? "text-success" : ""}`}>
            {p.amountLabel}
          </div>
          <div className="mt-1">
            <span
              className={`badge ${
                tx.status === "COMPLETED"
                  ? "bg-success-soft text-success"
                  : "bg-danger-soft text-danger"
              }`}
            >
              {tx.status === "COMPLETED" ? "Выполнено" : "Отклонено"}
            </span>
          </div>
        </div>
      </div>

      <div className="card-nested mb-3">
        <Row label="Название" value={p.title} />
        {fromAccount && (
          <Row label="Со счёта" value={`«${fromAccount.name}» · •••• ${fromAccount.account_number.slice(-4)}`} />
        )}
        {card && <Row label="С карты" value={`•• ${card.last4} (${card.payment_system})`} />}
        {toAccount && (
          <Row label="На счёт" value={`«${toAccount.name}» · •••• ${toAccount.account_number.slice(-4)}`} />
        )}
        {p.comment && <Row label="Сообщение" value={`«${p.comment}»`} />}
        <div className="h-px bg-line my-2"></div>
        <Row label="Сумма" value={formatMoney(amountValue, tx.money.currency)} />
        {fee > 0 && <Row label="Комиссия" value={formatMoney(fee, tx.money.currency)} danger />}
        <div className="h-px bg-line my-2"></div>
        <Row label={p.isIncoming ? "Итого зачислено" : "Итого списано"} value={formatMoney(total, tx.money.currency)} bold />
      </div>

      <div className="rounded-control bg-fill-control px-3 py-2 mb-4 text-[12px] text-ink-muted flex items-center gap-2">
        <i className="ti ti-hash" aria-hidden="true"></i>
        Операция №{tx.id} · {dateStr}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={downloadReceipt}
          className="btn-outline-brand py-2.5"
          data-testid="tx-download-receipt"
        >
          <i className="ti ti-file-download" aria-hidden="true"></i>
          Скачать чек
        </button>
        <button className="btn py-2.5" onClick={onClose} data-testid="tx-close-btn">
          Закрыть
        </button>
      </div>
    </Modal>
  );
}

function Row({ label, value, bold, danger }: { label: string; value: string; bold?: boolean; danger?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${bold ? "text-[14px] font-medium" : "text-[12px]"}`}>
      <span className={bold ? "" : danger ? "text-warning" : "text-ink-muted"}>{label}</span>
      <span className={danger ? "text-warning" : ""}>{value}</span>
    </div>
  );
}

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
