export function currencyCode(value = 'GBP') {
  const normalized = String(value).trim().toUpperCase();
  return ({ '£': 'GBP', '$': 'USD', '€': 'EUR', KR: 'SEK' })[normalized] || normalized || 'GBP';
}

export function formatMoney(value, currency = 'GBP', digits = 2) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '--';
  const code = currencyCode(currency);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(digits)}`;
  }
}
