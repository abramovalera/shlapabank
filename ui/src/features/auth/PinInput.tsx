import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
  testId?: string;
  /** true — показывать введённые цифры; false — точки (для скрытых PIN-кодов). */
  showDigits?: boolean;
}

/**
 * 4-значный ввод кода доступа. Визуально — 4 крупных кружка.
 * Внутри — скрытый input с pattern="\d{4}" (нативный numeric keypad на мобильных).
 */
export function PinInput({
  value,
  onChange,
  onComplete,
  invalid,
  autoFocus,
  testId,
  showDigits = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (value.length === 4 && onComplete) onComplete(value);
  }, [value, onComplete]);

  return (
    <div
      className="relative inline-flex justify-center gap-2.5"
      onClick={() => inputRef.current?.focus()}
      data-testid={testId}
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-14 h-14 rounded-2xl flex items-center justify-center transition border ${
            invalid
              ? "bg-danger-soft border-danger/40"
              : value.length === i
              ? "bg-surface-3 border-brand ring-2 ring-brand/30"
              : "bg-surface-3 border-line"
          }`}
        >
          {value[i] &&
            (showDigits ? (
              <span
                className={`text-[22px] font-medium ${
                  invalid ? "text-danger" : "text-ink-primary"
                }`}
              >
                {value[i]}
              </span>
            ) : (
              <div
                className={`w-3 h-3 rounded-full ${invalid ? "bg-danger" : "bg-brand"}`}
              />
            ))}
        </div>
      ))}
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        pattern="\d{4}"
        maxLength={4}
        value={value}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
          onChange(digits);
        }}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
        aria-label="Код доступа"
      />
    </div>
  );
}
