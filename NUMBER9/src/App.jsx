import { useEffect, useRef } from "react";
import { HashRouter, Routes, Route, Navigate, Outlet, useParams, useNavigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { useStore, isDemoMode, setDemoMode } from "./store/useStore";
import { usePolling } from "./hooks/usePolling";
import { supabase } from "./utils/supabase";
import { refreshKingData, listBids } from "./store/king";
import ErrorBoundary from "./components/ErrorBoundary";
import PopupBanner from "./components/ui/PopupBanner";
import { I18nProvider } from "./i18n";
import Layout from "./components/Layout";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import WalletPage from "./pages/WalletPage";
import TradingPage from "./pages/TradingPage";
import ReferralPage from "./pages/ReferralPage";
import MyNetworkPage from "./pages/MyNetworkPage";
import HistoryPage from "./pages/HistoryPage";
import ProfilePage from "./pages/ProfilePage";
import SupportPage from "./pages/SupportPage";
/* Lazy-load the 2 heaviest pages so the initial bundle stays small.
   GamePage is ~1k lines (ArenaStage + 3 useEffect timers + market chart).
   RegisterPage is the multi-step form with bank/KYC uploads.
   They split into separate chunks via dynamic import(). */
const GamePage = lazy(() => import("./pages/GamePage"));
const RegisterPageLazy = lazy(() => import("./pages/RegisterPage"));

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

/* Suspense fallback for lazy-loaded pages. Renders a centered spinner
   inside the same dark shell so the transition feels seamless. */
function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
    </div>
  );
}

function AppContent() {
  const auth = useStore(s => s.auth);

  return (
    <>
      <PopupBanner />
      <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={auth ? <Navigate to={`/c/${auth.id}/dashboard`} replace /> : <LandingPage />} />
        <Route path="/login" element={auth ? <Navigate to={`/c/${auth.id}/dashboard`} replace /> : <LoginPage />} />
        <Route path="/register" element={auth ? <Navigate to={`/c/${auth.id}/dashboard`} replace /> : <RegisterPageLazy />} />

        <Route path="/c/:clientUuid" element={<ClientRoute />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Layout><DashboardPage /></Layout>} />
          <Route path="king" element={<Layout><GamePage /></Layout>} />
          <Route path="wallet" element={<Layout><WalletPage /></Layout>} />
          <Route path="deposit" element={<Navigate to="../wallet?tab=deposit" replace />} />
          <Route path="withdraw" element={<Navigate to="../wallet?tab=withdraw" replace />} />
          <Route path="turnover" element={<Navigate to="../wallet?tab=turnover" replace />} />
          <Route path="trading" element={<Layout><TradingPage /></Layout>} />
          <Route path="referral" element={<Layout><ReferralPage /></Layout>} />
          <Route path="network" element={<Layout><MyNetworkPage /></Layout>} />
          <Route path="history" element={<Layout><HistoryPage /></Layout>} />
          <Route path="profile" element={<Layout><ProfilePage /></Layout>} />
          <Route path="support" element={<Layout><SupportPage /></Layout>} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    </>
  );
}

function App() {
  const auth = useStore(s => s.auth);

  useEffect(() => {
    useStore.setState({ _hydrated: true });
  }, []);

  // Track last-seen timestamps to detect new transactions/accounts
  // (more reliable than ID comparison for detecting new rows added)
  const lastTxCheckRef = useRef(null);
  const lastBetCheckRef = useRef(null);
  const lastAccountCheckRef = useRef(null);

  // Polling + Realtime hybrid — refresh every 10s, also subscribe to changes
  usePolling(async () => {
    if (!auth?.id || !supabase) return;
    try {
      // Refresh balances (main = Portfolio, reserved = pending WD, buying power = main - reserved)
      await useStore.getState().fetchBalances();

      // Refresh transactions (check all recent ones, not just 5)
      const { data: txs } = await supabase
        .from('transactions')
        .select('id, type, status, amount, created_at')
        .eq('user_id', auth.id)
        .order('created_at', { ascending: false })
        .limit(50);  // Check more rows to catch batch inserts

      // Refresh bets via king.js cache
      await refreshKingData(auth.id);

      // Check platform accounts (global, no auth needed)
      const { data: accounts } = await supabase
        .from('platform_accounts')
        .select('id, created_at')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(1);

      // Detect NEW data: if the latest timestamp changed, bump the counter
      const latestTxTime = txs?.[0]?.created_at;
      const latestBetTime = listBids()?.[0]?.created_at;
      const latestAccountTime = accounts?.[0]?.created_at;

      const newTxSeen = !!latestTxTime && latestTxTime !== lastTxCheckRef.current;
      const newBetSeen = !!latestBetTime && latestBetTime !== lastBetCheckRef.current;
      const newAccountSeen = !!latestAccountTime && latestAccountTime !== lastAccountCheckRef.current;

      if (newTxSeen) lastTxCheckRef.current = latestTxTime;
      if (newBetSeen) lastBetCheckRef.current = latestBetTime;
      if (newAccountSeen) lastAccountCheckRef.current = latestAccountTime;

      // Batch into a single setState to avoid cascading re-renders
      if (newTxSeen || newBetSeen || newAccountSeen) {
        useStore.setState(s => ({
          _rtTick: newTxSeen ? (s._rtTick || 0) + 1 : s._rtTick,
          _kingVersion: newBetSeen ? (s._kingVersion || 0) + 1 : s._kingVersion,
          _accountsVersion: newAccountSeen ? (s._accountsVersion || 0) + 1 : s._accountsVersion,
        }));
      }
    } catch (e) {
      // Polling error — silent in production, log in dev
      if (import.meta.env.DEV) console.warn('[Polling]', e);
    }
  }, 10000, [auth?.id]);

  // Realtime subscriptions for transactions, bets, and platform accounts (WebSocket is now enabled)
  useEffect(() => {
    if (!supabase) return;
    const subs = [];

    // Subscribe to user's transactions (if logged in)
    if (auth?.id) {
      const txChannel = supabase
        .channel(`transactions:user_id=eq.${auth.id}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${auth.id}` },
          () => {
            useStore.setState(s => ({ _rtTick: (s._rtTick || 0) + 1 }));
          }
        )
        .subscribe();
      subs.push(txChannel);

      // Subscribe to user's bets
      const betChannel = supabase
        .channel(`bets:user_id=eq.${auth.id}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'bets', filter: `user_id=eq.${auth.id}` },
          () => {
            useStore.setState(s => ({ _kingVersion: (s._kingVersion || 0) + 1 }));
          }
        )
        .subscribe();
      subs.push(betChannel);
    }

    // Subscribe to platform accounts (global, affects all users)
    const accountsChannel = supabase
      .channel('platform_accounts:status=eq.ACTIVE')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'platform_accounts', filter: 'status=eq.ACTIVE' },
        () => {
          useStore.setState(s => ({ _accountsVersion: (s._accountsVersion || 0) + 1 }));
        }
      )
      .subscribe();
    subs.push(accountsChannel);

    return () => {
      subs.forEach(ch => supabase.removeChannel(ch));
    };
  }, [auth?.id]);

  useEffect(() => {
    // Dev tools only in development mode
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      window.NUMBER9 = {
        clearAllData: () => {
          useStore.getState().clearAllData();
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


