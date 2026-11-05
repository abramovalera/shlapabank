import { useEffect, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useMe } from "../api/hooks";
import { useSession } from "../api/session";
import { initials } from "../ui/format";
import { Skeleton } from "../ui/blocks";

function Logo() {
  return (
    <Link
      to="/"
      data-testid="header-logo"
      className="flex items-center gap-2.5 text-lg font-bold text-ink hover:text-ink hover:no-underline"
    >
      <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-primary font-bold text-white" aria-hidden="true">
        S
      </span>
      ShlapaBank
    </Link>
  );
}

// Документация стенда — на том же хосте, порт 8090 (отдельный контейнер docs)
const DOCS_URL = `${window.location.protocol}//${window.location.hostname}:8090/`;

/** Логотип и серая ссылка на документацию стенда рядом с ним. */
function Brand() {
  return (
    <div className="flex items-center gap-4">
      <Logo />
      <a
        href={DOCS_URL}
        target="_blank"
        rel="noopener"
        data-testid="header-docs"
        aria-label="Документация"
        title="Документация"
        // На широком экране (2xl) — в левом верхнем углу страницы, вне колонки контента:
        // позиционируется относительно <header class="relative">. Уже — рядом с логотипом.
        className="flex items-center text-sm text-ink-muted hover:text-ink hover:no-underline 2xl:absolute 2xl:left-6 2xl:top-1/2 2xl:-translate-y-1/2"
      >
        {/* На телефоне — значок книжки, чтобы шапка помещалась в одну строку */}
        <svg className="sm:hidden" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
          <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
        </svg>
        <span className="hidden sm:inline">Документация</span>
      </a>
    </div>
  );
}

// «Платежи» подсвечены на /payments и на всех экранах операций
const PAYMENT_PATHS = ["/payments", "/transfer", "/pay/", "/topup"];

function NavItem({ to, testId, children, active }: { to: string; testId: string; children: ReactNode; active?: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      data-testid={testId}
      className={({ isActive }) =>
        `whitespace-nowrap pb-[11px] pt-[11px] hover:no-underline md:pb-[19px] md:pt-[21px] ${
          isActive || active
            ? "font-semibold text-ink shadow-nav-active hover:text-ink"
            : "font-medium text-ink-muted hover:text-ink"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function UserBlock() {
  const me = useMe();
  const signOut = useSession((s) => s.signOut);
  const fullName = me.data ? `${me.data.first_name} ${me.data.last_name}` : "";
  return (
    <div className="ml-auto flex items-center gap-4 sm:gap-5">
      {me.isPending ? (
        <span className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
        </span>
      ) : me.data ? (
        <span className="flex items-center gap-2" data-testid="header-user">
          <span
            data-testid="header-user-initials"
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-[13px] font-semibold text-primary-hover"
          >
            {initials(fullName)}
          </span>
          <span data-testid="header-user-name" className="hidden max-w-[220px] truncate sm:inline">
            {fullName}
          </span>
        </span>
      ) : null}
      <button
        type="button"
        data-testid="header-logout"
        onClick={() => signOut()}
        className="text-ink-muted hover:text-primary-hover hover:underline"
      >
        Выйти
      </button>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Шапка и контент для вошедшего клиента. */
export function AppLayout({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  const paymentsActive = PAYMENT_PATHS.some((p) => pathname.startsWith(p));
  return (
    <div className="min-h-screen bg-page">
      <ScrollToTop />
      <header className="relative bg-white shadow-header">
        <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-9 px-4 pt-3 sm:px-6 md:h-16 md:pt-0">
          <Brand />
          <nav
            aria-label="Основное меню"
            className="order-3 flex w-full min-w-0 gap-x-5 sm:gap-x-6 md:order-none md:w-auto md:gap-7"
          >
            <NavItem to="/" testId="nav-home">
              Главная
            </NavItem>
            <NavItem to="/payments" testId="nav-payments" active={paymentsActive}>
              Платежи
            </NavItem>
            <NavItem to="/history" testId="nav-history">
              История
            </NavItem>
            <NavItem to="/limits" testId="nav-limits">
              {/* На узком экране — короткая подпись, чтобы меню влезало без прокрутки */}
              <span className="hidden sm:inline">Тарифы и лимиты</span>
              <span className="sm:hidden">Тарифы</span>
            </NavItem>
          </nav>
          <UserBlock />
        </div>
      </header>
      {children ?? <Outlet />}
    </div>
  );
}

/** Шапка без меню — для входа, регистрации и 404 без входа. */
export function PublicLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <ScrollToTop />
      <header className="relative bg-white shadow-header">
        <div className="mx-auto flex h-16 max-w-page items-center px-4 sm:px-6">
          <Brand />
        </div>
      </header>
      {children ?? <Outlet />}
    </div>
  );
}
