import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "@/shared/stores/auth";
import { isSessionUnlocked } from "@/features/auth/session";
import { Trail } from "@/features/effects/Trail";
import { StarField } from "@/features/auth/StarField";
import { AppLayout } from "@/app/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { PinLoginPage } from "@/pages/PinLoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { CardsPage } from "@/pages/CardsPage";
import { CardDetailsPage } from "@/pages/CardDetailsPage";
import { AccountDetailsPage } from "@/pages/AccountDetailsPage";
import { TransferByCardPage } from "@/pages/TransferByCardPage";
import { TransferByPhonePage } from "@/pages/TransferByPhonePage";
import { MobilePaymentPage } from "@/pages/MobilePaymentPage";
import { UtilityPaymentPage } from "@/pages/UtilityPaymentPage";
import { TransfersPage } from "@/pages/TransfersPage";
import { PaymentsPage } from "@/pages/PaymentsPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { PersonalDataPage } from "@/pages/PersonalDataPage";
import { SecurityPage } from "@/pages/SecurityPage";
import { AppearancePage } from "@/pages/AppearancePage";
import { SbpBankPage } from "@/pages/SbpBankPage";

/**
 * Защищённые роуты: три состояния
 * 1) нет токена         → /login (ввод пароля)
 * 2) токен + PIN + не разблокирована сессия → /pin (быстрый вход по коду)
 * 3) всё ок             → сама страница
 * Плюс: если PIN просрочен (7 дней), автоматически logout.
 */
function Protected({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  const hasPin = useAuthStore((s) => !!s.pinHash);
  const isPinExpired = useAuthStore((s) => s.isPinExpired);
  const logout = useAuthStore((s) => s.logout);

  if (!token) return <Navigate to="/login" replace />;
  if (hasPin && isPinExpired()) {
    logout();
    return <Navigate to="/login" replace />;
  }
  if (hasPin && !isSessionUnlocked()) return <Navigate to="/pin" replace />;
  return children;
}

/** Если юзер уже авторизован — не пускаем на /login и /pin, а сразу на дашборд. */
function GuestOnly({ children, requirePin }: { children: JSX.Element; requirePin?: boolean }) {
  const token = useAuthStore((s) => s.token);
  const hasPin = useAuthStore((s) => !!s.pinHash);
  if (requirePin) {
    // /pin: показывать только если есть токен + установленный PIN + сессия не разблокирована.
    if (!token || !hasPin || isSessionUnlocked()) return <Navigate to="/dashboard" replace />;
    return children;
  }
  // /login: если токен есть, пропускаем — но если требуется PIN, отправим на /pin.
  if (token) {
    if (hasPin && !isSessionUnlocked()) return <Navigate to="/pin" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export function App() {
  return (
    <>
      {/* Глобальный фон: анимированный градиент + парящие звёзды + летающая золотая частица.
          Живёт на всех экранах (и auth, и внутренние). Под всем контентом (z 0-2), над body-bg. */}
      <StarField />
      <Trail />
      <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/pin"
        element={
          <GuestOnly requirePin>
            <PinLoginPage />
          </GuestOnly>
        }
      />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/cards" element={<CardsPage />} />
        <Route path="/cards/:id" element={<CardDetailsPage />} />
        <Route path="/accounts/:id" element={<AccountDetailsPage />} />
        <Route path="/transfers" element={<TransfersPage />} />
        <Route path="/transfers/by-card" element={<TransferByCardPage />} />
        <Route path="/transfers/by-phone" element={<TransferByPhonePage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/payments/mobile" element={<MobilePaymentPage />} />
        <Route path="/payments/utility" element={<UtilityPaymentPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/personal" element={<PersonalDataPage />} />
        <Route path="/profile/security" element={<SecurityPage />} />
        <Route path="/profile/appearance" element={<AppearancePage />} />
        <Route path="/profile/sbp-bank" element={<SbpBankPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </>
  );
}
