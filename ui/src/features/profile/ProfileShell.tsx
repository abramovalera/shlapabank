import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function ProfileShell({ title, subtitle, children }: Props) {
  const navigate = useNavigate();
  return (
    <div className="max-w-[560px] mx-auto space-y-3">
      <button
        onClick={() => navigate("/profile")}
        className="flex items-center gap-2 text-[13px] text-ink-secondary hover:text-ink-primary transition"
      >
        <i className="ti ti-arrow-left" aria-hidden="true"></i>
        Профиль
      </button>
      <div className="card">
        <div className="mb-4">
          <div className="text-[18px] font-medium">{title}</div>
          {subtitle && <div className="text-[12px] text-ink-secondary mt-1">{subtitle}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
