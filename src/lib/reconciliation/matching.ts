/* ------------------------------------------------------------------ */
/*  Bank Reconciliation – Pure Matching Logic                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BankLineForMatching {
  id: string;
  txn_date: string;        // ISO YYYY-MM-DD
  amount_pence: number;
  description: string | null;
  reference: string | null;
}

export interface JournalForMatching {
  id: string;
  journal_date: string;    // ISO YYYY-MM-DD
  memo: string | null;
  /** Total amount across relevant journal lines (absolute value). */
  amountPence: number;
}

export interface MatchCandidate {
  journalId: string;
  journalDate: string;
  memo: string;
  amountPence: number;
  matchType: 'payout' | 'manual';
  provider: string | null;
  score: number;           // 0-100 composite score
  reasons: string[];       // human-readable explanation
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const KNOWN_PROVIDERS = ['gocardless', 'sumup', 'izettle'];
const PROVIDER_KEYWORDS: Record<string, string[]> = {
  gocardless: ['gocardless', 'gc', 'go cardless'],
  sumup: ['sumup', 'sum up'],
  izettle: ['izettle', 'zettle', 'paypal zettle'],
};

/* ------------------------------------------------------------------ */
/*  isProbablePayoutJournal                                            */
/* ------------------------------------------------------------------ */

/**
 * Checks if a journal memo matches the payout journal pattern:
 *   "{Provider} payout {ref} (Import {id})"
 */
export function isProbablePayoutJournal(
  memo: string | null
): { isPayout: boolean; provider: string | null } {
  if (!memo) return { isPayout: false, provider: null };

  const lower = memo.toLowerCase();

  // Check for the word "payout" and one of the known providers
  if (!lower.includes('payout')) {
    return { isPayout: false, provider: null };
  }

  for (const provider of KNOWN_PROVIDERS) {
    const keywords = PROVIDER_KEYWORDS[provider] ?? [provider];
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return { isPayout: true, provider };
      }
    }
  }

  // Has "payout" but no recognized provider
  return { isPayout: true, provider: null };
}

/* ------------------------------------------------------------------ */
/*  scoreMatch                                                         */
/* ------------------------------------------------------------------ */

/**
 * Computes a 0–100 match score between a bank line and a candidate journal.
 *
 * Scoring breakdown:
 * - Amount match (0-50):  exact = 50, within 1% = 30, within 5% = 10
 * - Date proximity (0-25): same day = 25, ≤3 days = 15, ≤7 days = 10
 * - Reference match (0-25): reference/description mentions provider or payout ref
 */
export function scoreMatch(
  bankLine: BankLineForMatching,
  journal: JournalForMatching
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const bankAmt = Math.abs(bankLine.amount_pence);
  const journalAmt = journal.amountPence;

  // --- Amount match (0-50) ---
  if (bankAmt === journalAmt && journalAmt > 0) {
    score += 50;
    reasons.push('Exact amount match');
  } else if (journalAmt > 0) {
    const diff = Math.abs(bankAmt - journalAmt);
    const pct = diff / journalAmt;
    if (pct <= 0.01) {
      score += 30;
      reasons.push('Amount within 1%');
    } else if (pct <= 0.05) {
      score += 10;
      reasons.push('Amount within 5%');
    }
  }

  // --- Date proximity (0-25) ---
  const daysDiff = daysBetween(bankLine.txn_date, journal.journal_date);
  if (daysDiff === 0) {
    score += 25;
    reasons.push('Same date');
  } else if (daysDiff <= 3) {
    score += 15;
    reasons.push(`${daysDiff} day(s) apart`);
  } else if (daysDiff <= 7) {
    score += 10;
    reasons.push(`${daysDiff} days apart`);
  } else if (daysDiff <= 14) {
    score += 5;
    reasons.push(`${daysDiff} days apart`);
  }

  // --- Reference match (0-25) ---
  const refScore = scoreReferenceMatch(bankLine, journal);
  score += refScore.points;
  if (refScore.reason) {
    reasons.push(refScore.reason);
  }

  return { score: Math.min(score, 100), reasons };
}

/* ------------------------------------------------------------------ */
/*  rankCandidates                                                     */
/* ------------------------------------------------------------------ */

/**
 * Sorts candidates by score descending and returns top N.
 */
export function rankCandidates(
  candidates: MatchCandidate[],
  topN = 3
): MatchCandidate[] {
  return [...candidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/* ------------------------------------------------------------------ */
/*  buildMatchCandidate                                                */
/* ------------------------------------------------------------------ */

/**
 * Builds a MatchCandidate by scoring a bank line against a journal.
 */
export function buildMatchCandidate(
  bankLine: BankLineForMatching,
  journal: JournalForMatching
): MatchCandidate {
  const payoutInfo = isProbablePayoutJournal(journal.memo);
  const { score, reasons } = scoreMatch(bankLine, journal);

  return {
    journalId: journal.id,
    journalDate: journal.journal_date,
    memo: journal.memo ?? '',
    amountPence: journal.amountPence,
    matchType: payoutInfo.isPayout ? 'payout' : 'manual',
    provider: payoutInfo.provider,
    score,
    reasons,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  const diffMs = Math.abs(a.getTime() - b.getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function scoreReferenceMatch(
  bankLine: BankLineForMatching,
  journal: JournalForMatching
): { points: number; reason: string | null } {
  const bankText = [bankLine.reference, bankLine.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!bankText) return { points: 0, reason: null };

  const memo = (journal.memo ?? '').toLowerCase();

  // Check if bank line mentions a known provider
  for (const provider of KNOWN_PROVIDERS) {
    const keywords = PROVIDER_KEYWORDS[provider] ?? [provider];
    for (const kw of keywords) {
      if (bankText.includes(kw)) {
        // And journal is from same provider
        const payoutInfo = isProbablePayoutJournal(journal.memo);
        if (payoutInfo.provider === provider) {
          return { points: 25, reason: `Bank reference matches ${provider} payout` };
        }
        // Bank mentions provider but journal is different/unknown
        return { points: 10, reason: `Bank reference mentions ${provider}` };
      }
    }
  }

  // Check if any word from memo appears in bank reference
  const memoWords = memo.split(/\s+/).filter((w) => w.length > 3);
  for (const word of memoWords) {
    if (bankText.includes(word)) {
      return { points: 15, reason: 'Reference overlaps with journal memo' };
    }
  }

  return { points: 0, reason: null };
}
