/* ------------------------------------------------------------------ */
/*  SumUp CSV mapper                                                   */
/* ------------------------------------------------------------------ */
/*  Typical SumUp export columns:                                      */
/*  Transaction ID, Date, Time, Type, Transaction Amount,             */
/*  Tip Amount, Transaction Fee, Net Amount, Currency,                */
/*  Card Type, Payment Method, Customer Name                          */
/* ------------------------------------------------------------------ */

import type { DetectedColumns, NormalizedRow } from '../types';
import { parseMoneyToPence, parseDate } from '../importUtils';

/** SumUp rows are only imported if status is in this set (or column absent). */
const REJECTED_STATUSES = new Set(['failed', 'refunded', 'cancelled', 'reversed', 'chargeback']);

const COL_HINTS: Record<keyof DetectedColumns, string[]> = {
  date: ['date', 'transaction date', 'payment date'],
  grossAmount: ['transaction amount', 'amount', 'gross amount', 'total amount'],
  feeAmount: ['transaction fee', 'fee', 'sumup fee', 'fees'],
  netAmount: ['net amount', 'net', 'payout amount'],
  donorName: ['customer name', 'customer', 'name', 'donor name', 'donor'],
  reference: ['transaction id', 'transaction_id', 'id', 'reference', 'receipt number'],
  payoutReference: ['payout id', 'payout_id', 'payout reference'],
  status: ['status', 'transaction status'],
};

export function detectColumns(headers: string[]): DetectedColumns | null {
  const lower = headers.map((h) => h.toLowerCase().trim());

  function find(hints: string[]): string | null {
    const idx = lower.findIndex((h) => hints.includes(h));
    return idx !== -1 ? headers[idx] : null;
  }

  const date = find(COL_HINTS.date);
  const grossAmount = find(COL_HINTS.grossAmount);
  if (!date || !grossAmount) return null;

  return {
    date,
    grossAmount,
    feeAmount: find(COL_HINTS.feeAmount),
    netAmount: find(COL_HINTS.netAmount),
    donorName: find(COL_HINTS.donorName),
    reference: find(COL_HINTS.reference),
    payoutReference: find(COL_HINTS.payoutReference),
    status: find(COL_HINTS.status),
  };
}

export function mapRow(
  raw: Record<string, string>,
  cols: DetectedColumns
): NormalizedRow | null {
  // Skip failed / refunded / cancelled transactions
  if (cols.status) {
    const status = (raw[cols.status] ?? '').toLowerCase().trim();
    if (status && REJECTED_STATUSES.has(status)) return null;
  }

  const dateStr = parseDate(raw[cols.date]);
  if (!dateStr) return null;

  const grossPence = Math.abs(Number(parseMoneyToPence(raw[cols.grossAmount] ?? '0')));
  if (grossPence === 0) return null;

  const feePence = cols.feeAmount
    ? Math.abs(Number(parseMoneyToPence(raw[cols.feeAmount] ?? '0')))
    : 0;

  const netPence = cols.netAmount
    ? Math.abs(Number(parseMoneyToPence(raw[cols.netAmount] ?? '0')))
    : grossPence - feePence;

  return {
    txn_date: dateStr,
    gross_amount_pence: grossPence,
    fee_amount_pence: feePence,
    net_amount_pence: netPence,
    donor_name: cols.donorName ? raw[cols.donorName]?.trim() || null : null,
    reference: cols.reference ? raw[cols.reference]?.trim() || null : null,
    payout_reference: cols.payoutReference
      ? raw[cols.payoutReference]?.trim() || null
      : null,
    raw,
  };
}
