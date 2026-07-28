import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  maxWidth?: number;
}

/**
 * Общий каркас для страниц авторизации (/login, /register, /forgot-password, /pin).
 * Глобальный фон (StarField + Trail) живёт на уровне App — здесь только контент
 * и его z-index, чтобы всплыть над частицами.
 */
export function AuthShell({ children, maxWidth = 380 }: Props) {
  const year = new Date().getFullYear();
  return (
    <div className="min-h-screen flex flex-col relative z-10">
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div
          className="w-full auth-card p-8 fade-up"
          style={{ maxWidth }}
        >
          {children}
        </div>
      </main>

      <footer className="text-center text-[11px] text-ink-muted pb-4 fade-up fade-up-2">
        © 1990 – {year} АО «ShlapaBank» · учебный проект
      </footer>
    </div>
  );
}

/** Крупный оранжевый логотип с пульсирующим свечением. */
export function AuthLogo() {
  return (
    <div className="flex justify-center mb-5">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-2xl logo-glow"
        style={{
          background: "linear-gradient(135deg, #FFA347 0%, #F09427 100%)",
        }}
      >
        S
      </div>
    </div>
  );
}
