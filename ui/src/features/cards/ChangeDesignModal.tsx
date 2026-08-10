import { useState } from "react";
import { Modal } from "@/shared/ui/Modal";
import { BankCard, DESIGN_GRADIENTS, DESIGNS_FOR_TYPE } from "./BankCard";
import { Card, CardDesign } from "@/shared/api/types";

interface Props {
  open: boolean;
  onClose: () => void;
  card: Card;
  onSubmit: (design: CardDesign) => Promise<void>;
}

/**
 * Смена дизайна карты. Пул дизайнов зависит от типа карты (Regular/Gold).
 */
export function ChangeDesignModal({ open, onClose, card, onSubmit }: Props) {
  const isGold = card.card_type === "GOLD";
  const availableDesigns = isGold
    ? DESIGNS_FOR_TYPE.GOLD
    : DESIGNS_FOR_TYPE.REGULAR;

  const [selected, setSelected] = useState<CardDesign>(card.design ?? availableDesigns[0]);
  const [busy, setBusy] = useState(false);

  const changed = selected !== card.design;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Сменить дизайн"
      subtitle={isGold ? "Премиум-оформление Gold" : "Базовые цвета Regular"}
      testId="change-design-modal"
    >
      <div className="flex justify-center mb-4">
        <BankCard
          card={{ ...card, design: selected }}
        />
      </div>

      <div
        className={`grid gap-2 mb-4 ${availableDesigns.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}
      >
        {availableDesigns.map((d) => (
          <button
            key={d}
            onClick={() => setSelected(d)}
            className={`h-14 rounded-control transition ${
              selected === d
                ? "ring-2 ring-brand ring-offset-2 ring-offset-surface-2"
                : "border border-line hover:border-line-strong"
            }`}
            style={{ background: DESIGN_GRADIENTS[d] }}
            aria-label={`Дизайн ${d}`}
            data-testid={`design-${d}`}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <button className="btn flex-1" onClick={onClose}>
          Отмена
        </button>
        <button
          disabled={!changed || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSubmit(selected);
            } finally {
              setBusy(false);
            }
          }}
          className={`flex-[1.4] py-2.5 rounded-control font-medium transition ${
            changed && !busy
              ? "btn-primary"
              : "bg-fill-control text-ink-muted cursor-not-allowed"
          }`}
        >
          {busy ? "Сохраняем…" : "Сменить дизайн"}
        </button>
      </div>
    </Modal>
  );
}
