import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGuardedMutate, useRegister } from "../api/hooks";
import type { ApiError } from "../api/client";
import { Button } from "../ui/Button";
import { Field, PasswordInput, PhoneInput, TextInput } from "../ui/fields";
import { Notice } from "../ui/blocks";
import { IconCheck, IconCross } from "../ui/icons";
import {
  NAME_MAX,
  PASSWORD_MAX,
  nameProblem,
  onlyDigits,
  passwordRules,
  phoneToApi,
} from "../ui/validate";

const FIELDS = ["first_name", "last_name", "phone", "password"];

export function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegister();
  const registerOnce = useGuardedMutate(register);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);

  const phoneDigits = onlyDigits(phone);
  const rules = passwordRules(password);
  const passwordOk = rules.every((r) => r.ok);

  const problems = {
    first_name: nameProblem(firstName, "имя"),
    last_name: nameProblem(lastName, "фамилию"),
    phone: phoneDigits.length < 10 ? "Введите номер телефона полностью" : null,
    password: !password ? "Придумайте пароль" : passwordOk ? null : "Пароль не подходит под правила",
    password2: !password2 ? "Повторите пароль" : password2 !== password ? "Пароли не совпадают" : null,
  };
  const firstProblem = Object.values(problems).find(Boolean) ?? null;
  // До любого ввода — нейтральная подсказка, конкретные причины — когда начали заполнять
  const started = [firstName, lastName, phone, password, password2].some((v) => v !== "") || Object.values(touched).some(Boolean);
  // Ошибку поля показываем после ухода из поля, ошибку API — сразу
  const err = (f: keyof typeof problems) =>
    apiError?.field === f ? apiError.message : touched[f] ? problems[f] : null;
  // Причина уже горит красным у поля — под кнопкой не повторяем её текст
  // (у пароля текст ошибки не выводится — там список правил, поэтому причину пишем под кнопкой)
  const firstKey = (Object.keys(problems) as (keyof typeof problems)[]).find((f) => problems[f]);
  const shownAtField = !!firstKey && firstKey !== "password" && err(firstKey) === problems[firstKey];
  const submitHint =
    firstProblem && (!started ? "Заполните все поля" : shownAtField ? "Исправьте ошибку в поле выше" : firstProblem);
  const touch = (f: string) => () => setTouched((t) => ({ ...t, [f]: true }));
  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setApiError(null);
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (firstProblem || register.isPending) return;
    registerOnce(
      {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phoneToApi(phoneDigits),
        password,
      },
      {
        onSuccess: () => navigate("/login", { replace: true, state: { phone: phoneDigits, registered: true } }),
        onError: setApiError,
      },
    );
  }

  const generalError = apiError && !FIELDS.includes(apiError.field ?? "") ? apiError.message : null;

  return (
    <main className="mx-auto flex max-w-page justify-center px-4 py-10 sm:px-6">
      <form
        noValidate
        onSubmit={submit}
        className="flex w-full max-w-[480px] flex-col gap-[18px] rounded-dialog bg-white p-6 shadow-dialog sm:p-7"
      >
        <div>
          <h1 className="text-[22px] font-bold leading-[30px]">Регистрация</h1>
          <div className="mt-1 text-ink-muted">Откроем счёт «Основной» сразу после регистрации</div>
        </div>

        <div className="flex flex-col gap-[18px] sm:flex-row sm:gap-3">
          <Field id="register-first-name" label="Имя" testId="register-first-name" error={err("first_name")} className="flex-1">
            <TextInput
              id="register-first-name"
              data-testid="register-first-name"
              value={firstName}
              onValueChange={edit(setFirstName)}
              onBlur={touch("first_name")}
              maxLength={NAME_MAX}
              autoComplete="given-name"
              invalid={!!err("first_name")}
            />
          </Field>
          <Field id="register-last-name" label="Фамилия" testId="register-last-name" error={err("last_name")} className="flex-1">
            <TextInput
              id="register-last-name"
              data-testid="register-last-name"
              value={lastName}
              onValueChange={edit(setLastName)}
              onBlur={touch("last_name")}
              maxLength={NAME_MAX}
              autoComplete="family-name"
              invalid={!!err("last_name")}
            />
          </Field>
        </div>

        <Field id="register-phone" label="Телефон" testId="register-phone" error={err("phone")}>
          <PhoneInput
            id="register-phone"
            data-testid="register-phone"
            value={phone}
            onValueChange={edit(setPhone)}
            onBlur={touch("phone")}
            invalid={!!err("phone")}
          />
        </Field>

        <Field id="register-password" label="Пароль" testId="register-password" error={apiError?.field === "password" ? apiError.message : null}>
          <PasswordInput
            id="register-password"
            data-testid="register-password"
            toggleTestId="register-password-toggle"
            value={password}
            onValueChange={edit(setPassword)}
            onBlur={touch("password")}
            maxLength={PASSWORD_MAX}
            autoComplete="new-password"
            invalid={(touched.password && !!problems.password) || apiError?.field === "password"}
          />
          <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-2" data-testid="register-password-rules">
            {rules.map((r) => {
              // Пустое поле — правила нейтральные; при вводе — галочка или крестик
              const state = !password ? "neutral" : r.ok ? "ok" : "fail";
              return (
                <li
                  key={r.id}
                  data-testid={`register-password-rule-${r.id}`}
                  data-ok={r.ok}
                  data-state={state}
                  className={`flex items-center gap-1.5 ${
                    state === "ok" ? "text-success-dark" : state === "fail" ? "text-danger" : "text-ink-muted"
                  }`}
                >
                  {state === "ok" ? (
                    <IconCheck size={14} strokeWidth={2.4} color="#1a7f4b" />
                  ) : state === "fail" ? (
                    <IconCross size={14} strokeWidth={2.4} color="#d92d20" />
                  ) : (
                    <span aria-hidden="true" className="grid h-3.5 w-3.5 flex-none place-items-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-ink-soft" />
                    </span>
                  )}
                  {r.text}
                </li>
              );
            })}
          </ul>
        </Field>

        <Field id="register-password2" label="Повторите пароль" testId="register-password2" error={err("password2")}>
          <PasswordInput
            id="register-password2"
            data-testid="register-password2"
            toggleTestId="register-password2-toggle"
            value={password2}
            onValueChange={edit(setPassword2)}
            onBlur={touch("password2")}
            maxLength={PASSWORD_MAX}
            autoComplete="new-password"
            invalid={!!err("password2")}
          />
        </Field>

        {generalError && (
          <Notice tone="error" testId="register-error">
            {generalError}
          </Notice>
        )}

        <Button type="submit" size="lg" data-testid="register-submit" disabled={!!firstProblem} loading={register.isPending}>
          Зарегистрироваться
        </Button>
        {submitHint && (
          <div className="-mt-2 text-center text-[13px] text-ink-muted" data-testid="register-submit-hint">
            {submitHint}
          </div>
        )}
        <div className="text-center text-sm text-ink-muted">
          Уже клиент?{" "}
          <Link to="/login" data-testid="register-login-link" className="font-medium">
            Войти
          </Link>
        </div>
      </form>
    </main>
  );
}
