import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { fetchLoginChallenge, useGuardedMutate, useLogin, useLoginConfirm, useLoginResend } from "../api/hooks";
import {
  readLastPhone,
  readLoginChallenge,
  useSession,
  writeLastPhone,
  writeLoginChallenge,
  type SavedLoginChallenge,
} from "../api/session";
import type { ApiError } from "../api/client";
import type { LoginChallenge } from "../api/types";
import { Button } from "../ui/Button";
import { Field, PasswordInput, PhoneInput } from "../ui/fields";
import { Notice } from "../ui/blocks";
import { CodeStep, expiryDeadline, resendDeadline } from "../ui/code";
import { maskPhone10 } from "../ui/format";
import { PASSWORD_MAX, onlyDigits, phoneToApi } from "../ui/validate";

interface LocationState {
  from?: string;
  phone?: string;
  registered?: boolean;
}

/** Ошибки, после которых этот код уже не подтвердить — нужно войти заново. */
const DEAD_CHALLENGE = ["code_attempts_exceeded", "challenge_not_found"];

/**
 * Шаг ввода кода, сохранённый до обновления страницы. Сроки потом сверяются с банком:
 * если банк этот вход уже не знает — возвращаемся к форме с подставленным телефоном.
 */
function savedChallenge(): { restored: SavedLoginChallenge | null; phone: string } {
  const saved = readLoginChallenge();
  return saved ? { restored: saved, phone: saved.phone } : { restored: null, phone: "" };
}

/** Как часто сверять таймеры шага кода с часами банка. */
const SYNC_EVERY_MS = 15_000;

