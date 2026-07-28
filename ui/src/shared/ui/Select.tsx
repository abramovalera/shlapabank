import { ReactNode } from "react";
import { Dropdown } from "./Dropdown";

export interface SelectOption<T = string | number> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
  icon?: ReactNode;
}

interface Props<T = string | number> {
  value: T | null | undefined;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  testId?: string;
  className?: string;
}

/**
 * Стилизованный selection-компонент под нашу палитру.
 * Заменяет нативный <select> — тот выглядит по-разному в разных браузерах.
 */
export function Select<T extends string | number = string>({
  value,
  onChange,
  options,
  placeholder = "Выберите…",
  testId,
  className,
}: Props<T>) {
  const active = options.find((o) => o.value === value);
  return (
    <Dropdown
      align="stretch"
      testId={testId}
      className={className}
      trigger={
        <div className="input h-[42px] flex items-center justify-between gap-2 cursor-pointer hover:border-line-strong transition">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {active?.icon}
            <div className="min-w-0 flex-1">
              {active ? (
                <>
                  <div className="text-[13px] truncate">{active.label}</div>
                  {active.hint && (
                    <div className="text-[10px] text-ink-muted truncate">{active.hint}</div>
                  )}
                </>
              ) : (
                <div className="text-[13px] text-ink-muted">{placeholder}</div>
              )}
            </div>
          </div>
          <i className="ti ti-chevron-down text-[13px] text-ink-muted shrink-0" aria-hidden="true"></i>
        </div>
      }
    >
      {(close) => (
        <>
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={String(o.value)}
                type="button"
                role="menuitem"
                disabled={o.disabled}
                onClick={() => {
                  if (o.disabled) return;
                  onChange(o.value);
                  close();
                }}
                data-testid={testId ? `${testId}-opt-${o.value}` : undefined}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition ${
                  o.disabled
                    ? "opacity-40 cursor-not-allowed"
                    : selected
                    ? "bg-brand-soft text-accent"
                    : "text-ink-primary hover:bg-fill-hover"
                }`}
              >
                {o.icon}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{o.label}</div>
                  {o.hint && <div className="text-[10px] text-ink-muted truncate">{o.hint}</div>}
                </div>
                {selected && <i className="ti ti-check text-accent" aria-hidden="true"></i>}
              </button>
            );
          })}
        </>
      )}
    </Dropdown>
  );
}
