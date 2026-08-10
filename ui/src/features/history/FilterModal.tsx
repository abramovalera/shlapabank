import { useState } from "react";
import { Modal } from "@/shared/ui/Modal";

export interface HistoryFilter {
  from?: string; // ISO date
  to?: string;
  types: { expense: boolean; income: boolean; transfer: boolean; payment: boolean };
  minAmount?: number;
  maxAmount?: number;
}

export const EMPTY_FILTER: HistoryFilter = {
  types: { expense: true, income: true, transfer: true, payment: true },
};

interface Props {
  open: boolean;
  value: HistoryFilter;
  onClose: () => void;
  onApply: (v: HistoryFilter) => void;
}

export function FilterModal({ open, value, onClose, onApply }: Props) {
  const [draft, setDraft] = useState<HistoryFilter>(value);

  function preset(days: number) {
    const now = new Date();
    const from = new Date();
    from.setDate(now.getDate() - days);
    setDraft({
      ...draft,
      from: from.toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10),
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Фильтр" testId="filter-modal" maxWidth={380}>
      <Label>Период</Label>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          type="date"
          value={draft.from ?? ""}
          onChange={(e) => setDraft({ ...draft, from: e.target.value || undefined })}
          className="input"
        />
        <input
          type="date"
          value={draft.to ?? ""}
          onChange={(e) => setDraft({ ...draft, to: e.target.value || undefined })}
          className="input"
        />
      </div>
      <div className="flex gap-1.5 mb-4">
        <PresetBtn onClick={() => preset(0)}>Сегодня</PresetBtn>
        <PresetBtn onClick={() => preset(7)}>7 дней</PresetBtn>
        <PresetBtn onClick={() => preset(30)}>Месяц</PresetBtn>
        <PresetBtn onClick={() => setDraft({ ...draft, from: undefined, to: undefined })}>
          Всё
        </PresetBtn>
      </div>

      <Label>Тип операции</Label>
      <div className="flex flex-col gap-1.5 mb-4">
        <Checkbox
          checked={draft.types.expense}
          onChange={(v) => setDraft({ ...draft, types: { ...draft.types, expense: v } })}
          label="Расходы (платежи + переводы)"
        />
        <Checkbox
          checked={draft.types.income}
          onChange={(v) => setDraft({ ...draft, types: { ...draft.types, income: v } })}
          label="Доходы (пополнения)"
        />
        <Checkbox
          checked={draft.types.transfer}
          onChange={(v) => setDraft({ ...draft, types: { ...draft.types, transfer: v } })}
          label="Только переводы"
        />
        <Checkbox
          checked={draft.types.payment}
          onChange={(v) => setDraft({ ...draft, types: { ...draft.types, payment: v } })}
          label="Только платежи"
        />
      </div>

      <Label>Сумма, ₽</Label>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <input
          type="number"
          placeholder="от 0"
          value={draft.minAmount ?? ""}
          onChange={(e) =>
            setDraft({ ...draft, minAmount: e.target.value ? parseFloat(e.target.value) : undefined })
          }
          className="input"
        />
        <input
          type="number"
          placeholder="до ∞"
          value={draft.maxAmount ?? ""}
          onChange={(e) =>
            setDraft({ ...draft, maxAmount: e.target.value ? parseFloat(e.target.value) : undefined })
          }
          className="input"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => {
            setDraft(EMPTY_FILTER);
            onApply(EMPTY_FILTER);
          }}
          className="btn flex-1"
        >
          Сбросить
        </button>
        <button
          onClick={() => onApply(draft)}
          className="btn-primary flex-[1.4]"
        >
          Применить
        </button>
      </div>
    </Modal>
  );
}

export function activeFilterCount(f: HistoryFilter): number {
  let n = 0;
  if (f.from || f.to) n++;
  const allTypes =
    f.types.expense && f.types.income && f.types.transfer && f.types.payment;
  if (!allTypes) n++;
  if (f.minAmount != null || f.maxAmount != null) n++;
  return n;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-ink-secondary mb-1.5">{children}</div>;
}

function PresetBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] px-3 py-1 rounded-pill bg-brand-soft border border-brand/30 text-accent hover:bg-brand/25 transition"
    >
      {children}
    </button>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
