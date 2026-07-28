import { ReactNode } from "react";

interface Props {
  icon: string;
  title: string;
  hint?: string;
  actionLabel: string;
  onAction: () => void;
  testId?: string;
  actionTestId?: string;
}

/**
 * Компактная плашка пустого состояния для секций дашборда:
 * пунктирная рамка + иконка + подпись + основная кнопка.
 */
export function EmptyState({
  icon,
  title,
  hint,
  actionLabel,
  onAction,
  testId,
  actionTestId,
}: Props): JSX.Element {
  return (
    <div
      className="text-center py-4 px-2 border border-dashed border-line-strong rounded-[10px]"
      data-testid={testId}
    >
      <div className="w-10 h-10 mx-auto mb-2.5 rounded-full bg-fill-control flex items-center justify-center">
        <i className={`ti ti-${icon} text-xl text-ink-muted`} aria-hidden="true"></i>
      </div>
      <div className="text-[13px] font-medium mb-1">{title}</div>
      {hint && <div className="text-[11px] text-ink-muted mb-2.5">{hint}</div>}
      <button
        onClick={onAction}
        className="btn-primary text-xs py-1.5 px-3.5"
        data-testid={actionTestId}
      >
        <i className="ti ti-plus text-xs" aria-hidden="true"></i>
        {actionLabel}
      </button>
    </div>
  );
}
