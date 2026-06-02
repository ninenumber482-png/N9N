import { Link } from "react-router-dom";

/* One source of truth for page-level layout so every screen shares the same
   max-width, vertical rhythm, and header treatment (desktop + mobile).
   Horizontal/outer padding is owned by <Layout>; PageShell only centers content,
   sets a consistent max-width, and renders a uniform page header. */

const MAX = {
  default: "max-w-5xl", // standard content pages (wallet, history, profile…)
  wide: "max-w-7xl",    // dense dashboards
  full: "max-w-none",   // full-bleed (marketplace)
};

export default function PageShell({
  title,
  subtitle,
  back,            // { to, label } — optional back link
  actions,         // optional right-aligned node (buttons, filters)
  max = "default",
  className = "",
  children,
}) {
  const hasHeader = title || subtitle || back || actions;
  return (
    <div className={`mx-auto w-full ${MAX[max] ?? MAX.default} space-y-4 sm:space-y-5 ${className}`}>
      {hasHeader && (
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {back && (
              <Link
                to={back.to}
                className="mb-1 inline-flex items-center gap-1 text-zinc-500 transition hover:text-white"
              >
                <span>←</span>
                <span className="text-xs font-semibold">{back.label}</span>
              </Link>
            )}
            {title && (
              <h1 className="truncate text-lg font-extrabold text-white sm:text-xl">{title}</h1>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </div>
  );
}
