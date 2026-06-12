/** Pages that can be access-limited per admin (route key + label).
 *  /overview is intentionally excluded — always allowed (no lock-out). */
export interface AdminFeature {
  key: string; // route path, matches Menu.pages routes
  label: string;
}

export const ADMIN_FEATURES: AdminFeature[] = [
  { key: '/users', label: 'Management Member' },
  { key: '/deposits', label: 'Deposit' },
  { key: '/withdrawals', label: 'Withdraw' },
  { key: '/turnover', label: 'Turnover' },
  { key: '/manual', label: 'Saldo Manual' },
  { key: '/transactions', label: 'Transactions' },
  { key: '/wallets', label: 'Wallets' },
  { key: '/3dking', label: '3D King Engine' },
  { key: '/bets', label: 'Bet History' },
  { key: '/session-monitor', label: 'Session Monitor' },
  { key: '/gaming', label: 'Gaming Overview' },
  { key: '/kyc', label: 'KYC Verification' },
  { key: '/referrals', label: 'Referrals' },
  { key: '/audit', label: 'Audit Log' },
  { key: '/security-center', label: 'Security Center' },
  { key: '/risk-management', label: 'Risk Management' },
  { key: '/ip-whitelist', label: 'IP Whitelist' },
  { key: '/system', label: 'Configuration' },
  { key: '/role-management', label: 'Role Management' },
  { key: '/popup-banner', label: 'Popup Banners' },
  { key: '/cs-contact', label: 'CS Contact' },
];

export const ALWAYS_ALLOWED = ['/overview'];

/** Route-key for a URL: first path segment, e.g. '/deposits?x=1' => '/deposits'. */
export function routeKey(url: string): string {
  const path = (url || '').split('?')[0];
  const seg = path.split('/').filter(Boolean)[0];
  return seg ? `/${seg}` : '/overview';
}

/** Is `url` allowed for an account with these permissions?
 *  null/empty permissions = full access. superadmin handled by the caller. */
export function isPageAllowed(url: string, permissions: string[] | null | undefined): boolean {
  if (!permissions || permissions.length === 0) return true;
  const key = routeKey(url);
  return ALWAYS_ALLOWED.includes(key) || permissions.includes(key);
}
