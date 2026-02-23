import { createHash } from 'crypto';

/* ------------------------------------------------------------------ */
/*  parseBankDate                                                      */
/* ------------------------------------------------------------------ */

const MONTH_NAMES: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04',
  may: '05', jun: '06', jul: '07', aug: '08',
  sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * Parse a bank-statement date string into ISO YYYY-MM-DD.
 *
 * Supported formats:
 *  - ISO:           2025-12-31, 2025-12-31T18:58:00
 *  - UK numeric:    31/12/2025, 31-12-2025, 31.12.2025
 *  - DDMMMYYYY:     31Dec2025, 31-Dec-2025, 31 Dec 2025 (case-insensitive)
 *  - D MMM YYYY:    1 Jan 2025, 1-Jan-2025
 *
 * Returns null if the date cannot be parsed.
 */
export function parseBankDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // 1. ISO: YYYY-MM-DD (optionally followed by time)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // 2. UK numeric: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const ukMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (ukMatch) {
    const day = ukMatch[1].padStart(2, '0');
    const month = ukMatch[2].padStart(2, '0');
    const year = ukMatch[3];
    return `${year}-${month}-${day}`;
  }

  // 3. DDMMMYYYY / DD-MMM-YYYY / DD MMM YYYY (case-insensitive)
  const namedMatch = s.match(/^(\d{1,2})[\s\-.]?([A-Za-z]{3})[\s\-.]?(\d{4})/);
  if (namedMatch) {
    const day = namedMatch[1].padStart(2, '0');
    const monthStr = namedMatch[2].toLowerCase();
    const year = namedMatch[3];
    const month = MONTH_NAMES[monthStr];
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  // 4. Fallback: try native Date constructor (handles many edge cases)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  parseMoneyToPence                                                  */
/* ------------------------------------------------------------------ */

/**
 * Convert a money string (or number) to integer pence as bigint.
 *
 * Handles:
 *  - £ signs, commas, whitespace
 *  - Negative amounts via leading `-` or accounting parentheses `(12.34)`
 *  - Plain numbers like 12.34
 *  - Returns 0n for empty / invalid input
 */
export function parseMoneyToPence(input: string | number): bigint {
  if (typeof input === 'number') {
    return BigInt(Math.round(input * 100));
  }

  let str = input.trim();
  if (str === '') return 0n;

  // Detect parentheses notation for negative: "(12.34)" => negative
  let negative = false;
  if (str.startsWith('(') && str.endsWith(')')) {
    negative = true;
    str = str.slice(1, -1);
  }

  // Strip currency symbols, commas, whitespace
  str = str.replace(/[£$€,\s]/g, '');

  // Detect leading minus
  if (str.startsWith('-')) {
    negative = !negative; // double-negative cancels
    str = str.slice(1);
  }

  const num = parseFloat(str);
  if (isNaN(num)) return 0n;

  const pence = Math.round(num * 100);
  return negative ? BigInt(-pence) : BigInt(pence);
}

/* ------------------------------------------------------------------ */
/*  normalizeText                                                      */
/* ------------------------------------------------------------------ */

/**
 * Trim, lowercase, and collapse multiple spaces to single space.
 * Returns "" for null/undefined.
 */
export function normalizeText(input?: string | null): string {
  if (input == null) return '';
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

/* ------------------------------------------------------------------ */
/*  makeFingerprint                                                    */
/* ------------------------------------------------------------------ */

/**
 * Generate a SHA-256 fingerprint for a bank transaction line.
 * Used for deduplication when importing CSV files.
 *
 * fingerprint = sha256(txn_date | amount_pence | normalized(reference) | normalized(description))
 */
export function makeFingerprint(params: {
  txn_date: string;
  amount_pence: bigint;
  reference: string;
  description: string;
}): string {
  const parts = [
    params.txn_date,
    params.amount_pence.toString(),
    normalizeText(params.reference),
    normalizeText(params.description),
  ].join('|');

  return createHash('sha256').update(parts).digest('hex');
}
