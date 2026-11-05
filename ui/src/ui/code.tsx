import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { formatCountdown } from "./format";
import { LinkButton, Spinner } from "./Button";
import { Notice } from "./blocks";

export const CODE_LENGTH = 4;
const RESEND_MAX_SECONDS = 60;

/**
 * Момент по часам браузера: момент получения ответа + N секунд из ответа банка
 * (resend_in_seconds / expires_in_seconds). Часы банка и браузера могут расходиться
 * (время банка двигают), поэтому абсолютные resend_available_at / expires_at не используем.
 * Нет числа — `fallback` (для истечения — «никогда», для повторной отправки — «сразу»).
 */
export function deadlineIn(seconds: number | null | undefined, receivedAt = Date.now(), fallback = 0): number {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return fallback === 0 ? receivedAt : fallback;
  return receivedAt + Math.max(0, seconds) * 1000;
}

/** Когда можно запросить новый код (по часам браузера). */
export function resendDeadline(seconds: number | null | undefined, receivedAt = Date.now()): number {
  return deadlineIn(seconds, receivedAt);
}

/** Когда код истечёт (по часам браузера); нет данных — не считаем истёкшим. */
export function expiryDeadline(seconds: number | null | undefined, receivedAt = Date.now()): number {
  return deadlineIn(seconds, receivedAt, Number.POSITIVE_INFINITY);
}

/** Текущее время, обновляется раз в секунду. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

interface OtpInputProps {
  onComplete: (code: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}

/** 4 ячейки кода: ввод по одной цифре, вставка целиком, Backspace назад. */
export function OtpInput({ onComplete, invalid, disabled }: OtpInputProps) {
  const [cells, setCells] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!disabled) refs.current[0]?.focus();
  }, [disabled]);

  function update(next: string[], focusIndex: number) {
    setCells(next);
    refs.current[Math.min(focusIndex, CODE_LENGTH - 1)]?.focus();
    if (next.every((c) => c !== "")) onComplete(next.join(""));
  }

  function onInput(i: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    const next = [...cells];
    if (!digits) {
      next[i] = "";
      setCells(next);
      return;
    }
    // Вставка или ввод поверх цифры — раскладываем по ячейкам начиная с текущей
    const typed = cells[i] !== "" && digits.length === 2 ? digits.replace(cells[i], "") : digits;
    let j = i;
    for (const d of typed) {
      if (j >= CODE_LENGTH) break;
      next[j++] = d;
    }
    update(next, j);
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && cells[i] === "" && i > 0) {
      e.preventDefault();
      const next = [...cells];
      next[i - 1] = "";
      setCells(next);
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) {
      refs.current[i + 1]?.focus();
    }
  }

  return (
    <div className="flex justify-center gap-2.5" role="group" aria-label="Код из SMS">
      {cells.map((c, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          data-testid={`otp-cell-${i + 1}`}
          aria-label={`Цифра ${i + 1}`}
          value={c}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={CODE_LENGTH}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          className={`h-16 w-14 rounded-control bg-page text-center text-[26px] font-bold text-ink outline-none focus:shadow-focus disabled:opacity-60 ${
            invalid ? "shadow-invalid" : ""
          }`}
        />
      ))}
    </div>
  );
}

interface CodeStepProps {
  /** Префикс data-testid: `<prefix>-error`, `<prefix>-timer`, `<prefix>-resend` */
  testPrefix: string;
  sentTo: ReactNode;
  summary?: ReactNode;
  /** Когда можно запросить новый код — момент по часам браузера (см. resendDeadline) */
  resendAt: number;
  /** Когда код истечёт — момент по часам браузера (см. expiryDeadline) */
  expiresAt: number;
  error: string | null;
  /** Ввод невозможен (попытки кончились и т.п.) */
  locked?: boolean;
  verifying: boolean;
  resending: boolean;
  onSubmit: (code: string) => void;
  onResend: () => void;
  footer?: ReactNode;
  /** Меняется — ячейки очищаются (после ошибки или нового кода) */
  resetKey: number;
}

export function CodeStep({
  testPrefix,
  sentTo,
  summary,
  resendAt,
  expiresAt,
  error,
  locked,
  verifying,
  resending,
  onSubmit,
  onResend,
  footer,
  resetKey,
}: CodeStepProps) {
  const now = useNow();
  const resendIn = Math.min(RESEND_MAX_SECONDS, Math.max(0, Math.ceil((resendAt - now) / 1000)));
  const expired = expiresAt <= now;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="-mt-3 text-ink-muted" data-testid={`${testPrefix}-sent-to`}>
        Отправили на <span className="font-semibold text-ink">{sentTo}</span>
      </div>
      {summary}
      <OtpInput key={resetKey} onComplete={onSubmit} invalid={!!error} disabled={verifying || locked} />
      {verifying && (
        <div className="flex items-center justify-center gap-2 text-sm text-ink-muted" data-testid={`${testPrefix}-verifying`}>
          <Spinner /> Проверяем код
        </div>
      )}
      {error && (
        <div role="alert" data-testid={`${testPrefix}-error`} className="text-center text-sm font-medium text-danger">
          {error}
        </div>
      )}
      {!error && expired && !locked && (
        <div data-testid={`${testPrefix}-expired`} className="text-center text-sm font-medium text-danger">
          Срок действия кода истёк. Запросите новый.
        </div>
      )}
      {!locked && (
        <div className="text-center text-sm text-ink-muted">
          {resendIn > 0 ? (
            <span data-testid={`${testPrefix}-timer`}>
              Новый код можно запросить через{" "}
              <span className="font-semibold text-ink">{formatCountdown(resendIn)}</span>
            </span>
          ) : (
            <LinkButton data-testid={`${testPrefix}-resend`} onClick={onResend} disabled={resending || verifying}>
              {resending ? "Отправляем…" : "Отправить код ещё раз"}
            </LinkButton>
          )}
        </div>
      )}
      <Notice tone="info">Код действует 5 минут. Никому его не сообщайте.</Notice>
      {footer}
    </div>
  );
}
