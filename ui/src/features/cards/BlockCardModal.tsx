import { useState } from "react";
import { Modal } from "@/shared/ui/Modal";
import { useBugsEnabled } from "@/features/flags/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, comment: string) => Promise<void> | void;
  currentlyBlocked?: boolean;
}

const REASONS = [
  { key: "lost", label: "Потерял карту", icon: "map-question" },
  { key: "stolen", label: "Украли карту", icon: "shield-off" },
  { key: "fraud", label: "Подозрительные операции", icon: "alert-triangle" },
  { key: "other", label: "Другое", icon: "help" },
];

export function BlockCardModal({ open, onClose, onConfirm, currentlyBlocked }: Props) {
  const bugsOn = useBugsEnabled();
  // TX-2 (bugs): опечатка — «Заблокировать» превращается в «Забронировать».
  const blockWord = bugsOn ? "Забронировать" : "Заблокировать";
  const [reason, setReason] = useState<string>("lost");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  if (currentlyBlocked) {
    // Разблокировка — просто подтверждение
    return (
      <Modal open={open} onClose={onClose} title="Разблокировать карту" maxWidth={380}>
        <div className="text-[13px] text-ink-secondary mb-4">
          Карта снова станет активной, вы сможете использовать её для оплат и переводов.
        </div>
        <div className="flex gap-2">
          <button className="btn flex-1" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn-primary flex-[1.4]"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm("", "");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Разблокируем…" : "Разблокировать"}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`${blockWord} карту`} maxWidth={400}>
      <div className="text-[13px] text-ink-secondary mb-4">
        Карту нельзя будет использовать для операций. Разблокировать можно в любой момент.
      </div>

      <div className="text-[12px] text-ink-secondary mb-2">Причина</div>
      <div className="grid grid-cols-2 gap-1.5 mb-4">
        {REASONS.map((r) => (
          <button
            key={r.key}
            onClick={() => setReason(r.key)}
            data-testid={`block-reason-${r.key}`}
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

      {reason === "other" && (
        <>
          <div className="text-[12px] text-ink-secondary mb-2">Комментарий</div>
          <input
            className="input mb-4"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={100}
            placeholder="Опишите ситуацию"
          />
        </>
      )}

      <div className="flex gap-2">
        <button className="btn flex-1" onClick={onClose}>
          Отмена
        </button>
        <button
          className="btn-primary flex-[1.4] text-danger"
          style={{
            background: "linear-gradient(180deg, #FF5A75 0%, #FF3A5C 100%)",
            color: "#F5F7FF",
          }}
          disabled={busy || (reason === "other" && !comment.trim())}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm(reason, comment);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Блокируем…" : blockWord}
        </button>
      </div>
    </Modal>
  );
}
