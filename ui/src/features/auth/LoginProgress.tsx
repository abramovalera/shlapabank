import { useEffect, useState } from "react";
import { AuthLogo } from "./AuthShell";

interface Props {
  onDone: () => void;
  duration?: number;
}

const STEPS = [
  "Проверяем данные",
  "Загружаем счета",
  "Готовим карты",
  "Почти готово",
];

/**
 * Экран загрузки после успешного входа. Полоса заполняется за `duration` мс,
 * подписи-этапы переключаются по мере заполнения. По завершении вызывается onDone.
 */
export function LoginProgress({ onDone, duration = 2000 }: Props) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const stepInterval = duration / STEPS.length;
    const timers = STEPS.map((_, i) =>
      window.setTimeout(() => setStepIdx(i), i * stepInterval)
    );
    const finish = window.setTimeout(onDone, duration);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(finish);
    };
  }, [onDone, duration]);

  return (
    <div className="text-center" data-testid="login-progress">
      <AuthLogo />
      <div className="text-[18px] font-medium text-ink-primary mb-1">Входим в аккаунт</div>
      <div className="text-[13px] text-ink-secondary mb-6 h-[18px] transition-all">
        {STEPS[stepIdx]}…
      </div>

      <div className="h-1.5 rounded-pill overflow-hidden bg-line-strong">
        <div
          className="h-full progress-fill rounded-pill"
          style={{
            background: "linear-gradient(90deg, #FFA347 0%, #F09427 100%)",
            boxShadow: "0 0 12px rgba(240,148,39,0.6)",
          }}
        />
      </div>
    </div>
  );
}
