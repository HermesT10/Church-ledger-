/* ------------------------------------------------------------------ */
/*  Budget math utilities (pure functions, no Supabase dependency)      */
/* ------------------------------------------------------------------ */

/** The 12 monthly pence column keys in order. */
export const MONTH_KEYS = [
  'm01_pence',
  'm02_pence',
  'm03_pence',
  'm04_pence',
  'm05_pence',
  'm06_pence',
  'm07_pence',
  'm08_pence',
  'm09_pence',
  'm10_pence',
  'm11_pence',
  'm12_pence',
] as const;

export type MonthKey = (typeof MONTH_KEYS)[number];

/** Minimal shape of a budget line row needed by the math helpers. */
export interface BudgetLineRow {
  id: string;
  m01_pence: bigint;
  m02_pence: bigint;
  m03_pence: bigint;
  m04_pence: bigint;
  m05_pence: bigint;
  m06_pence: bigint;
  m07_pence: bigint;
  m08_pence: bigint;
  m09_pence: bigint;
  m10_pence: bigint;
  m11_pence: bigint;
  m12_pence: bigint;
}

/* ------------------------------------------------------------------ */
/*  monthKeyFromIndex                                                  */
/* ------------------------------------------------------------------ */

/**
 * Convert a 1-based month index (1 = January … 12 = December) to its
 * corresponding column key, e.g. 1 → 'm01_pence'.
 */
export function monthKeyFromIndex(month: number): MonthKey {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month must be 1–12, got ${month}`);
  }
  return MONTH_KEYS[month - 1];
}

/* ------------------------------------------------------------------ */
/*  sumMonths                                                          */
/* ------------------------------------------------------------------ */

/**
 * Sum all 12 monthly pence values for a single budget line.
 * Returns the annual total as a bigint.
 */
export function sumMonths(line: BudgetLineRow): bigint {
  let total = 0n;
  for (const key of MONTH_KEYS) {
    total += BigInt(line[key]);
  }
  return total;
}

/* ------------------------------------------------------------------ */
/*  setMonthAmount                                                     */
/* ------------------------------------------------------------------ */

/**
 * Return a shallow copy of `line` with the specified month's pence
 * value replaced.
 *
 * @param line        The original budget line row.
 * @param monthIndex  1-based month (1 = Jan, 12 = Dec).
 * @param amountPence The new value in pence.
 */
export function setMonthAmount(
  line: BudgetLineRow,
  monthIndex: number,
  amountPence: bigint,
): BudgetLineRow {
  const key = monthKeyFromIndex(monthIndex);
  return { ...line, [key]: amountPence };
}

/* ------------------------------------------------------------------ */
/*  computeRowTotals                                                   */
/* ------------------------------------------------------------------ */

/**
 * Compute the annual total for every line.
 * Returns a Map from line.id → annual total (bigint).
 */
export function computeRowTotals(
  lines: BudgetLineRow[],
): Map<string, bigint> {
  const map = new Map<string, bigint>();
  for (const line of lines) {
    map.set(line.id, sumMonths(line));
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  computeColumnTotals                                                */
/* ------------------------------------------------------------------ */

/**
 * Sum each month column across all lines.
 * Returns an array of 12 bigint values (index 0 = m01, index 11 = m12).
 */
export function computeColumnTotals(lines: BudgetLineRow[]): bigint[] {
  const totals: bigint[] = Array.from({ length: 12 }, () => 0n);
  for (const line of lines) {
    for (let i = 0; i < 12; i++) {
      totals[i] += BigInt(line[MONTH_KEYS[i]]);
    }
  }
  return totals;
}
