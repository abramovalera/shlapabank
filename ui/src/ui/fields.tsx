import {
  forwardRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { maskPhone10 } from "./format";
import { formatAmountInput } from "./validate";
import { IconEye, IconEyeOff } from "./icons";

export const inputBox =
  "rounded-control bg-page text-ink placeholder:text-ink-faint outline-none transition-shadow focus-within:shadow-focus";

interface FieldProps {
  id: string;
  label: ReactNode;
  /** Префикс для data-testid подсказки/ошибки: `<testId>-hint`, `<testId>-error` */
  testId: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  /** Что показать под ошибкой/подсказкой (найденный получатель, пояснение) — ошибка остаётся сразу под полем */
  after?: ReactNode;
  className?: string;
}

/** Обёртка поля: подпись, само поле, подсказка или ошибка. */
export function Field({ id, label, testId, hint, error, children, after, className = "" }: FieldProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {error ? (
        <span id={`${id}-error`} data-testid={`${testId}-error`} className="text-[13px] font-medium text-danger" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} data-testid={`${testId}-hint`} className="text-[13px] text-ink-faint">
          {hint}
        </span>
      ) : null}
      {after}
    </div>
  );
}

type BaseInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onValueChange: (v: string) => void;
  invalid?: boolean;
};

export const TextInput = forwardRef<HTMLInputElement, BaseInputProps>(function TextInput(
  { value, onValueChange, invalid, className = "", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      aria-invalid={invalid || undefined}
      className={`h-12 w-full px-4 text-[15px] ${inputBox} focus:shadow-focus ${invalid ? "shadow-invalid" : ""} ${className}`}
      {...rest}
    />
  );
});

type MaskedProps = BaseInputProps & {
  format: (raw: string, prev: string) => string;
  /** Какие символы «значимые» — по ним восстанавливается позиция курсора после маски */
  significant?: RegExp;
};

/** Поле с маской, которое не теряет позицию курсора при переформатировании. */
export const MaskedInput = forwardRef<HTMLInputElement, MaskedProps>(function MaskedInput(
  { value, onValueChange, format, significant = /\d/, invalid, className = "", ...rest },
  ref,
) {
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const raw = el.value;
    const caret = el.selectionStart ?? raw.length;
    let sig = 0;
    for (const ch of raw.slice(0, caret)) if (significant.test(ch)) sig++;
    const next = format(raw, value);
    let pos = 0;
    let seen = 0;
    while (pos < next.length && seen < sig) {
      if (significant.test(next[pos])) seen++;
      pos++;
    }
    // Пишем значение в DOM сами — тогда React не сбросит курсор в конец
    el.value = next;
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      // некоторые типы полей не поддерживают выделение
    }
    onValueChange(next);
  }
  return (
    <input
      ref={ref}
      value={value}
      onChange={onChange}
      aria-invalid={invalid || undefined}
      className={className}
      {...rest}
    />
  );
});

/** Телефон: фиксированный «+7» и 10 цифр по маске «916 000-00-21». */
export const PhoneInput = forwardRef<HTMLInputElement, BaseInputProps>(function PhoneInput(
  { invalid, className = "", ...rest },
  ref,
) {
  const format = (raw: string) => {
    let d = raw.replace(/\D/g, "");
    // 11 цифр с 7/8 впереди (вставили «+7…»/«8…» или набрали 8 и ещё 10 цифр) — отрезаем код страны
    if (d.length === 11 && (d[0] === "7" || d[0] === "8")) d = d.slice(1);
    return maskPhone10(d);
  };
  return (
    <div
      className={`flex h-[52px] overflow-hidden ${inputBox} ${invalid ? "shadow-invalid" : ""} ${className}`}
    >
      <span className="grid place-items-center pl-4 pr-1 text-[17px] font-medium text-ink-muted" aria-hidden="true">
        +7
      </span>
      <MaskedInput
        ref={ref}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="000 000-00-00"
        maxLength={18}
        format={format}
        invalid={invalid}
        className="min-w-0 flex-1 bg-transparent pl-1.5 pr-3 text-[17px] font-medium tracking-[0.3px] text-ink outline-none placeholder:font-normal placeholder:text-ink-faint"
        {...rest}
      />
    </div>
  );
});

/** Крупное поле суммы со знаком рубля. */
export const AmountInput = forwardRef<HTMLInputElement, BaseInputProps>(function AmountInput(
  { invalid, className = "", ...rest },
  ref,
) {
  return (
    <div
      className={`flex h-[60px] items-center px-4 ${inputBox} ${invalid ? "shadow-invalid" : ""} ${className}`}
    >
      <MaskedInput
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        maxLength={16}
        format={(raw) => formatAmountInput(raw)}
        significant={/[\d.,]/}
        invalid={invalid}
        className="min-w-0 flex-1 bg-transparent text-[26px] font-bold text-ink outline-none placeholder:text-ink-faint"
        {...rest}
      />
      <span className="text-[22px] font-semibold text-ink-faint" aria-hidden="true">
        ₽
      </span>
    </div>
  );
});

/** Пароль с кнопкой «показать». */
export const PasswordInput = forwardRef<HTMLInputElement, BaseInputProps & { toggleTestId: string }>(
  function PasswordInput({ invalid, toggleTestId, className = "", value, onValueChange, ...rest }, ref) {
    const [shown, setShown] = useState(false);
    return (
      <div className={`flex h-12 items-center ${inputBox} ${invalid ? "shadow-invalid" : ""} ${className}`}>
        <input
          ref={ref}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          aria-invalid={invalid || undefined}
          className="h-full min-w-0 flex-1 bg-transparent px-4 text-[15px] outline-none placeholder:text-ink-faint"
          {...rest}
        />
        <button
          type="button"
          data-testid={toggleTestId}
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
          className="grid h-full w-12 place-items-center text-ink-muted hover:text-ink"
        >
          {shown ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
    );
  },
);

/** Нативный select, оформленный как поле. */
export function SelectBox({
  id,
  value,
  onChange,
  testId,
  children,
  invalid,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
  children: ReactNode;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`relative ${inputBox} ${invalid ? "shadow-invalid" : ""}`}>
      <select
        id={id}
        data-testid={testId}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full appearance-none rounded-control bg-transparent pl-4 pr-10 text-[15px] text-ink outline-none focus:shadow-focus disabled:text-ink-faint"
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </div>
  );
}
