import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export interface DropdownItem {
  label: string;
  to: string;
  icon?: string;
  testId?: string;
}

interface Props {
  label: string;
  items: DropdownItem[];
  activePaths?: string[];
  testId?: string;
}

/**
 * Пункт меню в шапке с выпадающим списком.
 * Открывается по клику, закрывается по клику снаружи или Escape.
 * Подчёркивается индиго-подобной чертой, если текущий путь входит в activePaths.
 */
export function NavDropdown({ label, items, activePaths = [], testId }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const isActive =
    activePaths.some((p) => location.pathname.startsWith(p)) ||
    items.some((i) => location.pathname.startsWith(i.to));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`text-[14px] pb-1.5 transition flex items-center gap-1 ${
          isActive
            ? "text-ink-primary font-medium border-b-2 border-brand-strong"
            : "text-ink-secondary hover:text-ink-primary"
        }`}
      >
        {label}
        <i
          className={`ti ti-chevron-${open ? "up" : "down"} text-sm mt-0.5 transition-transform`}
          aria-hidden="true"
        ></i>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 min-w-[220px] rounded-card border border-line bg-surface-2 shadow-glow py-2 z-50 fade-up"
          style={{ animationDuration: "0.2s" }}
        >
          {items.map((item) => (
            <button
              key={item.to + item.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate(item.to);
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-ink-primary hover:bg-fill-hover transition text-left"
            >
              {item.icon && (
                <i
                  className={`ti ti-${item.icon} text-base text-ink-secondary`}
                  aria-hidden="true"
                ></i>
              )}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
