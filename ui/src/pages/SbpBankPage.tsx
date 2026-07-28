import { useQuery } from "@tanstack/react-query";
import { ProfileShell } from "@/features/profile/ProfileShell";
import { useProfile, useUpdateProfile } from "@/features/profile/api";
import { api } from "@/shared/api/client";

interface BankOption {
  id: string;
  label: string;
}

/**
 * Основной банк для приёма переводов по номеру телефона (СБП).
 * Показываем ShlapaBank + внешние банки, которые прописаны у пользователя
 * (у каждого клиента их разное число — присваиваются при регистрации).
 */
export function SbpBankPage() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();

  const current = profile?.sbp_primary_bank ?? "SHLAPABANK";

  // Реальный список: узнаём через /transfers/by-phone/check с нашим собственным телефоном
  const { data: banks = [{ id: "SHLAPABANK", label: "ShlapaBank" }] } = useQuery({
    queryKey: ["my-sbp-banks", profile?.phone],
    queryFn: async (): Promise<BankOption[]> => {
      if (!profile?.phone) return [{ id: "SHLAPABANK", label: "ShlapaBank" }];
      const { data } = await api.get<{ availableBanks: BankOption[] }>(
        "/transfers/by-phone/check",
        { params: { phone: profile.phone } }
      );
      return data.availableBanks ?? [{ id: "SHLAPABANK", label: "ShlapaBank" }];
    },
    enabled: !!profile,
  });

  function pick(id: string) {
    if (id === current) return;
    update.mutate({ sbp_primary_bank: id } as any);
  }

  return (
    <ProfileShell
      title="Основной банк СБП"
      subtitle="Куда получать переводы по номеру телефона по умолчанию"
    >
      <div className="text-[12px] text-ink-secondary mb-3">
        Отправители будут видеть этот банк отмеченным как «основной» в вашей карточке при
        переводе. Если хотите получать в другой банк — выберите его.
      </div>

      <div className="flex flex-col gap-1.5 mb-4">
        {banks.map((b) => {
          const selected = b.id === current;
          const isOurs = b.id === "SHLAPABANK";
          return (
            <button
              key={b.id}
              onClick={() => pick(b.id)}
              className={`card-nested flex items-center gap-3 text-left transition ${
                selected ? "border-brand ring-1 ring-brand/40" : "hover:bg-surface-3"
              }`}
              data-testid={`sbp-bank-${b.id}`}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center font-medium text-[13px] shrink-0 ${
                  isOurs ? "bg-brand text-[#0B1223]" : "bg-fill-control text-ink-primary"
                }`}
              >
                {b.label.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium">{b.label}</div>
                <div className="text-[10px] text-ink-muted">
                  {isOurs ? "Наш банк · без комиссии для отправителя" : "Внешний банк"}
                </div>
              </div>
              {selected && <i className="ti ti-check text-accent" aria-hidden="true"></i>}
            </button>
          );
        })}
      </div>
    </ProfileShell>
  );
}
