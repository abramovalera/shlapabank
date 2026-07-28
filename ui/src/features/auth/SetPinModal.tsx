import { useState } from "react";
import { PinInput } from "./PinInput";
import { useAuthStore } from "@/shared/stores/auth";

interface Props {
  open: boolean;
  onDone: () => void;
  onSkip: () => void;
}

/** Двухшаговая установка PIN: ввод → повторить → сохранить. */
export function SetPinModal({ open, onDone, onSkip }: Props) {
  const setPin = useAuthStore((s) => s.setPin);
  const [step, setStep] = useState<"first" | "confirm">("first");
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function onFirstComplete(v: string) {
    setFirst(v);
    setStep("confirm");
  }

  function onSecondComplete(v: string) {
    if (v === first) {
      setPin(first);
      onDone();
    } else {
      setError("Коды не совпадают. Попробуйте ещё раз");
      setSecond("");
      setStep("first");
      setFirst("");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-[100] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface-2 border border-line rounded-card p-6 w-full max-w-[380px] text-center"
        data-testid="set-pin-modal"
      >
        <div className="text-lg font-medium mb-1.5">
          {step === "first" ? "Задайте код доступа" : "Повторите код"}
        </div>
        <div className="text-[13px] text-ink-secondary mb-5 leading-relaxed">
          {step === "first"
            ? "Для быстрого входа. Работает только в этом браузере, стирается при выходе."
            : "Введите те же 4 цифры ещё раз"}
        </div>

        <div className="flex justify-center mb-4">
          {step === "first" ? (
            <PinInput
              value={first}
              onChange={setFirst}
              onComplete={onFirstComplete}
              autoFocus
              testId="pin-input-first"
            />
          ) : (
            <PinInput
              value={second}
              onChange={setSecond}
              onComplete={onSecondComplete}
              autoFocus
              testId="pin-input-confirm"
            />
          )}
        </div>

        {error && <div className="text-xs text-danger mb-3">{error}</div>}

        <button
          onClick={onSkip}
          className="text-sm text-accent hover:underline"
          data-testid="set-pin-skip-btn"
        >
          Не сейчас
        </button>
      </div>
    </div>
  );
}
