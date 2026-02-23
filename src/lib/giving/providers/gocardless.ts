/* ------------------------------------------------------------------ */
/*  GoCardless CSV mapper                                              */
/* ------------------------------------------------------------------ */
/*  Typical GoCardless export columns:                                 */
/*  id, created_at, charge_date, amount, app_fee, status,             */
/*  currency, description, customer_name, customer_email,             */
/*  payout_id, payout_date                                            */
/* ------------------------------------------------------------------ */

import type { DetectedColumns, NormalizedRow } from '../types';
import { parseMoneyToPence, parseDate } from '../importUtils';

/** GoCardless rows are only imported if their status is in this set. */
const ACCEPTED_STATUSES = new Set(['paid_out', 'confirmed', 'paid']);

const COL_HINTS: Record<keyof DetectedColumns, string[]> = {
  date: ['charge_date', 'charge date', 'created_at', 'created at', 'date'],
  grossAmount: ['amount', 'gross amount', 'gross'],
  feeAmount: ['app_fee', 'app fee', 'fee', 'fees', 'gocardless fee'],
  netAmount: ['net_amount', 'net amount', 'net'],
  donorName: ['customer_name', 'customer name', 'name', 'donor name', 'donor'],
  reference: ['id', 'payment_id', 'payment id', 'reference', 'description'],
  payoutReference: ['payout_id', 'payout id', 'payout_reference', 'payout reference'],
  status: ['status', 'payment_status', 'payment status'],
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
  // Skip non-paid rows (failed, cancelled, refunded, etc.)
  if (cols.status) {
    const status = (raw[cols.status] ?? '').toLowerCase().trim();
    if (status && !ACCEPTED_STATUSES.has(status)) return null;
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
