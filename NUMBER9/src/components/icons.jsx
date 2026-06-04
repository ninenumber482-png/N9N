/* Real SVG icon set — no emoji */
/* eslint-disable react-refresh/only-export-components */

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const Icon = {
  Crown: (p) => (
    <svg
      width={p?.size || 20}
      height={p?.size || 20}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M3 7l4 5 5-8 5 8 4-5-2 12H5z" />
      <path d="M5 19h14" />
    </svg>
  ),
  Wallet: (p) => (
    <svg
      width={p?.size || 20}
      height={p?.size || 20}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
      <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
      <rect x="16" y="12" width="6" height="4" rx="1" />
    </svg>
  ),
  Grid: (p) => (
    <svg
      width={p?.size || 20}
      height={p?.size || 20}
      viewBox="0 0 24 24"
      {...base}
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  Trade: (p) => (
    <svg
      width={p?.size || 20}
      height={p?.size || 20}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  ),
  Turnover: (p) => (
    <svg
      width={p?.size || 18}
      height={p?.size || 18}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </svg>
  ),
  Users: (p) => (
    <svg
      width={p?.size || 18}
      height={p?.size || 18}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Clock: (p) => (
    <svg
      width={p?.size || 18}
      height={p?.size || 18}
      viewBox="0 0 24 24"
      {...base}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  User: (p) => (
    <svg
      width={p?.size || 20}
      height={p?.size || 20}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Help: (p) => (
    <svg
      width={p?.size || 18}
      height={p?.size || 18}
      viewBox="0 0 24 24"
      {...base}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Bell: (p) => (
    <svg
      width={p?.size || 18}
      height={p?.size || 18}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Menu: (p) => (
    <svg
      width={p?.size || 22}
      height={p?.size || 22}
      viewBox="0 0 24 24"
      {...base}
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  LogOut: (p) => (
    <svg
      width={p?.size || 18}
      height={p?.size || 18}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Close: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  ),
  Check: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Lock: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  Shield: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
    </svg>
  ),
  Info: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  Warn: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Coin: (p) => (
    <svg
      width={p?.size || 18}
      height={p?.size || 18}
      viewBox="0 0 24 24"
      {...base}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9h4a2 2 0 0 1 0 4H9V8m0 5h5a2 2 0 0 1 0 4H9v-5m3-7v12" />
    </svg>
  ),
  Bank: (p) => (
    <svg
      width={p?.size || 18}
      height={p?.size || 18}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
    </svg>
  ),
  Phone: (p) => (
    <svg
      width={p?.size || 18}
      height={p?.size || 18}
      viewBox="0 0 24 24"
      {...base}
    >
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  ),
  Chat: (p) => (
    <svg
      width={p?.size || 18}
      height={p?.size || 18}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  ArrowDown: (p) => (
    <svg
      width={p?.size || 18}
      height={p?.size || 18}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  ),
  ArrowUp: (p) => (
    <svg
      width={p?.size || 18}
      height={p?.size || 18}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
  ArrowRight: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  ),
  Chevron: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  ),
  ChevronDown: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  Copy: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  ID: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <circle cx="9" cy="12" r="2.5" />
      <path d="M14 10h5M14 13h5" />
    </svg>
  ),
  Search: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  ),
  Upload: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Eye: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  EyeOff: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ),
  Logo: (p) => (
    <svg
      width={p?.size || 18}
      height={p?.size || 18}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M5 3h4l6 14V3h4v18h-4L9 7v14H5z" />
    </svg>
  ),
  FileText: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="13" x2="8" y2="13" />
      <line x1="12" y1="17" x2="8" y2="17" />
      <polyline points="9 9 8 9 8 10 9 10" />
    </svg>
  ),
  Download: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  History: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
      <path d="M12 2a10 10 0 0 0 0 20" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  ),
  Alert: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Security: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M12 2L2 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
      <polyline points="10 17 14 13 15 14 11 18 8 15" />
    </svg>
  ),
  Transaction: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  ),
  Login: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      {...base}
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  ),
  Refresh: (p) => (
    <svg
      width={p?.size || 16}
      height={p?.size || 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...base}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
};

export default Icon;
