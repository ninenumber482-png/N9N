import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, Outlet, useParams, useNavigate } from "react-router-dom";
import { useStore, isDemoMode, clearAllData, setDemoMode } from "./store/useStore";
import ErrorBoundary from "./components/ErrorBoundary";
import { I18nProvider } from "./i18n";
import Layout from "./components/Layout";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import WalletPage from "./pages/WalletPage";
import DepositPage from "./pages/DepositPage";
import WithdrawPage from "./pages/WithdrawPage";
import GamePage from "./pages/GamePage";
import TradingPage from "./pages/TradingPage";
import TurnoverPage from "./pages/TurnoverPage";
import ReferralPage from "./pages/ReferralPage";
import MyNetworkPage from "./pages/MyNetworkPage";
import HistoryPage from "./pages/HistoryPage";
import ProfilePage from "./pages/ProfilePage";
import SupportPage from "./pages/SupportPage";

function ClientRoute() {
  const { clientUuid } = useParams();
  const auth = useStore(s => s.auth);
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth) {
      navigate('/login', { replace: true });
    } else if (auth.id !== clientUuid) {
      navigate(`/c/${auth.id}/dashboard`, { replace: true });
    }
  }, [auth, clientUuid, navigate]);

  if (!auth || auth.id !== clientUuid) return null;
  return <Outlet />;
}

function AppContent() {
  const auth = useStore(s => s.auth);

  return (
    <Routes>
      <Route path="/" element={auth ? <Navigate to={`/c/${auth.id}/dashboard`} replace /> : <LandingPage />} />
      <Route path="/login" element={auth ? <Navigate to={`/c/${auth.id}/dashboard`} replace /> : <LoginPage />} />
      <Route path="/register" element={auth ? <Navigate to={`/c/${auth.id}/dashboard`} replace /> : <RegisterPage />} />

      <Route path="/c/:clientUuid" element={<ClientRoute />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Layout><DashboardPage /></Layout>} />
        <Route path="wallet" element={<Layout><WalletPage /></Layout>} />
        <Route path="deposit" element={<Layout><DepositPage /></Layout>} />
        <Route path="withdraw" element={<Layout><WithdrawPage /></Layout>} />
        <Route path="king" element={<Layout><GamePage /></Layout>} />
        <Route path="trading" element={<Layout><TradingPage /></Layout>} />
        <Route path="turnover" element={<Layout><TurnoverPage /></Layout>} />
        <Route path="referral" element={<Layout><ReferralPage /></Layout>} />
        <Route path="network" element={<Layout><MyNetworkPage /></Layout>} />
        <Route path="history" element={<Layout><HistoryPage /></Layout>} />
        <Route path="profile" element={<Layout><ProfilePage /></Layout>} />
        <Route path="support" element={<Layout><SupportPage /></Layout>} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  const auth = useStore(s => s.auth);
  const subscribeUserStatus = useStore(s => s.subscribeUserStatus);

  useEffect(() => {
    // Mark store as hydrated
    useStore.setState({ _hydrated: true });
  }, []);

  useEffect(() => {
    let unsub = () => { };
    if (auth?.id) {
      unsub = subscribeUserStatus(auth.id);
    }
    return () => unsub();
  }, [auth?.id, subscribeUserStatus]);

  useEffect(() => {
    // Expose utilities to browser console for development/admin use
    if (typeof window !== 'undefined') {
      window.NUMBER9 = {
        clearAllData: () => {
          clearAllData();
          alert('✅ All NUMBER9 data cleared. Reload to test with real database.');
        },
        setDemoMode: (enabled) => {
          setDemoMode(enabled);
          alert(`✅ Demo mode ${enabled ? 'enabled' : 'disabled'}. Reload to apply.`);
        },
        isDemoMode: () => isDemoMode(),
        logout: () => {
          useStore.setState({ auth: null });
          localStorage.removeItem('n9_auth');
          alert('✅ Logged out.');
        }
      };
      console.log('%c[NUMBER9] Console utilities ready', 'color: #f4c400; font-weight: bold;');
      console.log('window.NUMBER9.clearAllData()  — Wipe all localStorage data (ready for database)');
      console.log('window.NUMBER9.setDemoMode(true/false) — Toggle demo mode');
      console.log('window.NUMBER9.isDemoMode() — Check current mode');
      console.log('window.NUMBER9.logout() — Logout current user');
    }
  }, []);

  return (
    <ErrorBoundary>
      <I18nProvider>
        <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center">
          <img
            src="/assets/img/number9-logo.png"
            alt=""
            className="w-[80%] max-w-175 h-auto opacity-[0.04]"
            style={{ filter: 'grayscale(1)' }}
          />
        </div>
        <HashRouter>
          <div className="relative z-10">
            <AppContent />
          </div>
        </HashRouter>
      </I18nProvider>
    </ErrorBoundary>
  );
}

export default App;


