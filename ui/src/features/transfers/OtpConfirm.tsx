import { useCallback, useEffect, useRef, useState } from "react";
import { PinInput } from "@/features/auth/PinInput";
import { useRequestOtp, OtpPreview } from "./useOtp";

interface Props {
  onSubmit: (code: string) => Promise<void>;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
}

const OTP_TTL_SEC = 60;

export function OtpConfirm({ onSubmit, submitLabel, busy, error }: Props) {
  const [code, setCode] = useState("");
  const [hint, setHint] = useState<OtpPreview | null>(null);
  const [remaining, setRemaining] = useState(OTP_TTL_SEC);
  const [requestError, setRequestError] = useState<string | null>(null);
  const req = useRequestOtp();
  const intervalRef = useRef<number | null>(null);

  const requestNew = useCallback(async () => {
    setRequestError(null);
    try {
      const data = await req.mutateAsync();
      setHint(data);
      setRemaining(data.ttlSeconds ?? OTP_TTL_SEC);
      setCode("");
    } catch (e: any) {
      setRequestError("Не удалось запросить код. Попробуйте ещё раз.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Первый запрос при монтировании
  useEffect(() => {
    requestNew();
  }, [requestNew]);

  // Обратный отсчёт
  useEffect(() => {
    if (!hint) return;
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [hint]);

  const expired = remaining <= 0;

  return (
    <div>
      <div className="text-[12px] text-ink-secondary mb-2 flex items-center gap-1.5">
        <i className="ti ti-shield-lock text-sm" aria-hidden="true"></i>
        Одноразовый код (OTP) для подтверждения операции
      </div>

      {hint && !expired && (
        <button
          type="button"
          onClick={() => setCode(hint.otp)}
          className="w-full rounded-control bg-brand-soft border border-brand/30 hover:bg-brand/25 hover:border-brand/50 transition px-3 py-2 mb-3 text-center cursor-pointer"
          data-testid="otp-hint"
          title="Нажмите, чтобы вставить код (отправка вручную)"
        >
          <div className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">
            🧪 Тест-режим · нажмите, чтобы вставить в поле
          </div>
          <div className="font-mono text-[20px] font-medium text-accent tracking-[6px]">
            {hint.otp}
          </div>
        </button>
      )}

      {hint && expired && (
        <div
          className="rounded-control bg-danger-soft border border-danger/30 px-3 py-2 mb-3 text-center"
          data-testid="otp-expired"
        >
          <div className="text-[12px] text-danger font-medium">Код истёк</div>
          <div className="text-[11px] text-ink-secondary mt-0.5">
            Запросите новый код кнопкой ниже
          </div>
        </div>
      )}

      <div className="flex justify-center mb-3">
        <PinInput
          value={code}
          onChange={setCode}
          autoFocus
          showDigits
          invalid={expired}
          testId="otp-input"
        />
      </div>

      {!expired && hint && (
        <div className="text-[11px] text-ink-muted text-center mb-3" data-testid="otp-timer">
          Код действует ещё <span className="font-mono text-ink-primary">{fmt(remaining)}</span>
        </div>
      )}

      {(error || requestError) && (
        <div className="text-xs text-danger bg-danger-soft rounded-control px-3 py-2 mb-3 text-center">
          {error || requestError}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={() => code.length === 4 && !expired && onSubmit(code)}
          disabled={code.length !== 4 || busy || expired}
          className={`w-full py-2.5 rounded-control font-medium transition ${
            code.length === 4 && !busy && !expired
              ? "btn-primary"
              : "bg-fill-control text-ink-muted cursor-not-allowed"
          }`}
          data-testid="otp-submit"
        >
          {busy ? "Отправляем…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={requestNew}
          disabled={req.isPending}
          className="text-[12px] text-accent hover:underline mx-auto disabled:opacity-50 disabled:cursor-wait"
          data-testid="otp-request-new"
        >
          {req.isPending ? "Запрашиваем…" : expired ? "Запросить новый код" : "Обновить код"}
        </button>
      </div>
    </div>
  );
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
