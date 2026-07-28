import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/shared/stores/auth";
import { markSessionUnlocked } from "@/features/auth/session";
import { PinInput } from "@/features/auth/PinInput";
import { AuthShell, AuthLogo } from "@/features/auth/AuthShell";

const MAX_ATTEMPTS = 3;

export function PinLoginPage() {
  const navigate = useNavigate();
  const verifyPin = useAuthStore((s) => s.verifyPin);
  const clearPin = useAuthStore((s) => s.clearPin);
  const logout = useAuthStore((s) => s.logout);
  const userLogin = useAuthStore((s) => s.login);

  const [value, setValue] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [invalid, setInvalid] = useState(false);

  function onComplete(code: string) {
    if (verifyPin(code)) {
      markSessionUnlocked();
      navigate("/dashboard", { replace: true });
      return;
    }
    setInvalid(true);
    setValue("");
    const next = attempts + 1;
    setAttempts(next);
    setTimeout(() => setInvalid(false), 500);
    if (next >= MAX_ATTEMPTS) {
      logout();
      navigate("/login", { replace: true });
    }
  }

  function onForgot() {
    clearPin();
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <AuthShell maxWidth={380}>
      <AuthLogo />
      <div className="text-center text-[22px] font-semibold text-ink-primary mb-1.5">
        Введите код доступа
      </div>
      <div className="text-center text-[13px] text-ink-secondary mb-8">
        {userLogin ? (
          <>
            Аккаунт <span className="text-ink-primary font-medium">{userLogin}</span>
          </>
        ) : (
          "Быстрый вход"
        )}
      </div>

      <div className="flex justify-center mb-6">
        <PinInput
          value={value}
          onChange={setValue}
          onComplete={onComplete}
          invalid={invalid}
          autoFocus
          testId="pin-login-input"
        />
      </div>

      {invalid && (
        <div className="text-xs text-danger text-center mb-3" data-testid="pin-error">
          Неверный код. Осталось попыток: {MAX_ATTEMPTS - attempts}
        </div>
      )}

      <div className="text-center">
        <button
          onClick={onForgot}
          className="text-sm text-accent hover:underline"
          data-testid="pin-forgot-btn"
        >
          Войти по паролю
        </button>
      </div>
    </AuthShell>
  );
}
