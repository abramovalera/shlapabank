import { useState } from "react";
import { Modal } from "@/shared/ui/Modal";
import { Card } from "@/shared/api/types";

interface Props {
  open: boolean;
  onClose: () => void;
  card: Card;
  onConfirm: (reason: string) => Promise<void>;
}

const REASONS = [
  { key: "damaged", label: "Повреждена карта", icon: "crack" },
  { key: "lost", label: "Потерял карту", icon: "map-question" },
  { key: "stolen", label: "Украли карту", icon: "shield-off" },
  { key: "expiring", label: "Скоро истечёт срок", icon: "hourglass" },
];

/**
 * Перевыпуск карты. Старая закрывается, выпускается новая с тем же типом и дизайном.
 * Реквизиты (номер, CVV) — новые. Привязанный счёт не меняется.
 */
export function ReissueCardModal({ open, onClose, card, onConfirm }: Props) {
  const [reason, setReason] = useState<string>("damaged");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Перевыпустить карту"
      subtitle={`Карта •• ${card.last4}`}
      testId="reissue-modal"
      maxWidth={420}
    >
      <div className="rounded-control bg-brand-soft border border-brand/30 px-3 py-2.5 mb-4 flex items-start gap-3">
        <i className="ti ti-info-circle text-accent text-xl mt-0.5" aria-hidden="true"></i>
        <div className="text-[12px] text-ink-secondary">
          Новая карта будет с тем же типом ({card.card_type === "GOLD" ? "Gold" : "Regular"}) и
          дизайном, но с новым номером и CVV. Привязанный счёт не изменится. Текущая карта
          автоматически закроется.
        </div>
      </div>

      <div className="text-[12px] text-ink-secondary mb-2">Причина перевыпуска</div>
      <div className="grid grid-cols-2 gap-1.5 mb-4">
        {REASONS.map((r) => (
          <button
            key={r.key}
            onClick={() => setReason(r.key)}
            data-testid={`reissue-reason-${r.key}`}
            className={`card-nested flex items-center gap-2 text-left text-[13px] transition ${
              reason === r.key ? "border-brand ring-1 ring-brand/40" : "hover:bg-surface-3"
            }`}
          >
            <i
              className={`ti ti-${r.icon} text-lg text-ink-secondary shrink-0`}
              aria-hidden="true"
            ></i>
            <span>{r.label}</span>
          </button>
        ))}
      </div>

      <div className="text-[11px] text-ink-muted mb-4">
        Готовая карта появится в разделе «Карты» сразу — виртуальный образец. Физический
        пластик приедет через 3–5 дней.
      </div>

      <div className="flex gap-2">
        <button className="btn flex-1" onClick={onClose}>
          Отмена
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm(reason);
            } finally {
              setBusy(false);
            }
          }}
          className="btn-primary flex-[1.4] py-2.5"
        >
          {busy ? "Перевыпускаем…" : "Перевыпустить"}
        </button>
      </div>
    </Modal>
  );
}
