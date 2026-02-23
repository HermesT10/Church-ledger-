/* ------------------------------------------------------------------ */
/*  Giving Import – Journal Builder (pure functions)                   */
/* ------------------------------------------------------------------ */

import type { NormalizedRow, GivingProvider } from './types';
import { PROVIDER_LABELS } from '../giving-platforms/types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface JournalLineOutput {
  account_id: string;
  fund_id: string | null;
  description: string;
  debit_pence: number;
  credit_pence: number;
}

export interface DayGroup {
  txn_date: string;
  rows: NormalizedRow[];
  total_gross_pence: number;
  total_fee_pence: number;
  total_net_pence: number;
}

export interface JournalSpec {
  journal_date: string;
  memo: string;
  lines: JournalLineOutput[];
}

/* ------------------------------------------------------------------ */
/*  groupRowsByDate                                                    */
/* ------------------------------------------------------------------ */

/**
 * Groups normalized rows by txn_date. Sorted ascending by date.
 */
export function groupRowsByDate(rows: NormalizedRow[]): DayGroup[] {
  const map = new Map<string, NormalizedRow[]>();

  for (const row of rows) {
    const existing = map.get(row.txn_date);
    if (existing) {
      existing.push(row);
    } else {
      map.set(row.txn_date, [row]);
    }
  }

  const groups: DayGroup[] = [];
  for (const [txn_date, groupRows] of map) {
    const total_gross_pence = groupRows.reduce((s, r) => s + r.gross_amount_pence, 0);
    const total_fee_pence = groupRows.reduce((s, r) => s + r.fee_amount_pence, 0);
    const total_net_pence = groupRows.reduce((s, r) => s + r.net_amount_pence, 0);

    groups.push({
      txn_date,
      rows: groupRows,
      total_gross_pence,
      total_fee_pence,
      total_net_pence,
    });
  }

  // Sort by date ascending
  groups.sort((a, b) => a.txn_date.localeCompare(b.txn_date));

  return groups;
}

/* ------------------------------------------------------------------ */
/*  buildDonationJournalLines                                          */
/* ------------------------------------------------------------------ */

/**
 * Builds balanced journal lines for a single day group of donation rows.
 *
 * Accounting entries per group (provider + single day):
 *   Dr Clearing Account  (gross_amount)
 *   Cr Donations Income   (gross_amount)
 *   Dr Platform Fees      (fee_amount)      — if fee > 0
 *   Cr Clearing Account   (fee_amount)      — if fee > 0
 *
 * Net effect on clearing: gross - fee = net (awaiting payout)
 * Net effect on income:   gross credited
 * Net effect on fees:     fee debited as expense
 */
export function buildDonationJournalLines(params: {
  group: DayGroup;
  clearingAccountId: string;
  feeAccountId: string;
  incomeAccountId: string;
  defaultFundId: string | null;
}): JournalLineOutput[] {
  const { group, clearingAccountId, feeAccountId, incomeAccountId, defaultFundId } =
    params;

  const lines: JournalLineOutput[] = [];

  // Dr Clearing (gross)
  lines.push({
    account_id: clearingAccountId,
    fund_id: null,
    description: `Donations received – gross`,
    debit_pence: group.total_gross_pence,
    credit_pence: 0,
  });

  // Cr Donations Income (gross)
  lines.push({
    account_id: incomeAccountId,
    fund_id: defaultFundId,
    description: `Donations income`,
    debit_pence: 0,
    credit_pence: group.total_gross_pence,
  });

  // If there are fees, record them
  if (group.total_fee_pence > 0) {
    // Dr Platform Fees (expense)
    lines.push({
      account_id: feeAccountId,
      fund_id: null,
      description: `Platform fees`,
      debit_pence: group.total_fee_pence,
      credit_pence: 0,
    });

    // Cr Clearing (fee reduces the clearing balance)
    lines.push({
      account_id: clearingAccountId,
      fund_id: null,
      description: `Platform fees – clearing offset`,
      debit_pence: 0,
      credit_pence: group.total_fee_pence,
    });
  }

  return lines;
}

/* ------------------------------------------------------------------ */
/*  buildJournalSpecs                                                  */
/* ------------------------------------------------------------------ */

/**
 * Builds one JournalSpec per day for the given provider import.
 */
