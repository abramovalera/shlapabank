import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Dropdown } from "@/shared/ui/Dropdown";
import { api } from "@/shared/api/client";
import { UserProfile, Account, Card } from "@/shared/api/types";
import { useCards } from "@/features/cards/api";

interface Notification {
  id: string;
  title: string;
  hint: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  action?: { label: string; to: string };
}

/**
 * Колокольчик с уведомлениями. Список формируется динамически из состояния
 * профиля/карт/счетов — «заполните имя», «выпустите первую карту» и т.п.
 */
export function NotificationBell() {
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async (): Promise<UserProfile> => (await api.get("/profile")).data,
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => (await api.get("/accounts")).data,
  });
  const { data: cards = [] } = useCards();

  const notifs: Notification[] = useMemo(() => {
    const list: Notification[] = [];

    if (!profile?.first_name || !profile?.last_name) {
      list.push({
        id: "n:name",
        title: "Заполните имя и фамилию",
        hint: "Личные данные помогут получателям вас узнать",
        icon: "user",
        iconColor: "#F09427",
        iconBg: "rgba(240,148,39,0.15)",
        action: { label: "Заполнить", to: "/profile/personal" },
      });
    }
    if (!profile?.phone) {
      list.push({
        id: "n:phone",
        title: "Добавьте телефон",
        hint: "Нужен для переводов по номеру и восстановления доступа",
        icon: "phone",
        iconColor: "#3DD7E5",
        iconBg: "rgba(61,215,229,0.15)",
        action: { label: "Указать", to: "/profile/personal" },
      });
    }
    if (!profile?.email) {
      list.push({
        id: "n:email",
        title: "Укажите email",
        hint: "Для чеков и уведомлений",
        icon: "mail",
        iconColor: "#7F8AFF",
        iconBg: "rgba(127,138,255,0.15)",
        action: { label: "Указать", to: "/profile/personal" },
      });
    }
    if (accounts.length === 0) {
      list.push({
        id: "n:no-accounts",
        title: "Откройте первый счёт",
        hint: "Без счёта нельзя принимать переводы",
        icon: "wallet",
        iconColor: "#4DE89F",
        iconBg: "rgba(43,224,140,0.15)",
      });
    } else if (cards.length === 0) {
      list.push({
        id: "n:no-cards",
        title: "Выпустите первую карту",
        hint: "Оплата в магазинах и онлайн",
        icon: "credit-card",
        iconColor: "#F09427",
        iconBg: "rgba(240,148,39,0.15)",
        action: { label: "Выпустить", to: "/cards" },
      });
    }
    const blocked = cards.filter((c: Card) => c.status === "BLOCKED");
    if (blocked.length > 0) {
      list.push({
        id: "n:blocked",
        title: `Заблокирована ${blocked.length === 1 ? "карта" : `${blocked.length} карт`}`,
        hint: "Разблокируйте, если пользуетесь ими",
        icon: "lock",
        iconColor: "#F7DE6E",
        iconBg: "rgba(247,222,110,0.15)",
        action: { label: "Открыть", to: "/cards" },
      });
    }
    return list;
  }, [profile, accounts, cards]);

  const count = notifs.length;

  return (
    <Dropdown
      align="right"
      className="w-auto"
      testId="notifications-dropdown"
      trigger={
        <div
          className="relative text-ink-secondary hover:text-ink-primary transition p-1 cursor-pointer"
          aria-label="Уведомления"
        >
          <i className="ti ti-bell text-xl" aria-hidden="true"></i>
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-danger text-white text-[10px] px-1 rounded-full min-w-[16px] text-center">
              {count}
            </span>
          )}
        </div>
      }
    >
      {(close) => (
        <div style={{ minWidth: 320, maxWidth: 380 }}>
          <div className="px-3 py-2 border-b border-line">
            <div className="text-[13px] font-medium">Уведомления</div>
            <div className="text-[10px] text-ink-muted">
              {count === 0 ? "Всё в порядке" : `${count} активных`}
            </div>
          </div>
          {count === 0 ? (
            <div className="text-center py-6 text-[13px] text-ink-muted">
              <i className="ti ti-check text-2xl text-success mb-2 block" aria-hidden="true"></i>
              Нет непрочитанных уведомлений
            </div>
          ) : (
            notifs.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-3 px-3 py-2.5 hover:bg-fill-hover transition border-b border-line last:border-none"
                data-testid={`notif-${n.id}`}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: n.iconBg, color: n.iconColor }}
                >
                  <i className={`ti ti-${n.icon} text-base`} aria-hidden="true"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{n.title}</div>
                  <div className="text-[11px] text-ink-muted">{n.hint}</div>
                  {n.action && (
                    <button
                      onClick={() => {
                        navigate(n.action!.to);
                        close();
                      }}
                      className="text-[11px] text-accent hover:underline mt-1"
                    >
                      {n.action.label} →
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Dropdown>
  );
}
