import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { StepHeader } from "@/features/auth/StepHeader";

interface Props {
  title: string;
  step: number;
  total: number;
  onBack: () => void;
  canGoBack?: boolean;
  children: ReactNode;
}

/** Универсальный контейнер для потока перевода: заголовок + прогресс + карточка. */
export function TransferShell({ title, step, total, onBack, canGoBack = true, children }: Props) {
  const navigate = useNavigate();
  return (
    <div className="max-w-[560px] mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => navigate("/home")}
          className="flex items-center gap-1.5 text-[13px] text-ink-secondary hover:text-ink-primary transition"
        >
          <i className="ti ti-arrow-left" aria-hidden="true"></i>
          На главную
        </button>
      </div>

      <div className="card">
        <div className="mb-4">
          <div className="text-[18px] font-medium">{title}</div>
        </div>
        <StepHeader total={total} active={step} onBack={canGoBack ? onBack : undefined} />
        {children}
      </div>
    </div>
  );
}