export function buildJournalSpecs(params: {
  groups: DayGroup[];
  provider: GivingProvider;
  importId: string;
  clearingAccountId: string;
  feeAccountId: string;
  incomeAccountId: string;
  defaultFundId: string | null;
}): JournalSpec[] {
  const {
    groups,
    provider,
    importId,
    clearingAccountId,
    feeAccountId,
    incomeAccountId,
    defaultFundId,
  } = params;

  const providerLabel = PROVIDER_LABELS[provider] ?? provider;

  return groups.map((group) => ({
    journal_date: group.txn_date,
    memo: `${providerLabel} donations – ${group.txn_date} (Import ${importId.slice(0, 8)})`,
    lines: buildDonationJournalLines({
      group,
      clearingAccountId,
      feeAccountId,
      incomeAccountId,
      defaultFundId,
    }),
  }));
}

/* ------------------------------------------------------------------ */
/*  buildPayoutJournalLines                                            */
/* ------------------------------------------------------------------ */

/**
 * Builds balanced journal lines for a payout from the platform to the bank.
 *
 * Accounting entries:
 *   Dr Bank Account     (payoutAmountPence)   -- cash arrives
 *   Cr Clearing Account (payoutAmountPence)   -- clear the clearing balance
 *
 * After all donation + payout journals: Clearing balance = 0
 */
export function buildPayoutJournalLines(params: {
  payoutAmountPence: number;
  bankAccountId: string;
  clearingAccountId: string;
}): JournalLineOutput[] {
  const { payoutAmountPence, bankAccountId, clearingAccountId } = params;

  return [
    {
      account_id: bankAccountId,
      fund_id: null,
      description: 'Payout received from platform',
      debit_pence: payoutAmountPence,
      credit_pence: 0,
    },
    {
      account_id: clearingAccountId,
      fund_id: null,
      description: 'Payout – clearing offset',
      debit_pence: 0,
      credit_pence: payoutAmountPence,
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  groupPayoutRows                                                    */
/* ------------------------------------------------------------------ */

export interface PayoutGroup {
  payout_reference: string;
  total_net_pence: number;
  rows: NormalizedRow[];
}

/**
 * Groups rows that have a payout_reference by that reference.
 * Returns only groups where payout_reference is non-empty.
 */
export function groupPayoutRows(rows: NormalizedRow[]): PayoutGroup[] {
  const map = new Map<string, NormalizedRow[]>();

  for (const row of rows) {
    if (!row.payout_reference) continue;
    const existing = map.get(row.payout_reference);
    if (existing) {
      existing.push(row);
    } else {
      map.set(row.payout_reference, [row]);
    }
  }

  const groups: PayoutGroup[] = [];
  for (const [payout_reference, groupRows] of map) {
    const total_net_pence = groupRows.reduce((s, r) => s + r.net_amount_pence, 0);
    groups.push({ payout_reference, total_net_pence, rows: groupRows });
  }

  return groups;
}

/* ------------------------------------------------------------------ */
/*  buildPayoutJournalSpecs                                            */
/* ------------------------------------------------------------------ */

/**
 * Builds one JournalSpec per payout reference for payout journals.
 */
export function buildPayoutJournalSpecs(params: {
  payoutGroups: PayoutGroup[];
  provider: GivingProvider;
  importId: string;
  clearingAccountId: string;
  bankAccountId: string;
}): JournalSpec[] {
  const { payoutGroups, provider, importId, clearingAccountId, bankAccountId } = params;
  const providerLabel = PROVIDER_LABELS[provider] ?? provider;

  return payoutGroups
    .filter((g) => g.total_net_pence > 0)
    .map((group) => ({
      journal_date: group.rows[0].txn_date, // use first row's date
      memo: `${providerLabel} payout ${group.payout_reference} (Import ${importId.slice(0, 8)})`,
      lines: buildPayoutJournalLines({
        payoutAmountPence: group.total_net_pence,
        bankAccountId,
        clearingAccountId,
      }),
    }));
}

/* ------------------------------------------------------------------ */
/*  Validation: check journals are balanced                            */
/* ------------------------------------------------------------------ */

export function isJournalBalanced(lines: JournalLineOutput[]): boolean {
  const totalDebit = lines.reduce((s, l) => s + l.debit_pence, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit_pence, 0);
  return totalDebit === totalCredit && lines.length >= 2;
}
