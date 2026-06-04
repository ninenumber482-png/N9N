// Amount presets
export const DEPOSIT_PRESETS = [100, 500, 1000, 5000, 10000];
export const WITHDRAW_PRESETS = [100, 500, 1000, 5000];

// Withdrawal methods
export const WITHDRAWAL_METHODS = [
  { key: 'BANK_TRANSFER', label: 'Bank Transfer', note: '1–2 hari · 0% fee', min: 100 },
  { key: 'USDT_TRC20', label: 'USDT TRC20', note: 'Instan · 0% fee', min: 50 },
  { key: 'E_WALLET', label: 'E-Wallet', note: 'Instan · 1% fee', min: 25 },
];

// UI Timing
export const TOAST_DURATION_MS = 3500;
export const DEPOSIT_LOCK_MS = 15 * 60 * 1000;
export const WITHDRAWAL_LOCK_MS = 15 * 60 * 1000;
