/**
 * Pure helpers for bank text → income_streams.code hints (Funds Control Centre).
 * Kept separate from smartFeatures.ts so it stays importable outside Server Actions.
 */

/** Heuristic code snippet for matching against `income_streams.code`. */
export function suggestIncomeStreamCodeFromBankText(reference: string): string | null {
  const ref = reference.trim().toLowerCase();
  if (!ref) return null;

  if (/(giving|tithe|offering|gift aid)/.test(ref)) return 'GIVING';
  if (/(hall|lett|rent|hall hire)/.test(ref)) return 'LETTINGS';
  if (/grant/.test(ref)) return 'GRANTS';
  if (/(event|quiz|auction|coffee)/.test(ref)) return 'FUNDRAISE';
  if (/paypal|stripe|gocardless|sumup/.test(ref)) return 'ONLINE';

  return null;
}
