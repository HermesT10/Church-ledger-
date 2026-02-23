/* ------------------------------------------------------------------ */
/*  Giving Import Utilities – pure functions                           */
/* ------------------------------------------------------------------ */

import { createHash } from 'crypto';

/* ------------------------------------------------------------------ */
/*  parseMoneyToPence                                                  */
/* ------------------------------------------------------------------ */

/**
 * Convert a money string (or number) to integer pence as bigint.
 *
 * Handles:
 *  - £/$€ signs, commas, whitespace
 *  - Negative via leading `-` or accounting parentheses `(12.34)`
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
    negative = !negative;
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

export function normalizeText(input?: string | null): string {
  if (input == null) return '';
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

/* ------------------------------------------------------------------ */
/*  parseDate                                                          */
/* ------------------------------------------------------------------ */

/**
 * Parse a date string into YYYY-MM-DD ISO format.
 * Handles: ISO, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, and JS Date fallback.
 * Returns null if unparseable.
 */
export function parseDate(input?: string | null): string | null {
  if (!input) return null;
  const str = input.trim();
  if (str === '') return null;

  // ISO format: YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // UK / EU: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const ukMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (ukMatch) {
    const day = ukMatch[1].padStart(2, '0');
    const month = ukMatch[2].padStart(2, '0');
    const year = ukMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Fallback: try Date constructor
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

/* ------------------------------------------------------------------ */
/*  fingerprintGivingRow                                               */
/* ------------------------------------------------------------------ */

/**
 * Generate a SHA-256 fingerprint for a giving transaction row.
 * Used for deduplication on re-import.
 *
 * fingerprint = sha256(provider | txn_date | gross_pence | fee_pence | normalized(reference))
 */
export function fingerprintGivingRow(params: {
  provider: string;
  txn_date: string;
  gross_amount_pence: number;
  fee_amount_pence: number;
  reference: string | null;
}): string {
  const parts = [
    params.provider,
    params.txn_date,
    params.gross_amount_pence.toString(),
    params.fee_amount_pence.toString(),
    normalizeText(params.reference),
  ].join('|');

  return createHash('sha256').update(parts).digest('hex');
}

/* ------------------------------------------------------------------ */
/*  validateGivingRow                                                  */
/* ------------------------------------------------------------------ */

/**
 * Validates a normalized giving row. Returns null if valid, or an error string.
 */
export function validateGivingRow(row: {
  txn_date: string;
  gross_amount_pence: number;
  fee_amount_pence: number;
  net_amount_pence: number;
}): string | null {
  if (!row.txn_date || !/^\d{4}-\d{2}-\d{2}$/.test(row.txn_date)) {
    return 'Invalid date.';
  }
  if (row.gross_amount_pence <= 0) {
    return 'Gross amount must be positive.';
  }
  if (row.fee_amount_pence < 0) {
    return 'Fee amount cannot be negative.';
  }
  if (row.net_amount_pence < 0) {
    return 'Net amount cannot be negative.';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  importHashFromCsv                                                  */
/* ------------------------------------------------------------------ */

/**
 * Generate a hash from CSV content + provider for dedup of whole imports.
 */
export function importHashFromCsv(csvText: string, provider: string): string {
  return createHash('sha256')
    .update(`${provider}|${csvText}`)
    .digest('hex');
}
