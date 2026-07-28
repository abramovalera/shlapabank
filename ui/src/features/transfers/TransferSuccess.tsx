import { useNavigate } from "react-router-dom";
import { formatMoney } from "@/shared/lib/format";

interface Props {
  amount: string | number;
  currency: string;
  recipientLabel: string;
  onNew: () => void;
  /** ID транзакции — если задан, покажем кнопку «Скачать чек». */
  transactionId?: number | null;
  /** Дополнительные строки для сводки: с чего, комментарий и т.п. */
  fromLabel?: string | null;
  comment?: string | null;
  /** Время операции — по умолчанию текущее. */
  completedAt?: Date;
}

export function TransferSuccess({
  amount,
  currency,
  recipientLabel,
  onNew,
  transactionId,
  fromLabel,
  comment,
  completedAt,
}: Props) {
  const navigate = useNavigate();
  const at = completedAt ?? new Date();
  const dateStr = at.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeStr = at.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  function downloadReceipt() {
    if (transactionId) {
      window.open(`/api/v1/transactions/${transactionId}/receipt`, "_blank", "noopener");
    }
  }

  return (
    <div className="text-center" data-testid="transfer-success">
      <div className="w-16 h-16 rounded-full bg-success-soft flex items-center justify-center mx-auto mb-4">
        <i className="ti ti-check text-success text-4xl" aria-hidden="true"></i>
      </div>
      <div className="text-[22px] font-semibold mb-1">Готово</div>
      <div className="text-[28px] font-medium text-success mb-5">
        {formatMoney(amount, currency)}
      </div>

      <div className="card-nested text-left mb-4">
        <Row icon="user" label="Кому" value={recipientLabel} />
        {fromLabel && <Row icon="credit-card" label="С чего" value={fromLabel} />}
        {comment && <Row icon="message" label="Сообщение" value={`«${comment}»`} />}
        <Row icon="calendar" label="Дата" value={dateStr} />
        <Row icon="clock" label="Время" value={timeStr} />
        {transactionId && (
          <Row icon="hash" label="Номер операции" value={`№${transactionId}`} />
        )}
      </div>

      <div className="flex flex-col gap-2 mb-3">
        {transactionId && (
          <button
            onClick={downloadReceipt}
            className="btn-outline-brand w-full py-2.5"
            data-testid="success-download-receipt"
          >
            <i className="ti ti-file-download" aria-hidden="true"></i>
            Скачать чек
          </button>
        )}
        <button
          onClick={onNew}
          className="btn w-full py-2.5"
          data-testid="success-new-btn"
        >
          <i className="ti ti-repeat" aria-hidden="true"></i>
          Новый перевод
        </button>
        <button
          onClick={() => navigate("/history")}
          className="btn w-full py-2.5"
          data-testid="success-history-btn"
        >
          <i className="ti ti-list" aria-hidden="true"></i>
          К истории
        </button>
      </div>

      <button
        onClick={() => navigate("/dashboard")}
        className="btn-primary w-full py-2.5"
        data-testid="success-home-btn"
      >
        На главную
      </button>
    </div>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <i className={`ti ti-${icon} text-ink-muted text-base mt-0.5 shrink-0`} aria-hidden="true"></i>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-ink-muted uppercase tracking-wider">{label}</div>
        <div className="text-[13px] truncate">{value}</div>
      </div>
    </div>
  );
}
