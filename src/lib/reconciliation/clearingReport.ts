/* ------------------------------------------------------------------ */
/*  Clearing Account Reconciliation Report – Pure Functions            */
/* ------------------------------------------------------------------ */

import { isProbablePayoutJournal } from './matching';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface JournalLineInput {
  journal_id: string;
  journal_date: string;
  journal_memo: string | null;
  account_id: string;
  debit_pence: number;
  credit_pence: number;
}

export interface ProviderClearingMap {
  provider: string;
  clearingAccountId: string;
  clearingAccountName: string;
}

export type ClearingStatus = 'clear' | 'outstanding' | 'overdue';

export interface ClearingProviderRow {
  provider: string;
  clearingAccountId: string;
  clearingAccountName: string;
  /** Current clearing account balance (debits - credits). Positive = money owed by platform. */
  balancePence: number;
  /** Number of posted payout journals NOT yet matched to a bank line. */
  openPayoutCount: number;
  /** Oldest unmatched payout journal date, or null if all matched. */
  oldestOpenPayoutDate: string | null;
  /** Status derived from balance and age. */
  status: ClearingStatus;
}

/* ------------------------------------------------------------------ */
/*  computeClearingBalances                                             */
/* ------------------------------------------------------------------ */

/**
 * Computes per-provider clearing account balances and open payout metrics.
 *
 * @param journalLines       All journal lines touching any clearing account (posted journals only)
 * @param matchedJournalIds  Set of journal IDs that have been matched in bank_reconciliation_matches
 * @param providerMap        Provider-to-clearing-account mapping from giving_platforms
 * @param asOfDate           Reference date for overdue calculation (default: today)
 */
export function computeClearingBalances(params: {
  journalLines: JournalLineInput[];
  matchedJournalIds: Set<string>;
  providerMap: ProviderClearingMap[];
  asOfDate?: string;
}): ClearingProviderRow[] {
  const { journalLines, matchedJournalIds, providerMap, asOfDate } = params;

  const today = asOfDate ?? new Date().toISOString().slice(0, 10);
  const overdueThresholdMs = 30 * 24 * 60 * 60 * 1000; // 30 days

  return providerMap.map((pm) => {
    // Filter lines for this clearing account
    const lines = journalLines.filter(
      (jl) => jl.account_id === pm.clearingAccountId
    );

    // Compute balance: debits increase, credits decrease
    const balancePence = lines.reduce(
      (sum, jl) => sum + jl.debit_pence - jl.credit_pence,
      0
    );

    // Find payout journals (credit to clearing = payout arriving)
    // that are NOT matched yet
    const payoutJournalIds = new Set<string>();
    const payoutDates: string[] = [];

    for (const jl of lines) {
      // Payout journals credit the clearing account
      if (jl.credit_pence > 0) {
        const payoutInfo = isProbablePayoutJournal(jl.journal_memo);
        if (payoutInfo.isPayout && !matchedJournalIds.has(jl.journal_id)) {
          if (!payoutJournalIds.has(jl.journal_id)) {
            payoutJournalIds.add(jl.journal_id);
            payoutDates.push(jl.journal_date);
          }
        }
      }
    }

    const openPayoutCount = payoutJournalIds.size;
    payoutDates.sort();
    const oldestOpenPayoutDate = payoutDates[0] ?? null;

    // Determine status
    let status: ClearingStatus = 'clear';
    if (balancePence !== 0 || openPayoutCount > 0) {
      status = 'outstanding';
      if (oldestOpenPayoutDate) {
        const ageMs =
          new Date(today).getTime() - new Date(oldestOpenPayoutDate).getTime();
        if (ageMs > overdueThresholdMs) {
          status = 'overdue';
        }
      }
    }

    return {
      provider: pm.provider,
      clearingAccountId: pm.clearingAccountId,
      clearingAccountName: pm.clearingAccountName,
      balancePence,
      openPayoutCount,
      oldestOpenPayoutDate,
      status,
    };
  });
}
