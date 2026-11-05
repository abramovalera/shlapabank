import type { ReactNode } from "react";
import { Button } from "./Button";
import { IconAlert, IconInfo } from "./icons";

/** Белая карточка-секция. */
export function Card({ children, className = "", testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <section data-testid={testId} className={`rounded-card bg-white ${className}`}>
      {children}
    </section>
  );
}

type NoticeTone = "info" | "error" | "success" | "neutral";

const NOTICE: Record<NoticeTone, string> = {
  info: "bg-info-bg text-info-text",
  error: "bg-danger-soft text-danger-text",
  success: "bg-success-soft text-success-dark",
  neutral: "bg-page text-ink-muted",
};

/** Плашка с иконкой: подсказка, ошибка, успех. */
export function Notice({
  tone = "info",
  title,
  children,
  testId,
  className = "",
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      role={tone === "error" ? "alert" : undefined}
      className={`flex items-start gap-2 rounded-small px-3 py-2.5 text-[13px] leading-[18px] ${NOTICE[tone]} ${className}`}
    >
      {tone !== "neutral" &&
        (tone === "error" ? (
          <IconAlert size={16} className="mt-px flex-none" />
        ) : (
          <IconInfo size={16} className="mt-px flex-none" />
        ))}
      <span className="min-w-0">
        {title && <span className="block font-semibold">{title}</span>}
        {children}
      </span>
    </div>
  );
}

type BadgeTone = "green" | "orange" | "red" | "grey" | "blue";

const BADGE: Record<BadgeTone, string> = {
  green: "bg-success-soft text-success-dark",
  orange: "bg-warn-soft text-warn",
  red: "bg-danger-soft text-danger-text",
  grey: "bg-page text-ink-muted",
  blue: "bg-primary-soft text-primary-hover",
};

export function Badge({ tone, children, testId }: { tone: BadgeTone; children: ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex flex-none items-center whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-semibold ${BADGE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Серый прямоугольник-заглушка на время загрузки. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block rounded-md bg-[#eceef2] ${className}`} />;
}

/** Строки-заглушки для списков. */
export function RowsSkeleton({ rows = 3, testId }: { rows?: number; testId?: string }) {
  return (
    <div data-testid={testId} aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-6 py-2.5">
          <Skeleton className="h-10 w-10 flex-none rounded-full" />
          <span className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </span>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function LoadError({
  message,
  onRetry,
  testId,
  className = "",
}: {
  message?: string;
  onRetry?: () => void;
  testId: string;
  className?: string;
}) {
  return (
    <div data-testid={testId} className={`flex flex-col items-start gap-3 px-6 py-4 ${className}`}>
      <Notice tone="error" className="w-full">
        {message || "Не удалось загрузить данные."}
      </Notice>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry} data-testid={`${testId}-retry`}>
          Повторить
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
  testId,
}: {
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  testId: string;
}) {
  return (
    <div data-testid={testId} className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <div className="font-semibold">{title}</div>
      {text && <div className="max-w-sm text-sm text-ink-muted">{text}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ProgressBar({ percent, color = "#007dff", testId }: { percent: number; color?: string; testId?: string }) {
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div
      data-testid={testId}
      role="progressbar"
      aria-valuenow={Math.round(p)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 rounded bg-line"
    >
      <div className="h-2 rounded" style={{ width: `${p}%`, background: color }} />
    </div>
  );
}

/** Сводка «подпись — значение» в строку. */
export function KeyValue({
  label,
  value,
  testId,
  last,
}: {
  label: ReactNode;
  value: ReactNode;
  testId?: string;
  last?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-4 py-2 ${last ? "" : "shadow-row-bottom"}`}>
      <span className="text-ink-muted">{label}</span>
      <span data-testid={testId} className="text-right font-medium">
        {value}
      </span>
    </div>
  );
}
