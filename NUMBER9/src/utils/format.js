const numberFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 2,
});

export function formatNumber(value) {
  const number = Number(value ?? 0);
  return numberFormatter.format(Number.isFinite(number) ? number : 0);
}
