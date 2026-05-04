import { normalizeDonorMatchAlias } from './bank-donor-matching';

export type RecurringPatternType = 'monthly' | 'weekly' | 'quarterly' | 'irregular';

export interface DonationForRecurringDetection {
  id: string;
  donor_id: string;
  donation_date: string;
  amount_pence: number;
  provider_reference: string | null;
  bank_reference: string | null;
}

export interface DetectedRecurringPattern {
  donor_id: string;
  pattern_signature: string;
  pattern_type: RecurringPatternType;
  expected_amount_pence: number;
  amount_tolerance_pence: number;
  expected_day_of_month: number | null;
  bank_reference_alias: string | null;
  normalized_bank_reference: string | null;
  confidence_score: number;
  occurrence_count: number;
  last_occurrence_at: string;
  last_detected_at: string;
  next_expected_date: string | null;
}

export interface RecurringDetectionOptions {
  minOccurrences?: number;
  defaultGraceDays?: number;
}

const DEFAULT_MIN = 3;

function parseDayUTC(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDate();
}

function daysBetweenUtc(a: string, b: string): number {
  const da = new Date(`${a.slice(0, 10)}T00:00:00.000Z`).getTime();
  const db = new Date(`${b.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.round((db - da) / (24 * 60 * 60 * 1000));
}

function medianInt(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function amountTolerance(median: number): number {
  return Math.max(50, Math.round(median * 0.05));
}

function amountClusterOk(amounts: number[], median: number, tol: number): boolean {
  return amounts.every((a) => Math.abs(a - median) <= tol);
}

function refKeyFromDonation(d: DonationForRecurringDetection): string {
  const raw = d.bank_reference?.trim() || d.provider_reference?.trim() || '';
  const n = normalizeDonorMatchAlias(raw);
  return n || '__no_ref__';
}

function addMonthsUtc(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  const dim = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, dim);
  const out = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), day));
  return out.toISOString().slice(0, 10);
}

function addDaysUtc(isoDate: string, days: number): string {
  const t = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`).getTime();
  return new Date(t + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function medianGapDays(dates: string[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i += 1) {
    gaps.push(daysBetweenUtc(dates[i - 1]!, dates[i]!));
  }
  return medianInt(gaps);
}

/** Longest contiguous subsequence starting at each index with gap constraints; pick best scoring by length × confidence. */
function longestChainWithGap(
  rows: DonationForRecurringDetection[],
  minGap: number,
  maxGap: number,
  medianAmountTol: number,
  minLen: number
): DonationForRecurringDetection[] {
  let best: DonationForRecurringDetection[] = [];
  for (let start = 0; start < rows.length; start += 1) {
    const chain = [rows[start]!];
    for (let next = start + 1; next < rows.length; next += 1) {
      const gap = daysBetweenUtc(chain[chain.length - 1]!.donation_date, rows[next]!.donation_date);
      if (gap >= minGap && gap <= maxGap) {
        chain.push(rows[next]!);
      } else {
        break;
      }
    }
    if (chain.length < minLen) continue;
    const med = medianInt(chain.map((r) => r.amount_pence));
    const tol = amountTolerance(med);
    const amounts = chain.map((r) => r.amount_pence);
    if (!amountClusterOk(amounts, med, Math.max(tol, medianAmountTol))) continue;
    const lastDate = chain[chain.length - 1]!.donation_date;
    const bestLast = best[best.length - 1]?.donation_date;
    if (
      chain.length > best.length ||
      (chain.length === best.length && bestLast && lastDate > bestLast)
    ) {
      best = chain;
    }
  }
  return best;
}

function buildSignature(
  type: RecurringPatternType,
  normRef: string,
  medianAmount: number
): string {
  const amt = Math.round(medianAmount / 50) * 50;
  return `${type}|${normRef}|${amt}`;
}

export function normalizeBankRefForSignature(d: DonationForRecurringDetection): string {
  return refKeyFromDonation(d);
}

/** Extract best recurring chains per donor+ref slice. Caller groups and sorts donations. */
function detectChainsForSlice(
  rows: DonationForRecurringDetection[],
  minLen: number
): DetectedRecurringPattern[] {
  if (rows.length < minLen) return [];
  const sorted = [...rows].sort(
    (a, b) => a.donation_date.localeCompare(b.donation_date) || a.id.localeCompare(b.id)
  );

  const normRef = refKeyFromDonation(sorted[0]!);
  const displayRef =
    sorted[0]!.bank_reference?.trim() ||
    sorted[0]!.provider_reference?.trim() ||
    null;

  const candidates: Array<{ type: RecurringPatternType; chain: DonationForRecurringDetection[] }> = [];

  const monthly = longestChainWithGap(sorted, 26, 36, 0, minLen);
  if (monthly.length >= minLen) candidates.push({ type: 'monthly', chain: monthly });

  const weekly = longestChainWithGap(sorted, 5, 10, 0, minLen);
  if (weekly.length >= minLen) candidates.push({ type: 'weekly', chain: weekly });

  const quarterly = longestChainWithGap(sorted, 82, 115, 0, minLen);
  if (quarterly.length >= minLen) candidates.push({ type: 'quarterly', chain: quarterly });

  let picked: (typeof candidates)[number] | null = null;
  if (candidates.length > 0) {
    const rank: Record<RecurringPatternType, number> = {
      monthly: 4,
      quarterly: 3,
      weekly: 2,
      irregular: 1,
    };
    picked = [...candidates].sort((a, b) => {
      const rd = rank[b.type] - rank[a.type];
      if (rd !== 0) return rd;
      return b.chain.length - a.chain.length;
    })[0]!;
  }

  if (!picked && sorted.length >= 4) {
    const med = medianInt(sorted.map((r) => r.amount_pence));
    const tol = amountTolerance(med);
    if (amountClusterOk(
      sorted.map((r) => r.amount_pence),
      med,
      tol
    )) {
      const gaps = [];
      for (let i = 1; i < sorted.length; i += 1) {
        gaps.push(daysBetweenUtc(sorted[i - 1]!.donation_date, sorted[i]!.donation_date));
      }
      const maxGap = Math.max(...gaps);
      const minGap = Math.min(...gaps);
      const looksRegular =
        (minGap >= 26 && maxGap <= 36) ||
        (minGap >= 5 && maxGap <= 10) ||
        (minGap >= 82 && maxGap <= 115);
      if (!looksRegular) {
        picked = { type: 'irregular', chain: sorted };
      }
    }
  }

  if (!picked) return [];

  const chain = picked.chain;
  const medAmount = medianInt(chain.map((r) => r.amount_pence));
  const tol = amountTolerance(medAmount);
  const last = chain[chain.length - 1]!;
  const lastDate = last.donation_date.slice(0, 10);
  const days = chain.map((r) => parseDayUTC(r.donation_date));
  const expectedDay = medianInt(days);

  let nextExpected: string | null = null;
  if (picked.type === 'monthly') {
    nextExpected = addMonthsUtc(lastDate, 1);
  } else if (picked.type === 'weekly') {
    const gap = medianGapDays(chain.map((c) => c.donation_date));
    nextExpected = addDaysUtc(lastDate, Math.max(5, Math.min(10, gap || 7)));
  } else if (picked.type === 'quarterly') {
    nextExpected = addMonthsUtc(lastDate, 3);
  } else {
    const mg = medianGapDays(chain.map((c) => c.donation_date));
    if (mg > 0) nextExpected = addDaysUtc(lastDate, mg);
  }

  const confidence = Math.min(
    0.95,
    0.65 + 0.05 * Math.min(chain.length - Math.max(minLen, 2), 6)
  );

  const signature = buildSignature(picked.type, normRef, medAmount);
  const now = new Date().toISOString();

  return [
    {
      donor_id: chain[0]!.donor_id,
      pattern_signature: signature,
      pattern_type: picked.type,
      expected_amount_pence: medAmount,
      amount_tolerance_pence: tol,
      expected_day_of_month: picked.type === 'monthly' ? Math.min(28, Math.max(1, expectedDay)) : null,
      bank_reference_alias: displayRef,
      normalized_bank_reference: normRef === '__no_ref__' ? null : normRef,
      confidence_score: Number(confidence.toFixed(4)),
      occurrence_count: chain.length,
      last_occurrence_at: `${lastDate}T12:00:00.000Z`,
      last_detected_at: now,
      next_expected_date: nextExpected,
    },
  ];
}

/**
 * Group posted donations by donor + normalised bank reference; detect at most one pattern per group.
 */
export function detectRecurringDonorPatterns(
  donations: DonationForRecurringDetection[],
  options?: RecurringDetectionOptions
): DetectedRecurringPattern[] {
  const minOcc = Math.max(2, options?.minOccurrences ?? DEFAULT_MIN);

  const byKey = new Map<string, DonationForRecurringDetection[]>();
  for (const d of donations) {
    if (!d.donor_id || d.amount_pence <= 0) continue;
    const key = `${d.donor_id}|${refKeyFromDonation(d)}`;
    const list = byKey.get(key) ?? [];
    list.push(d);
    byKey.set(key, list);
  }

  const out: DetectedRecurringPattern[] = [];
  for (const slice of byKey.values()) {
    out.push(...detectChainsForSlice(slice, minOcc));
  }
  return out;
}

export interface RecurringPatternForInsight {
  donor_id: string;
  pattern_type: RecurringPatternType;
  expected_amount_pence: number;
  amount_tolerance_pence: number;
  normalized_bank_reference: string | null;
  status: 'active' | 'paused' | 'dismissed';
  grace_days: number;
  next_expected_date: string | null;
  last_occurrence_at: string | null;
}

/**
 * True if no posted donation in window after expected date with amount within tolerance.
 */
export function isMissedRecurringDonation(params: {
  pattern: RecurringPatternForInsight;
  postedDonations: Array<{
    donor_id: string;
    donation_date: string;
    amount_pence: number;
  }>;
  todayIso?: string;
}): boolean {
  if (params.pattern.status !== 'active' || !params.pattern.next_expected_date) return false;
  const today = params.todayIso ?? new Date().toISOString().slice(0, 10);
  const deadline = addDaysUtc(
    params.pattern.next_expected_date,
    params.pattern.grace_days
  );
  if (today <= deadline) return false;

  const ref = params.pattern.normalized_bank_reference;
  const matchesDonor = (d: (typeof params.postedDonations)[number]) => d.donor_id === params.pattern.donor_id;
  const afterExpected = params.postedDonations.filter(
    (d) =>
      matchesDonor(d) &&
      d.donation_date.slice(0, 10) >= params.pattern.next_expected_date! &&
      Math.abs(d.amount_pence - params.pattern.expected_amount_pence) <=
        params.pattern.amount_tolerance_pence
  );
  return afterExpected.length === 0;
}

export function projectedGiftAidPenceNextMonth(patterns: RecurringPatternForInsight[]): number {
  let total = 0;
  for (const p of patterns) {
    if (p.status !== 'active') continue;
    const ga = Math.round(p.expected_amount_pence * 0.25);
    if (p.pattern_type === 'monthly') total += ga;
    else if (p.pattern_type === 'weekly') total += Math.round(ga * 4.33);
    else if (p.pattern_type === 'quarterly') total += Math.round(ga / 3);
    /* irregular: skip projection */
  }
  return total;
}
