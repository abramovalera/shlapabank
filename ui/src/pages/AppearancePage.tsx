import { ProfileShell } from "@/features/profile/ProfileShell";

/**
 * Внешний вид. Сейчас доступна только тёмная тема Ember и русский язык —
 * остальные варианты пока не поддерживаются, поэтому не показываем
 * недоделанных переключателей.
 */
export function AppearancePage() {
  return (
    <ProfileShell title="Внешний вид" subtitle="Тема оформления и язык интерфейса">
      <div className="text-[13px] font-medium mb-3">Тема</div>
      <div className="card-nested flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-control relative overflow-hidden"
            style={{ background: "#0B1223" }}
          >
            <div
              className="absolute bottom-1.5 left-1.5 right-4 h-1.5 rounded"
              style={{ background: "rgba(255,255,255,0.15)" }}
            />
            <div
              className="absolute bottom-1.5 right-1.5 w-2.5 h-2.5 rounded-full"
              style={{ background: "#F09427" }}
            />
          </div>
          <div>
            <div className="text-[13px] font-medium">Тёмная</div>
            <div className="text-[11px] text-ink-muted">Основная тема Ember</div>
          </div>
        </div>
        <span className="badge bg-success-soft text-success">выбрана</span>
      </div>

      <div className="text-[13px] font-medium mb-3">Язык</div>
      <div className="card-nested flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">🇷🇺</span>
          <div>
            <div className="text-[13px] font-medium">Русский</div>
            <div className="text-[10px] text-ink-muted">Язык интерфейса</div>
          </div>
        </div>
        <span className="badge bg-success-soft text-success">выбран</span>
      </div>
    </ProfileShell>
  );
}
