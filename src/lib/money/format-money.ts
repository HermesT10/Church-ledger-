export type FormatMoneyOptions = {
  currency?: 'GBP';
  /** Optional explicit sign prefix: + for positive, - for negative (handled in number, not duplicated). */
  showPlusForPositive?: boolean;
  /** When true, omit currency symbol and use plain grouping (for rare cases). */
  amountOnly?: boolean;
};

/** Canonical GBP money string from signed pence. No duplicate minus signs. */
export function formatMoney(
  pence: number | null | undefined,
  options: FormatMoneyOptions = {},
): string {
  if (pence == null || Number.isNaN(pence)) return '—';
  const { currency = 'GBP', showPlusForPositive = false } = options;
  const negative = pence < 0;
  const abs = Math.abs(Math.round(pence));
  const body = (abs / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (currency !== 'GBP') {
    return `${negative ? '-' : showPlusForPositive && pence > 0 ? '+' : ''}${body}`;
  }
  const sign =
    negative ? '-' : showPlusForPositive && pence > 0 ? '+' : '';
  return `${sign}£${body}`;
}
