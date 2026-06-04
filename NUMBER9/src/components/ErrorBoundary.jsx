import React from "react";
import { CTX } from "../i18n/context";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static contextType = CTX;

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info?.componentStack);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoLogin = () => {
    try { localStorage.removeItem('n9_auth'); } catch {}
    window.location.hash = '#/login';
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const t = this.context?.t || ((k) => k);
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#050607] px-6 text-center">
          <div className="mb-4 text-5xl">⚠️</div>
          <h1 className="mb-2 text-xl font-bold text-white">
            {t('error.ui_crash_title') || 'Something went wrong'}
          </h1>
          <p className="mb-6 max-w-md text-sm text-zinc-400">
            {t('error.ui_crash') || 'The page hit an unexpected error. Your session is safe — try reloading.'}
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mb-6 max-w-2xl overflow-x-auto rounded-lg border border-red-400/30 bg-[#1a1010] px-4 py-3 text-left text-[11px] text-red-300">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="h-10 rounded-lg bg-yellow-400 px-5 text-sm font-extrabold text-black transition hover:bg-yellow-300"
            >
              {t('common.reload') || 'Reload Page'}
            </button>
            <button
              type="button"
              onClick={this.handleGoLogin}
              className="h-10 rounded-lg border border-[#1f2128] bg-[#13151c] px-5 text-sm font-bold text-zinc-300 transition hover:border-yellow-400/30 hover:text-white"
            >
              {t('common.back_to_login') || 'Back to Login'}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
