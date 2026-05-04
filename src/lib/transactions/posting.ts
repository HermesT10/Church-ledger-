import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { invalidateOrgReportCache } from '@/lib/cache';
import { isDateInLockedPeriod } from '@/lib/periods/actions';
import { validateBankLedgerLink } from '@/lib/banking/ledger-link';
import type { ManualTransactionLineRow, ManualTransactionRow } from './types';

interface JournalLineInsert {
  journal_id: string;
  organisation_id: string;
  account_id: string;
  fund_id: string | null;
  income_stream_id?: string | null;
  description: string | null;
  debit_pence: number;
  credit_pence: number;
}

function lineDescription(tx: ManualTransactionRow, line: ManualTransactionLineRow): string {
  return line.description ?? tx.description;
}

async function resolveBankAccountLine(tx: ManualTransactionRow): Promise<{
  accountId: string | null;
  fundId: string | null;
  error: string | null;
}> {
  const supabase = await createClient();
  let bankAccountId = tx.expected_bank_account_id;

  if (!bankAccountId && tx.matched_bank_transaction_id) {
    const { data: bankLine } = await supabase
      .from('bank_lines')
      .select('bank_account_id')
      .eq('id', tx.matched_bank_transaction_id)
      .eq('organisation_id', tx.organisation_id)
      .maybeSingle();
    bankAccountId = (bankLine?.bank_account_id as string | null) ?? null;
  }

  if (!bankAccountId) {
    return { accountId: null, fundId: null, error: 'A bank account is required before posting this transaction.' };
  }

  const validation = await validateBankLedgerLink(bankAccountId, tx.organisation_id);
  if (validation.status !== 'linked' || !validation.linkedAccountId) {
    return {
      accountId: null,
      fundId: null,
      error: validation.code,
    };
  }

  return { accountId: validation.linkedAccountId, fundId: null, error: null };
}

async function buildPostingLines(
  tx: ManualTransactionRow,
  lines: ManualTransactionLineRow[],
): Promise<{ rows: Omit<JournalLineInsert, 'journal_id'>[]; error: string | null }> {
  if (tx.type === 'income' || tx.type === 'expense') {
    const bank = await resolveBankAccountLine(tx);
    if (bank.error || !bank.accountId) return { rows: [], error: bank.error };

    const rows: Omit<JournalLineInsert, 'journal_id'>[] = [];
    if (tx.type === 'income') {
      rows.push({
        organisation_id: tx.organisation_id,
        account_id: bank.accountId,
        fund_id: null,
        description: `Bank receipt: ${tx.description}`,
        debit_pence: tx.amount_pence,
        credit_pence: 0,
      });
      for (const line of lines) {
        rows.push({
          organisation_id: tx.organisation_id,
          account_id: line.account_id,
          fund_id: line.fund_id,
          income_stream_id: line.income_stream_id,
          description: lineDescription(tx, line),
          debit_pence: 0,
          credit_pence: line.amount_pence,
        });
      }
    } else {
      for (const line of lines) {
        rows.push({
          organisation_id: tx.organisation_id,
          account_id: line.account_id,
          fund_id: line.fund_id,
          description: lineDescription(tx, line),
          debit_pence: line.amount_pence,
          credit_pence: 0,
        });
      }
      rows.push({
        organisation_id: tx.organisation_id,
        account_id: bank.accountId,
        fund_id: null,
        description: `Bank payment: ${tx.description}`,
        debit_pence: 0,
        credit_pence: tx.amount_pence,
      });
    }
    return { rows, error: null };
  }

  const rows = lines.map((line) => ({
    organisation_id: tx.organisation_id,
    account_id: line.account_id,
    fund_id: line.fund_id,
    income_stream_id: line.income_stream_id,
    description: lineDescription(tx, line),
    debit_pence: line.direction === 'in' ? line.amount_pence : 0,
    credit_pence: line.direction === 'out' ? line.amount_pence : 0,
  }));

  const debit = rows.reduce((sum, row) => sum + row.debit_pence, 0);
  const credit = rows.reduce((sum, row) => sum + row.credit_pence, 0);
  if (debit !== credit) {
    return { rows: [], error: 'Posting lines are not balanced.' };
  }

  return { rows, error: null };
}

