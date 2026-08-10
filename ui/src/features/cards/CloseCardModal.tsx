import { useState } from "react";
import { Modal } from "@/shared/ui/Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  cardLast4: string;
}

/**
 * Модалка закрытия карты. Требует подтверждение — надо ввести последние 4 цифры,
 * чтобы случайно не удалить не ту карту.
 */
export function CloseCardModal({ open, onClose, onConfirm, cardLast4 }: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const canConfirm = confirmText === cardLast4;

  return (
    <Modal open={open} onClose={onClose} title="Закрыть карту" maxWidth={400}>
      <div className="rounded-control bg-danger-soft border border-danger/30 px-3 py-2.5 mb-4 flex items-start gap-3">
        <i className="ti ti-alert-triangle text-danger text-xl mt-0.5" aria-hidden="true"></i>
        <div>
          <div className="text-[13px] font-medium text-danger">Действие необратимо</div>
          <div className="text-[11px] text-ink-secondary mt-0.5">
            После закрытия карту нельзя будет восстановить. Привязанный счёт останется, но
            эта карта перестанет работать.
          </div>
        </div>
      </div>

      <div className="text-[12px] text-ink-secondary mb-2">
        Введите последние 4 цифры карты <span className="font-mono">•• {cardLast4}</span> для
        подтверждения
      </div>
      <input
        className="input font-mono tracking-widest mb-4 text-center"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="0000"
        inputMode="numeric"
        maxLength={4}
      />

      <div className="flex gap-2">
        <button className="btn flex-1" onClick={onClose}>
          Отмена
        </button>
        <button
          disabled={!canConfirm || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
            }
          }}
          className={`flex-[1.4] py-2.5 rounded-control font-medium transition ${
            canConfirm && !busy
              ? ""
              : "bg-fill-control text-ink-muted cursor-not-allowed border border-line-strong"
          }`}
          style={
            canConfirm && !busy
              ? {
                  background: "linear-gradient(180deg, #FF5A75 0%, #FF3A5C 100%)",
                  color: "#F5F7FF",
                  border: "none",
                }
              : undefined
          }
        >
          {busy ? "Закрываем…" : "Закрыть карту"}
        </button>
      </div>
    </Modal>
  );
}
