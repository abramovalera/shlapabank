import { useEffect, useMemo, useRef, useState } from "react";
import { ProfileShell } from "@/features/profile/ProfileShell";
import {
  AVATAR_COLORS,
  useProfile,
  useUpdateProfile,
  useUploadAvatar,
  useDeleteAvatar,
} from "@/features/profile/api";
import { apiErrorCode, apiErrorMessage } from "@/shared/api/errors";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Правила должны совпадать с бэкендом (ProfileUpdateRequest в schemas.py),
// иначе клиент пропустит то, что сервер всё равно отклонит.
const NAME_RE = /^[A-ZА-ЯЁ][A-Za-zА-Яа-яЁё]*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateName(v: string): string | null {
  if (!v) return null;
  if (!NAME_RE.test(v)) return "Только буквы, с заглавной буквы, без пробелов и цифр";
  return null;
}

function validateEmail(v: string): string | null {
  if (!v) return null;
  if (!EMAIL_RE.test(v)) return "Некорректный email";
  return null;
}

function validatePhone(v: string): string | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length !== 10 && digits.length !== 11) return "Некорректный номер телефона";
  return null;
}

export function PersonalDataPage() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const deleteAvatar = useDeleteAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [avatarColor, setAvatarColor] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

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

  const errors = useMemo(
    () => ({
      firstName: validateName(firstName),
      lastName: validateName(lastName),
      email: validateEmail(email),
      phone: validatePhone(phone),
    }),
    [firstName, lastName, email, phone]
  );
  const hasErrors = Object.values(errors).some(Boolean);

  const initials = (() => {
    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
    if (profile?.login) return profile.login.slice(0, 2).toUpperCase();
    return "??";
  })();
  const color = avatarColor || "#F09427";

  async function save() {
    setMessage(null);
    setTouched({ firstName: true, lastName: true, email: true, phone: true });
    if (hasErrors) return;
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
      const code = apiErrorCode(e);
      const text =
        code === "phone_not_unique"
          ? "Этот телефон уже занят другим клиентом"
          : code === "email_not_unique"
          ? "Этот email уже занят"
          : apiErrorMessage(e);
      setMessage({ ok: false, text });
    }
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // чтобы повторный выбор того же файла тоже сработал
    if (!file) return;
    setAvatarError(null);
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarError("Разрешены только JPEG, PNG и WebP");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarError("Файл больше 5 МБ");
      return;
    }
    try {
      await uploadAvatar.mutateAsync(file);
    } catch (e: any) {
      setAvatarError(apiErrorMessage(e));
    }
  }

  async function onRemoveAvatar() {
    setAvatarError(null);
    try {
      await deleteAvatar.mutateAsync();
    } catch (e: any) {
      setAvatarError(apiErrorMessage(e));
    }
  }

  return (
    <ProfileShell title="Личные данные" subtitle="Имя, дата рождения, контакты">
      <div className="flex items-center gap-4 mb-2">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-[22px] font-medium text-[#0B1223] shrink-0 overflow-hidden bg-cover bg-center"
          style={profile?.avatar_url ? { backgroundImage: `url(${profile.avatar_url})` } : { background: color }}
          data-testid="avatar-preview"
        >
          {!profile?.avatar_url && initials}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadAvatar.isPending}
              className="text-[12px] px-3 py-1.5 rounded-pill bg-brand-soft border border-brand/30 text-accent"
              data-testid="avatar-upload-btn"
            >
              {uploadAvatar.isPending ? "Загружаем…" : "Загрузить фото"}
            </button>
            {profile?.avatar_url && (
              <button
                type="button"
                onClick={onRemoveAvatar}
                disabled={deleteAvatar.isPending}
                className="text-[12px] px-3 py-1.5 rounded-pill bg-fill-control text-ink-secondary"
                data-testid="avatar-remove-btn"
              >
                Удалить фото
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPickAvatar}
              className="hidden"
              data-testid="avatar-file-input"
            />
          </div>
          {avatarError && <div className="text-[11px] text-danger mb-2">{avatarError}</div>}
          <div className="text-[12px] text-ink-secondary mb-2">
            Или цвет кружка с инициалами {profile?.avatar_url && "(пока есть фото — не виден)"}
          </div>
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
        <Field label="Имя" error={touched.firstName ? errors.firstName : null}>
          <input
            className="input"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, firstName: true }))}
            placeholder="Иван"
            maxLength={100}
            data-testid="personal-firstname-input"
          />
        </Field>
        <Field label="Фамилия" error={touched.lastName ? errors.lastName : null}>
          <input
            className="input"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, lastName: true }))}
            placeholder="Иванов"
            maxLength={100}
            data-testid="personal-lastname-input"
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

      <Field label="Email" error={touched.email ? errors.email : null}>
        <input
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          placeholder="you@example.com"
          data-testid="personal-email-input"
        />
      </Field>

      <Field label="Телефон" error={touched.phone ? errors.phone : null}>
        <input
          type="tel"
          className="input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
          placeholder="+79991234567"
          data-testid="personal-phone-input"
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
        disabled={update.isPending || (Object.keys(touched).length > 0 && hasErrors)}
        className="btn-primary w-full py-2.5"
        data-testid="personal-save-btn"
      >
        {update.isPending ? "Сохраняем…" : "Сохранить"}
      </button>
    </ProfileShell>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="text-[12px] text-ink-secondary mb-1.5">{label}</div>
      {children}
      {error && <div className="text-[11px] text-danger mt-1">{error}</div>}
    </div>
  );
}
