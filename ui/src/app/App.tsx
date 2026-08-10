import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "@/shared/stores/auth";
import { Trail } from "@/features/effects/Trail";
import { StarField } from "@/features/auth/StarField";
import { AppLayout } from "@/app/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { CardsPage } from "@/pages/CardsPage";
import { CardDetailsPage } from "@/pages/CardDetailsPage";
import { AccountDetailsPage } from "@/pages/AccountDetailsPage";
import { TransferByCardPage } from "@/pages/TransferByCardPage";
import { TransferByPhonePage } from "@/pages/TransferByPhonePage";
import { ExchangePage } from "@/pages/ExchangePage";
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
import { AdminPage } from "@/pages/AdminPage";
import { LogPanel } from "@/features/devlog/LogPanel";

/** Защищённые роуты: нет токена → /login, есть токен → сама страница. */
function Protected({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

/** Если юзер уже авторизован — не пускаем на /login, а сразу на дашборд. */
function GuestOnly({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/home" replace />;
  return children;
}

/** Только для админа: иначе — редирект на дашборд. */
function AdminOnly({ children }: { children: JSX.Element }) {
  const role = useAuthStore((s) => s.role);
  if (role !== "ADMIN") return <Navigate to="/home" replace />;
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
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<DashboardPage />} />
        {/* Обратная совместимость: старый /dashboard → /home */}
        <Route path="/dashboard" element={<Navigate to="/home" replace />} />
        <Route path="/cards" element={<CardsPage />} />
        <Route path="/cards/:id" element={<CardDetailsPage />} />
        <Route path="/accounts/:id" element={<AccountDetailsPage />} />
        <Route path="/transfers" element={<TransfersPage />} />
        <Route path="/transfers/by-card" element={<TransferByCardPage />} />
        <Route path="/transfers/by-phone" element={<TransferByPhonePage />} />
        <Route path="/transfers/exchange" element={<ExchangePage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/payments/mobile" element={<MobilePaymentPage />} />
        <Route path="/payments/utility" element={<UtilityPaymentPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/personal" element={<PersonalDataPage />} />
        <Route path="/profile/security" element={<SecurityPage />} />
        <Route path="/profile/appearance" element={<AppearancePage />} />
        <Route path="/profile/sbp-bank" element={<SbpBankPage />} />
        <Route
          path="/admin"
          element={
            <AdminOnly>
              <AdminPage />
            </AdminOnly>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
    <LogPanel />
    </>
  );
}
