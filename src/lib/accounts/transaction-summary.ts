import type { AccountActivityRow } from '@/lib/accounts/balances';
import type { AccountType } from '@/lib/accounts/types';

export type AccountTransactionSummaryBadge = 'reversal' | 'reversed_original' | 'warning';

export type AccountTransactionSummaryRow = {
  journal_id: string;
  journal_date: string;
  reference: string | null;
  memo: string | null;
  source_type: string | null;
  kind_label: string;
  badges: AccountTransactionSummaryBadge[];
  warnings: string[];
  debit_pence: number;
  credit_pence: number;
  net_pence: number;
  fund_labels: string[];
  line_count: number;
};

function titleCaseSourceType(raw: string): string {
  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** User-facing label from journal `source_type` and reversal metadata. */
export function journalKindLabel(row: Pick<AccountActivityRow, 'source_type' | 'reversal_of'>): string {
  if (row.reversal_of) return 'Reversal';

  const st = row.source_type?.trim() || '';
  switch (st) {
    case 'donation':
      return 'Donation';
    case 'bank':
      return 'Bank reconciliation';
    case 'manual':
    case 'manual_transaction':
      return 'Manual';
    case 'lettings_payment':
      return 'Letting payment';
    case 'lettings_charge':
      return 'Letting charge';
    case 'gift_aid_claim_payment':
      return 'Gift Aid claim payment';
    case 'payroll':
    case 'payroll_run':
      return 'Payroll';
    case 'invoice':
    case 'bill':
      return titleCaseSourceType(st);
    case '':
      return 'Journal';
    default:
      return titleCaseSourceType(st);
  }
}

function collectWarnings(
  accountType: AccountType,
  lines: AccountActivityRow[],
  debitTotal: number,
  creditTotal: number,
): string[] {
  const warnings: string[] = [];

  const needsFund =
    accountType === 'income' || accountType === 'expense' || accountType === 'fund_balance' || accountType === 'equity';
  if (needsFund && lines.some((l) => l.fund_id == null)) {
    warnings.push('One or more lines have no fund tag.');
  }

  if (accountType === 'income' && debitTotal > 0 && creditTotal === 0) {
    warnings.push('Income account with debit only — check for adjustments or reversals.');
  }
  if (accountType === 'expense' && creditTotal > 0 && debitTotal === 0) {
    warnings.push('Expense account with credit only — check for adjustments or reversals.');
  }

  return warnings;
}

/**
 * Groups posted activity lines by `journal_id` into one row per business transaction.
 * Preserves approximate ordering: first encounter order when iterating input (newest-first from `getAccountActivity`).
 */
export function buildAccountTransactionSummaryRows(
  activity: AccountActivityRow[],
  accountType: AccountType,
): AccountTransactionSummaryRow[] {
  const order: string[] = [];
  const byJournal = new Map<string, AccountActivityRow[]>();

  for (const line of activity) {
    const jid = line.journal_id;
    if (!byJournal.has(jid)) {
      order.push(jid);
      byJournal.set(jid, []);
    }
    byJournal.get(jid)!.push(line);
  }

  const rows: AccountTransactionSummaryRow[] = [];

  for (const journalId of order) {
    const lines = byJournal.get(journalId)!;
    const head = lines[0];

    let debitTotal = 0;
    let creditTotal = 0;
    const funds = new Set<string>();

    for (const l of lines) {
      debitTotal += l.debit_pence;
      creditTotal += l.credit_pence;
      if (l.fund_name) funds.add(l.fund_name);
    }

    const net = debitTotal - creditTotal;
    const kindLabel = journalKindLabel(head);
    const badges: AccountTransactionSummaryBadge[] = [];
    if (head.reversal_of) badges.push('reversal');
    if (head.reversed_by) badges.push('reversed_original');

    const warnings = collectWarnings(accountType, lines, debitTotal, creditTotal);
    if (warnings.length) badges.push('warning');

    rows.push({
      journal_id: journalId,
      journal_date: head.journal_date,
      reference: head.reference,
      memo: head.memo,
      source_type: head.source_type,
      kind_label: kindLabel,
      badges,
      warnings,
      debit_pence: debitTotal,
      credit_pence: creditTotal,
      net_pence: net,
      fund_labels: [...funds].sort((a, b) => a.localeCompare(b)),
      line_count: lines.length,
    });
  }

  return rows;
}
