import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onSave: (next: string) => Promise<void> | void;
  className?: string;
  maxLength?: number;
  testId?: string;
}

/**
 * Inline-редактирование текста: клик на карандаш → превращается в input,
 * Enter — сохранить, Escape — отменить. Иконка + input оба поддерживают
 * тестовые id вида `${testId}-edit-btn`, `${testId}-input`, `${testId}-save-btn`.
 */
export function InlineRename({ value, onSave, className, maxLength = 60, testId }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      // autofocus + select
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 10);
    }
  }, [editing, value]);

  async function save() {
    const next = draft.trim();
    if (!next || next === value) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className={`inline-flex items-center gap-2 ${className ?? ""}`}>
        <span data-testid={testId ? `${testId}-value` : undefined}>{value}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Переименовать"
          data-testid={testId ? `${testId}-edit-btn` : undefined}
          className="text-ink-muted hover:text-accent transition p-1 leading-none"
        >
          <i className="ti ti-pencil text-[15px]" aria-hidden="true"></i>
        </button>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <input
        ref={inputRef}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        disabled={busy}
        className="rounded-control bg-fill-control border border-brand px-2.5 py-1 text-inherit font-inherit focus:outline-none focus:ring-2 focus:ring-brand/40"
        style={{ font: "inherit", minWidth: "180px" }}
        data-testid={testId ? `${testId}-input` : undefined}
      />
      <button
        type="button"
        onClick={save}
        disabled={busy}
        aria-label="Сохранить"
        data-testid={testId ? `${testId}-save-btn` : undefined}
        className="btn-primary py-1.5 px-2.5 rounded-control"
      >
        <i className="ti ti-check text-sm" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        aria-label="Отмена"
        data-testid={testId ? `${testId}-cancel-btn` : undefined}
        className="btn py-1.5 px-2.5 rounded-control"
      >
        <i className="ti ti-x text-sm" aria-hidden="true"></i>
      </button>
    </div>
  );
}