/** Шаг кода из ответа банка: сроки — момент ответа + секунды (часы банка ≠ часы браузера). */
function toSaved(ch: LoginChallenge, phone: string): SavedLoginChallenge {
  const at = Date.now();
  const expiresAt = expiryDeadline(ch.expires_in_seconds, at);
  return {
    challenge_id: ch.challenge_id,
    phone_masked: ch.phone_masked,
    phone,
    resendAt: resendDeadline(ch.resend_in_seconds, at),
    // Банк не прислал срок — считаем стандартные 5 минут, чтобы не держать шаг вечно
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : at + 5 * 60_000,
  };
}

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as LocationState;
  const signIn = useSession((s) => s.signIn);
  const expired = useSession((s) => s.expired);

  // Шаг ввода кода, сохранённый до обновления страницы (если код ещё не истёк)
  const [saved] = useState(savedChallenge);
  const restored = saved.restored;
  // Номер из регистрации, иначе — из прерванного входа, иначе — номер последнего входа
  const [phone, setPhone] = useState(() => maskPhone10(state.phone || saved.phone || readLastPhone()));
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<ApiError | null>(null);

  // Текущий шаг кода: challenge, телефон и сроки по часам браузера (см. toSaved)
  const [challenge, setChallengeState] = useState<SavedLoginChallenge | null>(restored);
  // Шаг восстановлен после обновления страницы: если банк его уже не знает — тихо назад к форме
  const [isRestored, setIsRestored] = useState(!!restored);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const login = useLogin();
  const confirm = useLoginConfirm();
  const resend = useLoginResend();
  const loginOnce = useGuardedMutate(login);
  const confirmOnce = useGuardedMutate(confirm);
  const resendOnce = useGuardedMutate(resend);

  function setChallenge(v: SavedLoginChallenge | null) {
    setChallengeState(v);
    writeLoginChallenge(v);
  }

  /** Сохранённый шаг кода банк уже не знает (404) — без ошибки возвращаем на ввод телефона. */
  function dropRestored() {
    setChallenge(null);
    setIsRestored(false);
    setCodeError(null);
    setLocked(false);
    setPhone(maskPhone10(challenge?.phone || readLastPhone()));
    confirm.reset();
    resend.reset();
  }

  // Таймеры шага кода — по часам банка: сверяемся сразу (после обновления страницы) и раз в 15 секунд.
  const challengeId = challenge?.challenge_id;
  useEffect(() => {
    if (!challengeId || locked) return;
    let alive = true;
    const sync = () =>
      fetchLoginChallenge(challengeId).then(
        (ch) => {
          if (!alive) return;
          setChallengeState((cur) => {
            if (!cur || cur.challenge_id !== ch.challenge_id) return cur;
            const next = toSaved(ch, cur.phone);
            writeLoginChallenge(next);
            return next;
          });
        },
        (e: ApiError) => {
          if (!alive || e.status !== 404) return;
          if (isRestored) dropRestored();
          else {
            setCodeError(e.message);
            setLocked(true);
          }
        },
      );
    sync();
    const timer = window.setInterval(sync, SYNC_EVERY_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId, locked]);

  const phoneDigits = onlyDigits(phone);
  const pwd = password.trim();
  const problem = phoneDigits.length < 10 ? "Введите номер телефона полностью" : !pwd ? "Введите пароль" : null;

  function submitCredentials(e: FormEvent) {
    e.preventDefault();
    if (problem || login.isPending) return;
    setFormError(null);
    loginOnce(
      { phone: phoneToApi(phoneDigits), password: pwd },
      {
        onSuccess: (ch) => {
          setChallenge(toSaved(ch, phoneDigits));
          setIsRestored(false);
          setCodeError(null);
          setLocked(false);
          setResetKey((k) => k + 1);
        },
        onError: setFormError,
      },
    );
  }

  function submitCode(code: string) {
    if (!challenge || confirm.isPending) return;
    setCodeError(null);
    confirmOnce(
      { challenge_id: challenge.challenge_id, code },
      {
        onSuccess: (r) => {
          writeLastPhone(challenge.phone);
          writeLoginChallenge(null);
          signIn(r.access_token);
          navigate(state.from && state.from !== "/login" ? state.from : "/", { replace: true });
        },
        onError: (e) => {
          if (isRestored && e.status === 404) return dropRestored();
          if (e.code === "invalid_code" && e.attemptsLeft != null) {
            setCodeError(`Неверный код. Осталось попыток: ${e.attemptsLeft}`);
            if (e.attemptsLeft <= 0) setLocked(true);
          } else {
            setCodeError(e.message);
            if (DEAD_CHALLENGE.includes(e.code)) setLocked(true);
          }
          setResetKey((k) => k + 1);
        },
      },
    );
  }

  function resendCode() {
    if (!challenge || resend.isPending) return;
    const current = challenge;
    resendOnce(
      { challenge_id: current.challenge_id },
      {
        onSuccess: (ch) => {
          setChallenge(toSaved(ch, current.phone));
          setCodeError(null);
          setResetKey((k) => k + 1);
        },
        onError: (e) => {
          if (isRestored && e.status === 404) return dropRestored();
          setCodeError(e.message);
          // 429 resend_too_early: банк сообщает, сколько ещё ждать
          if (e.resendInSeconds != null) setChallenge({ ...current, resendAt: resendDeadline(e.resendInSeconds) });
          if (DEAD_CHALLENGE.includes(e.code)) setLocked(true);
        },
      },
    );
  }

  function backToForm() {
    setChallenge(null);
    setIsRestored(false);
    setCodeError(null);
    setLocked(false);
    confirm.reset();
  }

  const fieldError = (f: string) => (formError?.field === f ? formError.message : null);
  const generalError = formError && !["phone", "password"].includes(formError.field ?? "") ? formError.message : null;

  return (
    <main className="mx-auto flex max-w-page justify-center px-4 py-10 sm:px-6">
      <section className="flex w-full max-w-[440px] flex-col gap-[18px] rounded-dialog bg-white p-6 shadow-dialog sm:p-7">
        {challenge ? (
          <>
            <h1 className="text-[22px] font-bold leading-[30px]">Введите код из SMS</h1>
            <CodeStep
              testPrefix="login-code"
              sentTo={challenge.phone_masked}
              resendAt={challenge.resendAt}
              expiresAt={challenge.expiresAt}
              error={codeError}
              locked={locked}
              verifying={confirm.isPending}
              resending={resend.isPending}
              onSubmit={submitCode}
              onResend={resendCode}
              resetKey={resetKey}
              footer={
                <Button variant="secondary" data-testid="login-code-back" onClick={backToForm}>
                  {locked ? "Войти заново" : "Изменить номер или пароль"}
                </Button>
              }
            />
          </>
        ) : (
          <form className="flex flex-col gap-[18px]" onSubmit={submitCredentials} noValidate>
            <div>
              <h1 className="text-[22px] font-bold leading-[30px]">Вход в ShlapaBank</h1>
              <div className="mt-1 text-ink-muted">По номеру телефона и паролю</div>
            </div>
            {expired && !state.registered && (
              <Notice tone="info" testId="login-session-expired">
                Сессия истекла, войдите снова
              </Notice>
            )}
            {state.registered && (
              <Notice tone="success" testId="login-registered">
                Готово, вы зарегистрированы. Войдите с новым паролем.
              </Notice>
            )}
            <Field id="login-phone" label="Телефон" testId="login-phone" error={fieldError("phone")}>
              <PhoneInput
                id="login-phone"
                data-testid="login-phone"
                value={phone}
                onValueChange={(v) => {
                  setPhone(v);
                  setFormError(null);
                }}
                invalid={!!fieldError("phone")}
                autoComplete="username"
              />
            </Field>
            <Field id="login-password" label="Пароль" testId="login-password" error={fieldError("password")}>
              <PasswordInput
                id="login-password"
                data-testid="login-password"
                toggleTestId="login-password-toggle"
                value={password}
                onValueChange={(v) => {
                  setPassword(v);
                  setFormError(null);
                }}
                maxLength={PASSWORD_MAX}
                autoComplete="current-password"
                invalid={!!fieldError("password")}
              />
            </Field>
            {generalError && (
              <Notice tone="error" testId="login-error">
                {generalError}
              </Notice>
            )}
            <Button
              type="submit"
              size="lg"
              data-testid="login-submit"
              disabled={!!problem}
              loading={login.isPending}
            >
              Войти
            </Button>
            {problem && (
              <div className="-mt-2 text-center text-[13px] text-ink-muted" data-testid="login-submit-hint">
                {problem}
              </div>
            )}
            <div className="text-center text-sm text-ink-muted">
              Ещё не клиент?{" "}
              <Link to="/register" data-testid="login-register-link" className="font-medium">
                Зарегистрироваться
              </Link>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
