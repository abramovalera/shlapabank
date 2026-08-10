import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/shared/stores/auth";
import { isDemoLogin } from "@/features/auth/demo";
import { useProfile, getAvatarColor } from "@/features/profile/api";

export function ProfilePage() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const { data: profile } = useProfile();

  const initials = (() => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    return profile?.login?.slice(0, 2).toUpperCase() ?? "??";
  })();
  const color = getAvatarColor(profile);
  const displayName = profile?.first_name || profile?.last_name
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
    : profile?.login ?? "—";

  const isDemo = isDemoLogin(profile?.login);

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-medium">Профиль</h1>

      {isDemo && (
        <div
          className="rounded-card border border-brand/30 bg-brand-soft px-4 py-3 flex items-start gap-3"
        >
          <i className="ti ti-mood-happy text-accent text-xl mt-0.5" aria-hidden="true"></i>
          <div className="flex-1">
            <div className="text-[13px] font-medium text-ink-primary">Вы в демо-режиме</div>
            <div className="text-[11px] text-ink-secondary mt-0.5">
              Аккаунт <span className="font-mono">fullclient</span>. Данные учебные, всё можно
              возвращать перезапуском проекта.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[1fr_1.4fr] gap-3">
        <div className="card text-center">
          <div
            className="w-[80px] h-[80px] rounded-full flex items-center justify-center text-[28px] font-medium text-[#0B1223] mx-auto mb-3"
            style={{ background: color }}
          >
            {initials}
          </div>
          <div className="text-base font-medium">
            {displayName}
          </div>
          <div className="text-xs text-ink-secondary mb-3.5">
            {profile?.email ?? "email не указан"}
          </div>
          <div className="border-t border-line pt-3 flex flex-col gap-1.5 text-left">
            <Row label="Логин" value={profile?.login ?? "—"} />
            <Row label="Телефон" value={profile?.phone ?? "—"} />
            <Row label="Роль" value={roleLabel(profile?.role)} />
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <SettingsRow
            icon="user"
            title="Личные данные"
            hint="Имя, фамилия, дата рождения, аватар, контакты"
            onClick={() => navigate("/profile/personal")}
            testId="profile-row-personal"
          />
          <SettingsRow
            icon="lock"
            title="Безопасность"
            hint="Пароль, активные сессии"
            onClick={() => navigate("/profile/security")}
            testId="profile-row-security"
          />
          <SettingsRow
            icon="building-bank"
            title="Основной банк СБП"
            hint="Куда получать переводы по номеру телефона"
            onClick={() => navigate("/profile/sbp-bank")}
            testId="profile-row-sbp"
          />
          <SettingsRow
            icon="palette"
            title="Внешний вид"
            hint="Тема оформления, язык"
            onClick={() => navigate("/profile/appearance")}
            testId="profile-row-appearance"
          />
          <button
            className="card flex items-center gap-3 hover:bg-surface-2 text-danger transition"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            <i className="ti ti-logout text-lg" aria-hidden="true"></i>
            <span className="text-sm font-medium">Выйти</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Пока только два значения. Когда появятся разные виды клиентов — расширить маппинг.
function roleLabel(role: string | undefined): string {
  if (role === "ADMIN") return "Админ";
  if (role === "CLIENT") return "Клиент · Обычный";
  return "—";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-ink-secondary">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function SettingsRow({
  icon,
  title,
  hint,
  onClick,
  testId,
}: {
  icon: string;
  title: string;
  hint: string;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="card flex justify-between items-center hover:bg-surface-2 text-left transition group"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-brand-soft text-accent flex items-center justify-center">
          <i className={`ti ti-${icon} text-lg`} aria-hidden="true"></i>
        </div>
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-[11px] text-ink-muted">{hint}</div>
        </div>
      </div>
      <i className="ti ti-chevron-right text-base text-ink-muted group-hover:text-accent transition" aria-hidden="true"></i>
    </button>
  );
}
