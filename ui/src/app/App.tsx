import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useSession } from "../api/session";
import { AppLayout, PublicLayout } from "./Layout";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { HomePage } from "../pages/home/HomePage";
import { PaymentsPage } from "../pages/payments/PaymentsPage";
import { PhoneTransferPage } from "../pages/payments/PhoneTransferPage";
import { OwnTransferPage } from "../pages/payments/OwnTransferPage";
import { CardTransferPage } from "../pages/payments/CardTransferPage";
import { MobilePage } from "../pages/payments/MobilePage";
import { UtilityPage } from "../pages/payments/UtilityPage";
import { TopUpPage } from "../pages/payments/TopUpPage";
import { OperationPage } from "../pages/OperationPage";
import { HistoryPage } from "../pages/HistoryPage";
import { LimitsPage } from "../pages/LimitsPage";
import { NotFoundPage } from "../pages/NotFoundPage";

/** Без токена — на вход, запомнив, куда шли. */
function RequireAuth() {
  const token = useSession((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <AppLayout />;
}

/** Вход и регистрация — только без токена. */
function PublicOnly() {
  const token = useSession((s) => s.token);
  if (token) return <Navigate to="/" replace />;
  return (
    <PublicLayout>
      <Outlet />
    </PublicLayout>
  );
}

function NotFoundRoute() {
  const token = useSession((s) => s.token);
  return token ? (
    <AppLayout>
      <NotFoundPage />
    </AppLayout>
  ) : (
    <PublicLayout>
      <NotFoundPage />
    </PublicLayout>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/transfer/phone" element={<PhoneTransferPage />} />
        <Route path="/transfer/own" element={<OwnTransferPage />} />
        <Route path="/transfer/card" element={<CardTransferPage />} />
        <Route path="/pay/mobile" element={<MobilePage />} />
        <Route path="/pay/utility" element={<UtilityPage />} />
        <Route path="/topup" element={<TopUpPage />} />
        <Route path="/operations/:id" element={<OperationPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/limits" element={<LimitsPage />} />
      </Route>
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}
