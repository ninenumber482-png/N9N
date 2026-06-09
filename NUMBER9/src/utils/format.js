import { IDR_RATE } from '../constants';

export function formatNumber(value, options = {}) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';

  const {
    minimumFractionDigits = 0,
    maximumFractionDigits = 0,
    locale = 'id-ID'
  } = options;

  return num.toLocaleString(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  });
}

export function formatCurrency(value, options = {}) {
  return formatNumber(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  });
}

export function formatPoints(value) {
  return formatNumber(value) + ' P';
}

export function formatIDR(points) {
  return 'Rp ' + formatNumber(points * IDR_RATE);
}