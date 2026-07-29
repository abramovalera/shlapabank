import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useAuthStore } from "@/shared/stores/auth";
import { TokenResponse } from "@/shared/api/types";
import { AuthShell, AuthLogo } from "@/features/auth/AuthShell";
import { StepHeader } from "@/features/auth/StepHeader";
import { resetUserCache } from "@/shared/lib/authCache";
import { apiErrorMessage } from "@/shared/api/errors";

type Step = 0 | 1;

/** Регистрация в 2 шага. После успешного логина — сразу на дашборд. */
export function RegisterPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setToken = useAuthStore((s) => s.setToken);

  const [step, setStep] = useState<Step>(0);
  const [login, setLogin] = useState("");
  const [loginAvailable, setLoginAvailable] = useState<null | boolean>(null);
  const [checking, setChecking] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loginValid = /^[A-Za-z0-9]{6,20}$/.test(login);
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneValid = phoneDigits.length === 10 || phoneDigits.length === 11;

  async function checkAvailability() {
    if (!loginValid) return;
    setChecking(true);
    try {
      const { data } = await api.get<{ available: boolean }>("/auth/login-available", {
        params: { login },
      });
      setLoginAvailable(data.available);
    } catch {
      setLoginAvailable(null);
    } finally {
      setChecking(false);
    }
  }

  function onNext() {
    setError(null);
    if (!loginValid) return setError("Логин: 6–20 символов, только буквы и цифры");
    if (loginAvailable === false) return setError("Логин уже занят");
    if (!phoneValid) return setError("Введите корректный номер телефона");
    setStep(1);
  }

  async function onSubmit() {
    setError(null);
    if (password.length < 8) return setError("Пароль минимум 8 символов");
    if (password !== passwordConfirm) return setError("Пароли не совпадают");
    if (!agree) return setError("Нужно принять условия");
    setLoading(true);
    try {
      await api.post("/auth/register", { login, password, phone });
      const { data } = await api.post<TokenResponse>("/auth/login", { login, password });
      // Сброс кеша прошлого юзера — важно, иначе новый увидит чужие данные
      resetUserCache(qc);
      setToken(data.access_token, data.role ?? null, login);
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const strength = passwordStrength(password);

  return (
    <AuthShell>
      <StepHeader
        total={2}
        active={step}
        onBack={step > 0 ? () => setStep(0) : () => navigate("/login")}
      />
      <AuthLogo />

      {step === 0 && (
        <div>
          <div className="text-center text-[20px] font-semibold text-ink-primary mb-1">
            Придумайте логин
          </div>
          <div className="text-center text-[12px] text-ink-secondary mb-5">
            6–20 символов, только буквы и цифры
          </div>

          <input
            className="input h-12 rounded-control px-4 text-[14px]"
            placeholder="mynewlogin"
            value={login}
            onChange={(e) => {
              setLogin(e.target.value);
              setLoginAvailable(null);
            }}
            onBlur={checkAvailability}
            data-testid="register-login-input"
          />

          <div className="min-h-[18px] mt-2 mb-4 text-[11px] flex items-center gap-1.5">
            {checking && <span className="text-ink-muted">Проверяем…</span>}
            {!checking && loginValid && loginAvailable === true && (
              <span className="text-success flex items-center gap-1">
                <i className="ti ti-check text-[13px]" aria-hidden="true"></i>
                Логин свободен
              </span>
            )}
            {!checking && loginValid && loginAvailable === false && (
              <span className="text-danger flex items-center gap-1">
                <i className="ti ti-x text-[13px]" aria-hidden="true"></i>
                Логин занят
              </span>
            )}
            {!checking && login.length > 0 && !loginValid && (
              <span className="text-ink-muted">Только латиница и цифры, 6–20 знаков</span>
            )}
          </div>

          <input
            className="input h-12 rounded-control px-4 text-[14px]"
            placeholder="+79991234567"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            data-testid="register-phone-input"
          />
          <div className="text-[11px] text-ink-muted mt-1.5 mb-1">
            Нужен, чтобы вам могли перевести деньги по номеру телефона
          </div>

          {error && (
            <div className="text-xs text-danger bg-danger-soft rounded-control px-3 py-2 mb-3 mt-2">
              {error}
            </div>
          )}

          <button
            onClick={onNext}
            disabled={!loginValid || loginAvailable === false || !phoneValid}
            className="btn-primary w-full h-12 text-[15px] mt-3"
            data-testid="register-next-btn"
          >
            Далее
          </button>

          <div className="text-center text-[11px] text-ink-muted mt-4">
            Уже есть аккаунт?{" "}
            <Link to="/login" className="text-accent hover:underline">
              Войти
            </Link>
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="text-center text-[20px] font-semibold text-ink-primary mb-1">
            Установите пароль
          </div>
          <div className="text-center text-[12px] text-ink-secondary mb-5">
            Минимум 8 символов, буквы и цифры
          </div>

          <div className="relative mb-2.5">
            <input
              className="input h-12 pr-11 rounded-control px-4 text-[14px]"
              placeholder="Пароль"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="register-password-input"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-primary transition p-1"
            >
              <i className={`ti ti-${showPassword ? "eye-off" : "eye"} text-lg`} aria-hidden="true"></i>
            </button>
          </div>
          <div className="relative mb-3">
            <input
              className="input h-12 pr-11 rounded-control px-4 text-[14px]"
              placeholder="Повторите пароль"
              type={showPassword ? "text" : "password"}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              data-testid="register-password-confirm-input"
            />
          </div>

          <div className="flex gap-1 mb-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex-1 h-1 rounded-pill transition ${
                  i < strength.level
                    ? strength.level >= 3
                      ? "bg-success"
                      : strength.level === 2
                      ? "bg-warning"
                      : "bg-danger"
                    : "bg-line-strong"
                }`}
              />
            ))}
          </div>
          <div className="text-[11px] text-ink-muted mb-4">Надёжность: {strength.label}</div>

          <label className="flex items-start gap-2 text-[12px] text-ink-secondary mb-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5"
              data-testid="register-terms-checkbox"
            />
            <span>
              Принимаю <a className="text-accent">условия обслуживания</a>
            </span>
          </label>

          {error && (
            <div className="text-xs text-danger bg-danger-soft rounded-control px-3 py-2 mb-3">
              {error}
            </div>
          )}

          <button
            onClick={onSubmit}
            disabled={loading}
            className="btn-primary w-full h-12 text-[15px]"
            data-testid="register-submit-btn"
          >
            {loading ? "Создаём…" : "Создать аккаунт"}
          </button>
        </div>
      )}
    </AuthShell>
  );
}

function passwordStrength(pw: string): { level: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const clamped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const labels = ["очень слабая", "слабая", "средняя", "хорошая", "отличная"];
  return { level: clamped, label: labels[clamped] };
}
