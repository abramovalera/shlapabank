import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/shared/stores/auth";
import { clearSessionUnlock } from "@/features/auth/session";
import { isDemoLogin } from "@/features/auth/demo";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { UserProfile } from "@/shared/api/types";
import { Sidebar } from "@/features/sidebar/Sidebar";
import { NavDropdown, DropdownItem } from "@/features/nav/NavDropdown";
import { TopupModal } from "@/features/dev/TopupModal";
import { useQueryClient } from "@tanstack/react-query";
import { resetUserCache } from "@/shared/lib/authCache";
import { NotificationBell } from "@/features/notifications/NotificationBell";

const PAYMENTS_ITEMS: DropdownItem[] = [
  { label: "Перевод по карте",      to: "/transfers/by-card",  icon: "credit-card",  testId: "nav-transfers-card" },
  { label: "Перевод по телефону",   to: "/transfers/by-phone", icon: "phone",        testId: "nav-transfers-phone" },
  { label: "Между своими счетами",  to: "/transfers",          icon: "arrows-exchange", testId: "nav-transfers-own" },
  { label: "Мобильная связь",       to: "/payments/mobile",    icon: "device-mobile", testId: "nav-payments-mobile" },
  { label: "ЖКХ и поставщики",      to: "/payments/utility",   icon: "home",         testId: "nav-payments-utility" },
  { label: "Автоплатежи",           to: "/payments/autopay",   icon: "refresh",      testId: "nav-payments-autopay" },
];

const MORE_ITEMS: DropdownItem[] = [
  { label: "Мои карты",   to: "/cards",   icon: "credit-card",  testId: "nav-more-cards" },
  { label: "Настройки",   to: "/profile", icon: "settings",     testId: "nav-more-settings" },
  { label: "Поддержка",   to: "/profile", icon: "headset",      testId: "nav-more-support" },
];

/** Каркас: верхний header + двухколоночная область (sticky sidebar слева + Outlet справа). */
export function AppLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const userLogin = useAuthStore((s) => s.login);
  const isDemo = isDemoLogin(userLogin);
  const [topupOpen, setTopupOpen] = useState(false);

  function doLogout() {
    logout();
    clearSessionUnlock();
    resetUserCache(qc);
    navigate("/login");
  }

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async (): Promise<UserProfile> => (await api.get("/profile")).data,
  });

  const initials = (() => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    if (profile?.login) return profile.login.slice(0, 2).toUpperCase();
    return "??";
  })();

  return (
    <div className="min-h-screen relative z-10">
      <header className="border-b border-line bg-surface-0/70 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-[1240px] px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setTopupOpen(true)}
                title="🧪 Тест: пополнить счёт"
                data-testid="logo-topup-btn"
                aria-label="Открыть тест-пополнение"
                className="w-8 h-8 rounded-[10px] flex items-center justify-center font-medium text-[#0B1223] hover:scale-110 transition-transform"
                style={{
                  background: "linear-gradient(135deg, #FFA347 0%, #F09427 100%)",
                  boxShadow: "0 0 20px rgba(240, 148, 39, 0.35)",
                }}
              >
                S
              </button>
              <span className="font-medium text-[15px]">ShlapaBank</span>
              {isDemo && (
                <span
                  className="ml-2 badge bg-brand-soft text-accent border border-brand/30"
                  title="Вы залогинены как fullclient — тестовый аккаунт с готовыми данными"
                  data-testid="demo-badge"
                >
                  <i className="ti ti-mood-happy text-[13px]" aria-hidden="true"></i>
                  Демо-режим
                </span>
              )}
            </div>
            <nav className="flex items-end gap-6" data-testid="main-nav">
              <NavLink
                to="/dashboard"
                data-testid="nav-dashboard"
                className={({ isActive }) =>
                  `text-[14px] pb-1.5 transition ${
                    isActive
                      ? "text-ink-primary font-medium border-b-2 border-brand-strong"
                      : "text-ink-secondary hover:text-ink-primary"
                  }`
                }
              >
                Главная
              </NavLink>
              <NavDropdown
                label="Платежи и переводы"
                items={PAYMENTS_ITEMS}
                activePaths={["/transfers", "/payments"]}
                testId="nav-payments-dropdown"
              />
              <NavLink
                to="/history"
                data-testid="nav-history"
                className={({ isActive }) =>
                  `text-[14px] pb-1.5 transition ${
                    isActive
                      ? "text-ink-primary font-medium border-b-2 border-brand-strong"
                      : "text-ink-secondary hover:text-ink-primary"
                  }`
                }
              >
                История
              </NavLink>
              <NavDropdown
                label="Ещё"
                items={MORE_ITEMS}
                activePaths={["/cards", "/profile"]}
                testId="nav-more-dropdown"
              />
            </nav>
          </div>
          <div className="flex items-center gap-3.5">
            <NotificationBell />
            <button
              onClick={() => navigate("/profile")}
              data-testid="profile-avatar-btn"
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium hover:scale-105 transition text-[#0B1223]"
              style={{ background: profile?.avatar_color || "rgba(240, 148, 39, 0.15)", color: profile?.avatar_color ? "#0B1223" : undefined }}
              aria-label="Профиль"
            >
              {initials}
            </button>
            <button
              onClick={doLogout}
              data-testid="logout-btn"
              className="text-ink-muted hover:text-danger transition"
              title="Выйти"
              aria-label="Выйти"
            >
              <i className="ti ti-logout text-lg" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1240px] px-6 py-4">
        <div className="flex gap-4 items-start">
          <Sidebar />
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>

      <footer className="mx-auto max-w-[1240px] px-6 py-4 text-[10px] text-ink-muted flex items-center justify-between border-t border-line mt-6">
        <div>© 2026 ShlapaBank · учебный проект</div>
        <a
          href="/docs"
          target="_blank"
          rel="noopener"
          className="hover:text-accent transition flex items-center gap-1"
        >
          <i className="ti ti-code" aria-hidden="true"></i>
          API-документация (Swagger)
        </a>
      </footer>

      <TopupModal open={topupOpen} onClose={() => setTopupOpen(false)} />
    </div>
  );
}