export async function postManualTransactionToLedger(params: {
  transactionId: string;
  orgId: string;
  userId: string;
}): Promise<{ journalId: string | null; error: string | null }> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: tx, error: txErr } = await supabase
    .from('manual_transactions')
    .select('*')
    .eq('id', params.transactionId)
    .eq('organisation_id', params.orgId)
    .maybeSingle();

  if (txErr || !tx) {
    return { journalId: null, error: txErr?.message ?? 'Transaction not found.' };
  }

  const transaction = tx as ManualTransactionRow;
  if (transaction.posted_journal_id) {
    return { journalId: transaction.posted_journal_id, error: 'This transaction has already been posted.' };
  }
  if (transaction.status === 'voided' || transaction.status === 'rejected') {
    return { journalId: null, error: 'Rejected or voided transactions cannot be posted.' };
  }
  if (transaction.requires_bank_match && !transaction.matched_bank_transaction_id) {
    return { journalId: null, error: 'This transaction must be matched to a bank line before posting.' };
  }

  const locked = await isDateInLockedPeriod(transaction.transaction_date);
  if (locked) {
    return { journalId: null, error: 'Cannot post to a locked financial period.' };
  }

  const { data: lineRows, error: lineErr } = await supabase
    .from('manual_transaction_lines')
    .select('*')
    .eq('manual_transaction_id', transaction.id)
    .eq('organisation_id', params.orgId)
    .order('line_order');

  if (lineErr) return { journalId: null, error: lineErr.message };
  const lines = (lineRows ?? []) as ManualTransactionLineRow[];
  if (lines.length === 0) return { journalId: null, error: 'Transaction has no lines.' };

  const built = await buildPostingLines(transaction, lines);
  if (built.error) return { journalId: null, error: built.error };

  const debit = built.rows.reduce((sum, row) => sum + row.debit_pence, 0);
  const credit = built.rows.reduce((sum, row) => sum + row.credit_pence, 0);
  if (debit !== credit || debit === 0) {
    return { journalId: null, error: 'Posting journal is not balanced.' };
  }

  const { data: journal, error: journalErr } = await admin
    .from('journals')
    .insert({
      organisation_id: params.orgId,
      journal_date: transaction.transaction_date,
      reference: transaction.reference,
      memo: `Transaction: ${transaction.description}`,
      status: 'draft',
      source_type: 'manual_transaction',
      source_id: transaction.id,
      created_by: params.userId,
    })
    .select('id')
    .single();

  if (journalErr || !journal) {
    return { journalId: null, error: journalErr?.message ?? 'Failed to create posting journal.' };
  }

  const rows = built.rows.map((row) => ({
    ...row,
    journal_id: journal.id,
  }));

  const { error: linesErr } = await admin.from('journal_lines').insert(rows);
  if (linesErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    return { journalId: null, error: linesErr.message };
  }

  const { error: postErr } = await admin
    .from('journals')
    .update({
      status: 'posted',
      approved_by: params.userId,
      approved_at: now,
      posted_at: now,
    })
    .eq('id', journal.id)
    .eq('organisation_id', params.orgId);

  if (postErr) {
    await admin.from('journal_lines').delete().eq('journal_id', journal.id);
    await admin.from('journals').delete().eq('id', journal.id);
    return { journalId: null, error: postErr.message };
  }

  const { error: updateErr } = await admin
    .from('manual_transactions')
    .update({
      status: 'posted',
      posted_journal_id: journal.id,
      posted_at: now,
      reconciled_at: transaction.reconciled_at ?? now,
    })
    .eq('id', transaction.id)
    .eq('organisation_id', params.orgId)
    .is('posted_journal_id', null);

  if (updateErr) {
    return { journalId: null, error: updateErr.message };
  }

  if (transaction.matched_bank_transaction_id) {
    await admin
      .from('bank_lines')
      .update({ reconciled: true, reconciled_at: now, status: 'reconciled', posted_journal_id: journal.id })
      .eq('id', transaction.matched_bank_transaction_id)
      .eq('organisation_id', params.orgId);
  }

  invalidateOrgReportCache(params.orgId);
  return { journalId: journal.id, error: null };
}
