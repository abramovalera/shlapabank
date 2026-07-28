import { useEffect, useState } from "react";
import { Modal } from "@/shared/ui/Modal";
import { Card } from "@/shared/api/types";

interface Props {
  open: boolean;
  onClose: () => void;
  card: Card;
}

interface LimitEntry {
  enabled: boolean;
  amount: number;
}

interface Limits {
  monthly: LimitEntry;
  daily: LimitEntry;
  online: LimitEntry;
  atm: LimitEntry;
  contactless: LimitEntry;
  abroad: LimitEntry;
  online_purchases: LimitEntry;
}

const DEFAULTS: Limits = {
  monthly:          { enabled: true,  amount: 500000 },
  daily:            { enabled: true,  amount: 100000 },
  online:           { enabled: true,  amount: 50000 },
  atm:              { enabled: true,  amount: 100000 },
  contactless:      { enabled: true,  amount: 5000 },
  abroad:           { enabled: false, amount: 50000 },
  online_purchases: { enabled: true,  amount: 30000 },
};

const LIMIT_LABELS: { key: keyof Limits; label: string; hint: string }[] = [
  { key: "monthly",          label: "Месячный лимит",           hint: "Общий лимит трат за календарный месяц" },
  { key: "daily",            label: "Дневной лимит",            hint: "Общий лимит трат в день" },
  { key: "online",           label: "Онлайн (в день)",          hint: "Лимит на все интернет-покупки" },
  { key: "atm",              label: "Снятие наличных (в день)", hint: "Максимум в банкоматах за сутки" },
  { key: "contactless",      label: "Бесконтактная оплата",     hint: "Одна операция без PIN" },
  { key: "abroad",           label: "Операции за границей",     hint: "Все операции вне РФ" },
  { key: "online_purchases", label: "Онлайн-покупки",           hint: "Магазины и сервисы в интернете" },
];

/**
 * Настройка лимитов. Каждая строка: тогл (включить/выключить) + инпут суммы.
 * Хранится в localStorage — на бэке пока не сохраняется.
 */
export function LimitsModal({ open, onClose, card }: Props) {
  const storageKey = `sb_card_limits_${card.id}`;
  const [limits, setLimits] = useState<Limits>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setLimits({ ...DEFAULTS, ...JSON.parse(raw) });
      else setLimits(DEFAULTS);
    } catch {
      setLimits(DEFAULTS);
    }
    setSaved(false);
  }, [open, storageKey]);

  function updateEntry(key: keyof Limits, patch: Partial<LimitEntry>) {
    setLimits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(limits));
    setSaved(true);
    setTimeout(() => onClose(), 800);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Лимиты по карте"
      subtitle={`Карта •• ${card.last4}`}
      testId="limits-modal"
      maxWidth={460}
    >
      <div className="text-[11px] text-ink-muted mb-3">
        Каждый лимит можно включить/выключить и задать сумму.
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {LIMIT_LABELS.map(({ key, label, hint }) => (
          <LimitRow
            key={key}
            label={label}
            hint={hint}
            entry={limits[key]}
            onToggle={(v) => updateEntry(key, { enabled: v })}
            onAmount={(v) => updateEntry(key, { amount: v })}
          />
        ))}
      </div>

      {saved && (
        <div className="text-[13px] text-success bg-success-soft rounded-control px-3 py-2 mb-3">
          <i className="ti ti-check mr-1" aria-hidden="true"></i>
          Лимиты сохранены
        </div>
      )}

      <div className="flex gap-2">
        <button className="btn flex-1" onClick={onClose}>
          Отмена
        </button>
        <button
          onClick={save}
          className="btn-primary flex-[1.4] py-2.5"
          data-testid="limits-save-btn"
        >
          Сохранить
        </button>
      </div>
    </Modal>
  );
}

function LimitRow({
  label,
  hint,
  entry,
  onToggle,
  onAmount,
}: {
  label: string;
  hint: string;
  entry: LimitEntry;
  onToggle: (v: boolean) => void;
  onAmount: (v: number) => void;
}) {
  return (
    <div
      className={`card-nested transition ${
        entry.enabled ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">{label}</div>
          <div className="text-[10px] text-ink-muted">{hint}</div>
        </div>
        <Toggle checked={entry.enabled} onChange={onToggle} />
      </div>
      {entry.enabled && (
        <div className="mt-2.5 flex items-center gap-2">
          <input
            value={entry.amount === 0 ? "" : entry.amount}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              onAmount(v ? parseInt(v) : 0);
            }}
            inputMode="numeric"
            placeholder="0"
            className="input flex-1 font-mono text-right"
            style={{ MozAppearance: "textfield" } as React.CSSProperties}
          />
          <span className="text-[13px] text-ink-secondary">₽</span>
        </div>
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full flex items-center transition p-0.5 shrink-0 ${
        checked ? "bg-brand justify-end" : "bg-fill-control justify-start"
      }`}
    >
      <div className="w-5 h-5 rounded-full bg-white shadow" />
    </button>
  );
}
