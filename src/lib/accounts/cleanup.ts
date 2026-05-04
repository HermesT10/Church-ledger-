import type { AccountRow } from './types';

export type CleanupSeverity = 'info' | 'warning' | 'error';

export interface AccountCleanupSuggestion {
  id: string;
  severity: CleanupSeverity;
  title: string;
  detail: string;
  accountIds: string[];
  fixHref?: string;
}

/** Pure heuristics over account metadata (no DB access) */
export function buildAccountCleanupSuggestions(accounts: AccountRow[]): AccountCleanupSuggestion[] {
  const out: AccountCleanupSuggestion[] = [];
  const byCode = new Map<string, AccountRow[]>();
  for (const a of accounts) {
    const k = a.code.trim().toLowerCase();
    if (!byCode.has(k)) byCode.set(k, []);
    byCode.get(k)!.push(a);
  }
  for (const [code, rows] of byCode) {
    if (rows.length > 1) {
      out.push({
        id: `dup-code-${code}`,
        severity: 'warning',
        title: `Duplicate code pattern: ${rows[0].code}`,
        detail: 'Multiple accounts share the same code (case-insensitive). Merge or rename for clarity.',
        accountIds: rows.map((r) => r.id),
        fixHref: '/accounts?tab=cleanup',
      });
    }
  }

  const missingCat = accounts.filter((a) => !a.reporting_category?.trim());
  if (missingCat.length > 0) {
    out.push({
      id: 'missing-reporting-category',
      severity: 'info',
      title: 'Accounts without reporting category',
      detail: 'Charity reports and trustee summaries work best when every line maps to a reporting category.',
      accountIds: missingCat.map((a) => a.id),
    });
  }

  const missingSubtype = accounts.filter((a) => !a.subtype?.trim());
  if (missingSubtype.length > 5) {
    out.push({
      id: 'missing-subtype',
      severity: 'info',
      title: 'Many accounts lack subtype',
      detail: 'Subtypes help staff pick the right category in donation and expense flows.',
      accountIds: missingSubtype.slice(0, 20).map((a) => a.id),
    });
  }

  return out;
}
