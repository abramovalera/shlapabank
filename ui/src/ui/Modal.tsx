import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  title: ReactNode;
  testId: string;
  /** null — окно нельзя закрыть крестиком, Esc и кликом по фону */
  onClose: (() => void) | null;
  children: ReactNode;
  subtitle?: ReactNode;
  width?: number;
}

export function Modal({ open, title, testId, onClose, children, subtitle, width = 440 }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Фокус на первый элемент внутри окна
    const first = dialogRef.current?.querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea, button:not([disabled]):not([data-modal-close])",
    );
    (first ?? dialogRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeRef.current) closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(16,24,40,0.45)] px-4 py-10 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        style={{ maxWidth: width }}
        className="relative flex w-full flex-col gap-[18px] rounded-dialog bg-white p-6 shadow-dialog outline-none sm:p-7"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[22px] font-bold leading-[30px]">
              {title}
            </h2>
            {subtitle && <div className="mt-1 text-ink-muted">{subtitle}</div>}
          </div>
          {onClose && (
            <button
              type="button"
              data-modal-close
              data-testid={`${testId}-close`}
              aria-label="Закрыть"
              onClick={onClose}
              className="-mr-2 -mt-1 grid h-9 w-9 flex-none place-items-center rounded-full text-ink-muted hover:bg-page hover:text-ink"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M7 7l10 10" />
                <path d="M17 7L7 17" />
              </svg>
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
