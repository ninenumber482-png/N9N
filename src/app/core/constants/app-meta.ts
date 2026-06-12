export const APP_META = {
  name: 'Number9 System D',
  version: '1.0.0',
  channel: 'Admin Gateway',
} as const;

export const SECURITY_STACK = [
  { key: 'auth', label: 'OAuth 2.0 & OIDC' },
  { key: 'mfa', label: 'Google Authenticator (TOTP)' },
  { key: 'tls', label: 'TLS · encrypted transport' },
  { key: 'gateway', label: 'Cloudflare gateway · IP whitelist' },
  { key: 'session', label: 'Session 7 hari · audit log' },
] as const;
