import { ReactNode, useEffect, useRef, useState } from "react";

interface Props {
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right" | "stretch";
  className?: string;
  testId?: string;
}

/**
 * Универсальный dropdown: клик по триггеру открывает панель,
 * клик снаружи / Escape — закрывают. Панель абсолютно спозиционирована.
 */
export function Dropdown({ trigger, children, align = "stretch", className, testId }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const alignClass =
    align === "left" ? "left-0" : align === "right" ? "right-0" : "left-0 right-0";

  return (
    <div className={`relative ${className ?? ""}`} ref={wrapRef} data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-full text-left"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full mt-1.5 ${alignClass} rounded-card border border-line bg-surface-2 shadow-glow py-1.5 z-50 fade-up max-h-[280px] overflow-y-auto`}
          style={{ animationDuration: "0.2s" }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
