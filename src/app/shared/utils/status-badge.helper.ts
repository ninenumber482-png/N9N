export type BadgeTone = 'success' | 'warn' | 'danger' | 'info' | 'neutral';

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  COMPLETED: 'success',
  SETTLED: 'success',
  APPROVED: 'success',
  WIN: 'success',
  VERIFIED: 'success',
  ONLINE: 'success',
  ENABLED: 'success',
  ENDED: 'neutral',
  PENDING: 'warn',
  OPEN: 'warn',
  PROCESSING: 'warn',
  HIGH: 'warn',
  MEDIUM: 'warn',
  EXPIRED: 'warn',
  REJECTED: 'danger',
  FAILED: 'danger',
  LOSE: 'danger',
  CRITICAL: 'danger',
  BANNED: 'danger',
  BLOCKED: 'danger',
  INACTIVE: 'neutral',
  LOW: 'neutral',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
  DEPOSIT: 'success',
  WITHDRAWAL: 'warn',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  PENDING_VERIFICATION: 'Pending',
  SETTLED: 'Settled',
  CANCELLED: 'Cancelled',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  WIN: 'Win',
  LOSE: 'Lose',
  VERIFIED: 'Verified',
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdraw',
  OPEN: 'Open',
  CLOSED: 'Closed',
  ENDED: 'Ended',
  EXPIRED: 'Expired',
};

export function badgeTone(value: string | null | undefined, severity?: string): BadgeTone {
  if (severity) {
    const map: Record<string, BadgeTone> = {
      success: 'success',
      warn: 'warn',
      danger: 'danger',
      info: 'info',
      secondary: 'neutral',
      contrast: 'neutral',
    };
    return map[severity] ?? 'neutral';
  }
  if (!value) return 'neutral';
  return STATUS_TONE[value.toUpperCase()] ?? 'neutral';
}

export function badgeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const key = value.toUpperCase();
  return STATUS_LABEL[key] ?? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function badgeClass(value: string | null | undefined, severity?: string): string {
  return `n9-badge-${badgeTone(value, severity)}`;
}
