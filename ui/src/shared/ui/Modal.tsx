import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * ВНИМАНИЕ: намеренно НЕ проставляется в DOM (реализм для автотестов).
   * Модалку ищем по роли: `[role="dialog"]` + `aria-label` (= title),
   * крестик — по `button[aria-label="Закрыть"]`. Проп сохранён, чтобы не
   * переписывать все места вызова; значение игнорируется.
   */
  testId?: string;
  maxWidth?: number;
}

/** Простая модалка с фиксированным overlay, ESC для закрытия. */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  testId,
  maxWidth = 420,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  // Портал в body: модалка может открываться из компонентов, вложенных в
  // position:sticky/relative-предков (например, сайдбар) — те создают свой
  // stacking context и «запирают» fixed+z-index модалки внутри себя, из-за
  // чего контент вне этого предка (например, промо-карусель) рисуется поверх
  // неё несмотря на z-[100]. Портал полностью выносит DOM-узел из-под таких
  // предков.
  return createPortal(
    <div
      className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[100] backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-surface-2 rounded-card p-5 w-full border border-line max-h-[90vh] overflow-y-auto"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-1">
          <div className="text-[17px] font-medium">{title}</div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-ink-muted hover:text-ink-primary transition"
          >
            <i className="ti ti-x text-lg" aria-hidden="true"></i>
          </button>
        </div>
        {subtitle && <div className="text-xs text-ink-secondary mb-4">{subtitle}</div>}
        <div>{children}</div>
        {footer && <div className="mt-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
