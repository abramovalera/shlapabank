import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ProfileShell } from "@/features/profile/ProfileShell";
import { useUpdateProfile } from "@/features/profile/api";
import { useAuthStore } from "@/shared/stores/auth";
import { resetUserCache } from "@/shared/lib/authCache";
import { DeleteAccountModal } from "@/features/profile/DeleteAccountModal";
import { apiErrorMessage } from "@/shared/api/errors";

export function SecurityPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const update = useUpdateProfile();
  const logout = useAuthStore((s) => s.logout);
  const loggedInAt = useAuthStore((s) => s.loggedInAt);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function changePassword() {
    setMsg(null);
    if (newPassword.length < 8) return setMsg({ ok: false, text: "Пароль минимум 8 символов" });
    if (newPassword !== confirmPassword)
      return setMsg({ ok: false, text: "Новые пароли не совпадают" });
    try {
      await update.mutateAsync({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setMsg({ ok: true, text: "Пароль изменён" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      setMsg({ ok: false, text: apiErrorMessage(e) });
    }
  }

  return (
    <ProfileShell title="Безопасность" subtitle="Пароль, PIN, активные сессии">
      <SectionHeader>Смена пароля</SectionHeader>
      <div className="relative mb-3">
        <input
          className="input pr-11"
          type={showPass ? "text" : "password"}
          placeholder="Текущий пароль"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          data-testid="current-password-input"
        />
        <button
          type="button"
          onClick={() => setShowPass((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-primary"
          aria-label={showPass ? "Скрыть" : "Показать"}
        >
          <i className={`ti ti-${showPass ? "eye-off" : "eye"} text-lg`} aria-hidden="true"></i>
        </button>
      </div>
      <input
        className="input mb-2"
        type={showPass ? "text" : "password"}
        placeholder="Новый пароль (мин. 8 символов)"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        autoComplete="new-password"
        data-testid="new-password-input"
      />
      <input
        className="input mb-3"
        type={showPass ? "text" : "password"}
        placeholder="Повторите новый пароль"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        autoComplete="new-password"
        data-testid="confirm-password-input"
      />
      {msg && (
        <div
          className={`text-[13px] rounded-control px-3 py-2 mb-3 ${
            msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
        >
          <i className={`ti ti-${msg.ok ? "check" : "alert-circle"} mr-1`} aria-hidden="true"></i>
          {msg.text}
        </div>
      )}
      <button
        onClick={changePassword}
        disabled={update.isPending || !currentPassword || !newPassword}
        className={`w-full py-2.5 rounded-control font-medium transition ${
          currentPassword && newPassword && !update.isPending
            ? "btn-primary"
            : "bg-fill-control text-ink-muted cursor-not-allowed"
        }`}
        data-testid="change-password-btn"
      >
        {update.isPending ? "Сохраняем…" : "Изменить пароль"}
      </button>

      <div className="h-px bg-line my-5"></div>

      <SectionHeader>Активные сессии</SectionHeader>
      <div className="card-nested flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-brand-soft text-accent flex items-center justify-center">
          <i className="ti ti-device-desktop text-lg" aria-hidden="true"></i>
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-medium">
            Этот браузер · {detectBrowser()}
          </div>
          <div className="text-[10px] text-ink-muted">
            Вход:{" "}
            {loggedInAt
              ? new Date(loggedInAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "неизвестно"}
          </div>
        </div>
        <span className="badge bg-success-soft text-success">Текущая</span>
      </div>
      <button
        onClick={() => {
          if (!confirm("Завершить текущую сессию? Придётся войти заново.")) return;
          logout();
          resetUserCache(qc);
          navigate("/login");
        }}
        className="btn w-full text-danger py-2.5"
        data-testid="session-terminate-btn"
      >
        <i className="ti ti-logout" aria-hidden="true"></i>
        Завершить сессию
      </button>
      <div className="text-[11px] text-ink-muted mt-2">
        Управление сессиями других устройств появится позже.
      </div>

      <div className="h-px bg-line my-5"></div>

      <SectionHeader>Опасная зона</SectionHeader>
      <div className="rounded-control border border-danger/30 bg-danger-soft/40 p-3">
        <div className="text-[13px] font-medium text-danger mb-0.5">Удалить аккаунт</div>
        <div className="text-[11px] text-ink-secondary mb-3">
          Полностью удалит профиль, счета, карты, транзакции. Действие необратимо. Используется в
          автотестах для очистки.
        </div>
        <button
          onClick={() => setDeleteOpen(true)}
          className="btn w-full text-danger py-2.5"
          data-testid="delete-account-open-btn"
        >
          <i className="ti ti-trash" aria-hidden="true"></i>
          Удалить аккаунт
        </button>
      </div>

      <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </ProfileShell>
  );
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/edge?/i.test(ua) && !/edg/i.test(ua)) return "Edge";
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) return "Chrome";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  return "браузер";
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="text-[14px] font-medium mb-3">{children}</div>;
}

