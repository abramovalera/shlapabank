import { useEffect, useState } from "react";
import { ProfileShell } from "@/features/profile/ProfileShell";
import { AVATAR_COLORS, useProfile, useUpdateProfile } from "@/features/profile/api";

export function PersonalDataPage() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [avatarColor, setAvatarColor] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? "");
      setLastName(profile.last_name ?? "");
      setEmail(profile.email ?? "");
      setPhone(profile.phone ?? "");
      setDob(profile.date_of_birth ?? "");
      setAvatarColor(profile.avatar_color ?? null);
    }
  }, [profile]);

  const initials = (() => {
    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
    if (profile?.login) return profile.login.slice(0, 2).toUpperCase();
    return "??";
  })();
  const color = avatarColor || "#F09427";

  async function save() {
    setMessage(null);
    try {
      await update.mutateAsync({
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        date_of_birth: dob || undefined,
        avatar_color: avatarColor || undefined,
      } as any);
      setMessage({ ok: true, text: "Данные сохранены" });
    } catch (e: any) {
      const detail = e?.response?.data?.detail ?? "Не удалось сохранить";
      setMessage({ ok: false, text: mapErr(detail) });
    }
  }

  return (
    <ProfileShell title="Личные данные" subtitle="Имя, дата рождения, контакты">
      <div className="flex items-center gap-4 mb-5">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-[22px] font-medium text-[#0B1223]"
          style={{ background: color }}
        >
          {initials}
        </div>
        <div className="flex-1">
          <div className="text-[12px] text-ink-secondary mb-2">Цвет аватара</div>
          <div className="flex gap-1.5 flex-wrap">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setAvatarColor(c)}
                className={`w-7 h-7 rounded-full transition ${
                  avatarColor === c ? "ring-2 ring-ink-primary ring-offset-2 ring-offset-surface-1" : ""
                }`}
                style={{ background: c }}
                aria-label={`Цвет ${c}`}
                data-testid={`avatar-color-${c}`}
              />
            ))}
          </div>
        </div>
      </div>

      <Field label="Логин · нельзя изменить">
        <input className="input opacity-60" value={profile?.login ?? ""} disabled />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Имя">
          <input
            className="input"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Иван"
            maxLength={100}
          />
        </Field>
        <Field label="Фамилия">
          <input
            className="input"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Иванов"
            maxLength={100}
          />
        </Field>
      </div>

      <Field label="Дата рождения">
        <input
          type="date"
          className="input"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
        />
      </Field>

      <Field label="Email">
        <input
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Телефон">
        <input
          type="tel"
          className="input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+79991234567"
        />
      </Field>

      {message && (
        <div
          className={`text-[13px] rounded-control px-3 py-2 mb-3 ${
            message.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
        >
          <i className={`ti ti-${message.ok ? "check" : "alert-circle"} mr-1`} aria-hidden="true"></i>
          {message.text}
        </div>
      )}

      <button
        onClick={save}
        disabled={update.isPending}
        className="btn-primary w-full py-2.5"
        data-testid="personal-save-btn"
      >
        {update.isPending ? "Сохраняем…" : "Сохранить"}
      </button>
    </ProfileShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[12px] text-ink-secondary mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function mapErr(detail: string): string {
  if (detail.includes("phone_not_unique")) return "Этот телефон уже занят другим клиентом";
  if (detail.includes("email_not_unique")) return "Этот email уже занят";
  return detail;
}
