export function currencyCode(value) {
  return ({ '£': 'GBP', '€': 'EUR', '$': 'USD', kr: 'SEK' })[value] || value || 'GBP';
}

export function formatPrice(value, currency = 'GBP') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '--';
  const code = currencyCode(currency);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}
