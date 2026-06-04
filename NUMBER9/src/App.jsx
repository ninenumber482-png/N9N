import { useEffect, useRef } from "react";
import { HashRouter, Routes, Route, Navigate, Outlet, useParams, useNavigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { useStore, isDemoMode, clearAllData, setDemoMode } from "./store/useStore";
import { subscribeToWalletAndTransactions, subscribeToSettledBets } from "./store/realtimeManager";
import { usePolling } from "./hooks/usePolling";
import { supabase } from "./utils/supabase";
import { refreshKingData, listBids } from "./store/king";
import ErrorBoundary from "./components/ErrorBoundary";
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
  );
}

function App() {
  const auth = useStore(s => s.auth);
  const subscribeUserStatus = useStore(s => s.subscribeUserStatus);
  const subscribePlatformConfig = useStore(s => s.subscribePlatformConfig);

  useEffect(() => {
    // Mark store as hydrated
    useStore.setState({ _hydrated: true });
  }, []);

  // Platform config subscription (always active, not auth-scoped)
  useEffect(() => {
    const unsubPlatform = subscribePlatformConfig();
    return () => unsubPlatform?.();
  }, [subscribePlatformConfig]);

  // Auth-scoped subscriptions (wallet, transactions, user status, settled bets)
  useEffect(() => {
    let unsubWallet = () => {};
    let unsubUserStatus = () => {};
    let unsubBets = () => {};

    if (auth?.id) {

      // Wallet + transactions realtime
      (async () => {
        unsubWallet = await subscribeToWalletAndTransactions(
          auth.id,
          () => useStore.getState().fetchBalances(),
          (tx) => {
            useStore.setState(s => ({ _rtTick: (s._rtTick || 0) + 1 }));

            // Transaction notification dispatch
            if (tx.type === 'DEPOSIT' && tx.status === 'COMPLETED') {
              useStore.setState({
                systemNotification: {
                  type: 'deposit_approved',
                  title: 'Deposit Approved',
                  message: `+${Number(tx.amount || 0).toLocaleString()} P has been credited to your wallet.`,
                },
              });
            }
            if (tx.type === 'DEPOSIT' && (tx.status === 'REJECTED' || tx.status === 'FAILED')) {
              useStore.setState({
                systemNotification: {
                  type: 'deposit_rejected',
                  title: 'Deposit Rejected',
                  message: `Your deposit of ${Number(tx.amount || 0).toLocaleString()} P was rejected.`,
                },
              });
            }
            if (tx.type === 'WITHDRAWAL' && tx.status === 'COMPLETED') {
              useStore.setState({
                systemNotification: {
                  type: 'withdraw_approved',
                  title: 'Withdrawal Complete',
                  message: `${Number(tx.amount || 0).toLocaleString()} P has been withdrawn.`,
                },
              });
            }
            if (tx.type === 'WITHDRAWAL' && (tx.status === 'REJECTED' || tx.status === 'FAILED')) {
              useStore.setState({
                systemNotification: {
                  type: 'withdraw_rejected',
                  title: 'Withdrawal Rejected',
                  message: `Your withdrawal of ${Number(tx.amount || 0).toLocaleString()} P was rejected.`,
                },
              });
            }
          },
          () => {}
        );
      })();

      // User status realtime
      unsubUserStatus = subscribeUserStatus(auth.id);

      // Settled bets realtime
      (async () => {
        unsubBets = await subscribeToSettledBets(
          auth.id,
          () => {
            // On bet settlement, trigger version bump to update UI
            useStore.setState(s => ({ _kingVersion: (s._kingVersion || 0) + 1 }));
          },
          () => {}
        );
      })();
    }

    return () => {
      unsubWallet?.();
      unsubUserStatus?.();
      unsubBets?.();
    };
  }, [auth?.id, subscribeUserStatus]);

  // Track last-seen "head" IDs to skip redundant _rtTick/_kingVersion bumps
  // when polling finds no new data — prevents cascading re-renders across the app.
  const lastSeenTxIdRef = useRef(null);
  const lastSeenBetIdRef = useRef(null);

  // Polling fallback — refresh wallet & transactions every 15s
  // (WebSocket realtime is disabled due to Cloudflare error 1101)
  usePolling(async () => {
    if (!auth?.id || !supabase) return;
    try {
      // Refresh balances (main = Portfolio, reserved = pending WD, buying power = main - reserved)
      await useStore.getState().fetchBalances();
      // Refresh transactions (minimal columns, fewer rows)
      const { data: txs } = await supabase
        .from('transactions')
        .select('id, type, status, amount, created_at')
        .eq('user_id', auth.id)
        .order('created_at', { ascending: false })
        .limit(5);

      // Refresh bets via king.js cache
      await refreshKingData(auth.id);
      const latestBetId = listBids()?.[0]?.id || null;

      // Only bump counters if the head of either stream has actually changed
      const latestTxId = txs?.[0]?.id || null;
      const newTxSeen = !!latestTxId && latestTxId !== lastSeenTxIdRef.current;
      const newBetSeen = !!latestBetId && latestBetId !== lastSeenBetIdRef.current;
      if (newTxSeen) lastSeenTxIdRef.current = latestTxId;
      if (newBetSeen) lastSeenBetIdRef.current = latestBetId;

      // Batch into a single setState to avoid two re-renders
      if (newTxSeen || newBetSeen) {
        useStore.setState(s => ({
          _rtTick: newTxSeen ? (s._rtTick || 0) + 1 : s._rtTick,
          _kingVersion: newBetSeen ? (s._kingVersion || 0) + 1 : s._kingVersion,
        }));
      }
    } catch (e) {
      // Polling error — silent in production, log in dev
      if (import.meta.env.DEV) console.warn('[Polling]', e);
    }
  }, 15000, [auth?.id]);

  useEffect(() => {
    // Dev tools only in development mode
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
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


