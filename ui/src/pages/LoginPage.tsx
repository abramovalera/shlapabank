import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { useAuthStore } from "@/shared/stores/auth";
import { TokenResponse } from "@/shared/api/types";
import { AuthShell, AuthLogo } from "@/features/auth/AuthShell";
import { SetPinModal } from "@/features/auth/SetPinModal";
import { LoginProgress } from "@/features/auth/LoginProgress";
import { markSessionUnlocked } from "@/features/auth/session";
import { DEMO_LOGIN, DEMO_PASSWORD } from "@/features/auth/demo";
import { resetUserCache } from "@/shared/lib/authCache";

/** Экран входа. Логин + пароль → JWT → предложить установить PIN. */
export function LoginPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setToken = useAuthStore((s) => s.setToken);
  const hasPin = useAuthStore((s) => !!s.pinHash);

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  // Экран-прогресс после успешной авторизации (2 сек)
  const [showProgress, setShowProgress] = useState<null | { skipPin: boolean }>(null);

  async function loginWith(loginValue: string, passwordValue: string, options?: { skipPin?: boolean }) {
    const { data } = await api.post<TokenResponse>("/auth/login", {
      login: loginValue,
      password: passwordValue,
    });
    // Сброс кеша прошлого юзера — важно, чтобы новый не видел чужие данные
    resetUserCache(qc);
    setToken(data.access_token, data.role ?? null, loginValue);
    markSessionUnlocked();
    // Показываем экран прогресса на 2 сек, дальше — либо PIN-модалка, либо дашборд.
    setShowProgress({ skipPin: !!options?.skipPin });
  }

  function onProgressDone() {
    const skipPin = showProgress?.skipPin ?? false;
    setShowProgress(null);
    if (skipPin || hasPin) {
      navigate("/dashboard", { replace: true });
    } else {
      setPinModalOpen(true);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWith(login, password);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? "Не удалось войти";
      setError(typeof detail === "string" ? mapAuthError(detail) : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  async function onDemoLogin() {
    setError(null);
    setLoading(true);
    try {
      await loginWith(DEMO_LOGIN, DEMO_PASSWORD, { skipPin: true });
    } catch (err: any) {
      setError("Демо-аккаунт недоступен. Убедитесь что бэкенд запущен.");
    } finally {
      setLoading(false);
    }
  }

  function afterPinDecision() {
    setPinModalOpen(false);
    navigate("/dashboard", { replace: true });
  }

  if (showProgress) {
    return (
      <AuthShell>
        <LoginProgress onDone={onProgressDone} />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthLogo />
      <div className="text-center text-[22px] font-semibold text-ink-primary">
        Вход в ShlapaBank
      </div>
      <div className="text-center text-[13px] text-ink-secondary mb-5">
        Войдите в свой аккаунт
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-2.5" data-testid="login-form">
        <input
          className="input h-12 rounded-control px-4 text-[14px]"
          placeholder="Логин или телефон (+7…)"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          required
          data-testid="login-input"
        />

        <div className="relative">
          <input
            className="input h-12 pr-11 rounded-control px-4 text-[14px]"
            placeholder="Пароль"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            data-testid="password-input"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-primary transition p-1"
            data-testid="password-toggle-btn"
          >
            <i
              className={`ti ti-${showPassword ? "eye-off" : "eye"} text-lg`}
              aria-hidden="true"
            ></i>
          </button>
        </div>

        {error && (
          <div
            className="text-xs text-danger bg-danger-soft rounded-control px-3 py-2"
            data-testid="login-error"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          data-testid="login-submit-btn"
          className="btn-primary h-12 mt-1 text-[15px]"
        >
          {loading ? "Входим…" : "Продолжить"}
        </button>
      </form>

      <div className="relative my-5">
        <div className="absolute inset-x-0 top-1/2 border-t border-line"></div>
        <div className="relative text-center">
          <span className="bg-surface-1/0 px-3 text-[10px] uppercase tracking-wider text-ink-muted">
            или
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onDemoLogin}
        disabled={loading}
        data-testid="demo-login-btn"
        className="w-full h-12 rounded-control border border-brand/30 bg-brand-soft text-accent font-medium text-[14px] hover:bg-brand/25 hover:border-brand/50 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <i className="ti ti-mood-happy text-lg" aria-hidden="true"></i>
        Войти в демо-режим
      </button>
      <div className="text-center text-[11px] text-ink-muted mt-2">
        Готовый аккаунт со счетами, картами и историей — без регистрации
      </div>

      <div className="border-t border-line mt-5 pt-4 text-center">
        <Link
          to="/forgot-password"
          className="text-[13px] text-accent hover:underline"
          data-testid="forgot-password-link"
        >
          Восстановить доступ
        </Link>
      </div>
      <div className="text-center text-[11px] text-ink-muted mt-3">
        Нет аккаунта?{" "}
        <Link to="/register" className="text-accent hover:underline" data-testid="go-register-link">
          Зарегистрироваться
        </Link>
      </div>

      <SetPinModal open={pinModalOpen} onDone={afterPinDecision} onSkip={afterPinDecision} />
    </AuthShell>
  );
}

function mapAuthError(detail: string): string {
  if (detail.includes("invalid_credentials")) return "Неверный логин или пароль";
  if (detail.includes("user_blocked")) return "Пользователь заблокирован";
  return detail;
}
