import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { useAuthStore } from "@/shared/stores/auth";
import { TokenResponse } from "@/shared/api/types";
import { AuthShell, AuthLogo } from "@/features/auth/AuthShell";
import { StepHeader } from "@/features/auth/StepHeader";
import { PinInput } from "@/features/auth/PinInput";
import { markSessionUnlocked } from "@/features/auth/session";

type Step = 0 | 1 | 2;

interface OtpPreview {
  userId: number | null;
  otp: string | null;
  ttlSeconds: number;
  message: string;
}

/**
 * Восстановление пароля — 3 шага:
 *  0 — логин, дёргаем POST /auth/password/reset-request → генерирует OTP на бэке
 *  1 — ввод 4-значного OTP. Подсказку с кодом тянем через ЕДИНУЮ ручку
 *      GET /helper/otp/preview?login=<логин> — та же самая, что и в переводах/платежах
 *  2 — новый пароль + повтор, сохраняем и логиним пользователя
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const setToken = useAuthStore((s) => s.setToken);

  const [step, setStep] = useState<Step>(0);
  const [login, setLogin] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [hint, setHint] = useState<OtpPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRequestReset() {
    setError(null);
    if (login.trim().length < 1) return setError("Введите логин");
    setLoading(true);
    try {
      // 1. Триггерим генерацию OTP на бэке — ответ намеренно пустой (защита от перебора)
      await api.post("/auth/password/reset-request", { login });
      // 2. Забираем код через ЕДИНУЮ ручку OTP (по логину, без Bearer)
      const { data } = await api.get<OtpPreview>("/helper/otp/preview", {
        params: { login },
      });
      setHint(data.otp ? data : null);
      setStep(1);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? "Не удалось отправить запрос");
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmOtp(code: string) {
    // Просто переходим на следующий шаг, финальная проверка OTP произойдёт при сохранении.
    setOtp(code);
    setStep(2);
  }

  async function onSetNewPassword() {
    setError(null);
    if (password.length < 8) return setError("Пароль минимум 8 символов");
    if (password !== passwordConfirm) return setError("Пароли не совпадают");
    setLoading(true);
    try {
      const { data } = await api.post<TokenResponse>("/auth/password/reset-confirm", {
        login,
        otp_code: otp,
        new_password: password,
      });
      setToken(data.access_token, data.role ?? null, login);
      markSessionUnlocked();
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? "Не удалось сохранить пароль";
      if (typeof detail === "string" && detail.includes("invalid_otp_code")) {
        setError("Неверный или истёкший OTP. Вернитесь на шаг ввода кода.");
      } else if (typeof detail === "string") {
        setError(detail);
      } else {
        setError("Не удалось сохранить пароль");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <StepHeader
        total={3}
        active={step}
        onBack={step > 0 ? () => setStep((step - 1) as Step) : undefined}
      />
      <AuthLogo />

      {step === 0 && (
        <div>
          <div className="text-center text-[20px] font-semibold text-ink-primary mb-1">
            Восстановление
          </div>
          <div className="text-center text-[12px] text-ink-secondary mb-5">
            Введите логин — вышлем OTP код
          </div>

          <input
            className="input h-12 rounded-control px-4 text-[14px] mb-3"
            placeholder="Логин"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            data-testid="forgot-login-input"
          />

          {error && (
            <div className="text-xs text-danger bg-danger-soft rounded-control px-3 py-2 mb-3">
              {error}
            </div>
          )}

          <button
            onClick={onRequestReset}
            disabled={loading}
            className="btn-primary w-full h-12 text-[15px]"
            data-testid="forgot-request-btn"
          >
            {loading ? "Отправляем…" : "Выслать код"}
          </button>

          <div className="text-center text-[11px] text-ink-muted mt-4">
            Вспомнили?{" "}
            <Link to="/login" className="text-accent hover:underline">
              Войти
            </Link>
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="text-center text-[20px] font-semibold text-ink-primary mb-1">
            OTP код
          </div>
          <div className="text-center text-[12px] text-ink-secondary mb-5">
            {hint
              ? `Код действует ${hint.ttlSeconds} секунд`
              : "Введите 4 цифры из SMS"}
          </div>

          {hint?.otp && (
            <button
              type="button"
              onClick={() => {
                setOtp(hint.otp!);
                onConfirmOtp(hint.otp!);
              }}
              className="w-full mb-4 rounded-control bg-brand-soft border border-brand/30 hover:bg-brand/25 hover:border-brand/50 transition px-3 py-2 text-center cursor-pointer"
              data-testid="forgot-otp-hint"
              title="Нажмите, чтобы подставить код автоматически"
            >
              <div className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">
                🧪 Тест-режим · нажмите, чтобы вставить
              </div>
              <div className="text-[20px] font-mono font-medium text-accent tracking-[6px]">
                {hint.otp}
              </div>
            </button>
          )}

          <div className="flex justify-center mb-4">
            <PinInput
              value={otp}
              onChange={setOtp}
              onComplete={onConfirmOtp}
              autoFocus
              showDigits
              testId="forgot-otp-input"
            />
          </div>

          {error && (
            <div className="text-xs text-danger bg-danger-soft rounded-control px-3 py-2 mb-3 text-center">
              {error}
            </div>
          )}

          <div className="text-center text-[11px] text-ink-muted">
            Не пришёл код?{" "}
            <button
              onClick={onRequestReset}
              className="text-accent hover:underline"
              data-testid="forgot-resend-btn"
            >
              Отправить снова
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="text-center text-[20px] font-semibold text-ink-primary mb-1">
            Новый пароль
          </div>
          <div className="text-center text-[12px] text-ink-secondary mb-5">
            Минимум 8 символов, буквы и цифры
          </div>

          <input
            className="input h-12 rounded-control px-4 text-[14px] mb-2.5"
            placeholder="Новый пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="forgot-new-password-input"
          />
          <input
            className="input h-12 rounded-control px-4 text-[14px] mb-4"
            placeholder="Повторите"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            data-testid="forgot-new-password-confirm-input"
          />

          {error && (
            <div className="text-xs text-danger bg-danger-soft rounded-control px-3 py-2 mb-3">
              {error}
            </div>
          )}

          <button
            onClick={onSetNewPassword}
            disabled={loading}
            className="btn-primary w-full h-12 text-[15px]"
            data-testid="forgot-save-btn"
          >
            {loading ? "Сохраняем…" : "Сохранить и войти"}
          </button>
        </div>
      )}
    </AuthShell>
  );
}
