import { ProfileShell } from "@/features/profile/ProfileShell";
import { useProfile, useUpdateProfile } from "@/features/profile/api";

export function AppearancePage() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const theme = profile?.theme ?? "dark";

  function setTheme(next: "dark" | "light") {
    if (next === "light") {
      alert("Светлая тема появится в следующих версиях.");
      return;
    }
    if (next === theme) return;
    update.mutate({ theme: next } as any);
  }

  return (
    <ProfileShell title="Внешний вид" subtitle="Тема оформления и язык интерфейса">
      <div className="text-[13px] font-medium mb-3">Тема</div>
      <div className="grid grid-cols-2 gap-2 mb-5">
        <ThemeTile
          active={theme === "dark"}
          onClick={() => setTheme("dark")}
          title="Тёмная"
          hint="Основная тема Ember"
          bg="#0B1223"
          accent="#F09427"
        />
        <ThemeTile
          active={theme === "light"}
          onClick={() => setTheme("light")}
          title="Светлая"
          hint="В разработке"
          bg="#F5F7FF"
          accent="#F09427"
          soon
        />
      </div>

      <div className="text-[13px] font-medium mb-3">Язык</div>
      <div className="card-nested flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">🇷🇺</span>
          <div>
            <div className="text-[13px] font-medium">Русский</div>
            <div className="text-[10px] text-ink-muted">Английский — в планах</div>
          </div>
        </div>
        <span className="badge bg-success-soft text-success">выбран</span>
      </div>
    </ProfileShell>
  );
}

function ThemeTile({
  active,
  onClick,
  title,
  hint,
  bg,
  accent,
  soon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
  bg: string;
  accent: string;
  soon?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-control transition border ${
        active
          ? "border-brand ring-1 ring-brand/40"
          : "border-line hover:border-line-strong"
      }`}
    >
      <div
        className="w-full h-16 rounded-control mb-3 relative overflow-hidden"
        style={{ background: bg }}
      >
        <div
          className="absolute bottom-2 left-2 right-6 h-2 rounded"
          style={{ background: "rgba(255,255,255,0.15)" }}
        />
        <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full" style={{ background: accent }} />
      </div>
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className="text-[13px] font-medium">{title}</div>
        {soon && <span className="badge bg-warning-soft text-warning text-[10px]">soon</span>}
      </div>
      <div className="text-[11px] text-ink-muted">{hint}</div>
    </button>
  );
}
