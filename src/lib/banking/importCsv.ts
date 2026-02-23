'use server';

import Papa from 'papaparse';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { parseMoneyToPence, makeFingerprint, parseBankDate } from '@/lib/banking/importUtils';
import { assertWriteAllowed } from '@/lib/demo';
import type { ColumnMapping, ImportResult } from './types';

/* ------------------------------------------------------------------ */
/*  importBankCsv                                                      */
/* ------------------------------------------------------------------ */

export async function importBankCsv(formData: FormData): Promise<ImportResult> {
  await assertWriteAllowed();

  // 1. Auth & role check
  const { user, role } = await getActiveOrg();

  try { assertCanPerform(role, 'create', 'banking'); }
  catch (e) {
    return {
      total_rows: 0,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: 1,
      sample_errors: [e instanceof PermissionError ? e.message : 'Permission denied.'],
    };
  }

  const orgId = formData.get('orgId') as string;
  const bankAccountId = formData.get('bankAccountId') as string;
  const file = formData.get('file') as File | null;
  const mappingJson = formData.get('mapping') as string;

  if (!orgId || !bankAccountId || !file || !mappingJson) {
    return {
      total_rows: 0,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: 1,
      sample_errors: ['Missing required fields (orgId, bankAccountId, file, or mapping).'],
    };
  }

  let mapping: ColumnMapping;
  try {
    mapping = JSON.parse(mappingJson);
  } catch {
    return {
      total_rows: 0,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: 1,
      sample_errors: ['Invalid column mapping JSON.'],
    };
  }

  if (!mapping.date || !mapping.description || !mapping.amount) {
    return {
      total_rows: 0,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: 1,
      sample_errors: ['Date, Description, and Amount column mappings are required.'],
    };
  }

  // 2. Read and parse CSV
  const csvText = await file.text();
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const rows = parsed.data;
  const totalRows = rows.length;
  const errors: string[] = [];

  // Surface PapaParse-level errors (malformed quoting, etc.)
  if (parsed.errors.length > 0) {
    const papaErrors = parsed.errors.slice(0, 5);
    for (const pe of papaErrors) {
      const rowInfo = pe.row != null ? ` (row ${pe.row + 2})` : '';
      errors.push(`CSV parse: ${pe.message}${rowInfo}`);
    }
    if (parsed.errors.length > 5) {
      errors.push(`…and ${parsed.errors.length - 5} more CSV parse warnings.`);
    }
  }

  if (totalRows === 0) {
    return {
      total_rows: 0,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: errors.length,
      sample_errors: errors.slice(0, 10),
    };
  }

  // 3. Convert rows
  const validRows: {
    organisation_id: string;
    bank_account_id: string;
    txn_date: string;
    description: string | null;
    reference: string | null;
    amount_pence: number;
    balance_pence: number | null;
    fingerprint: string;
    raw: Record<string, string>;
    created_by: string;
  }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 because row 1 is header, data starts at 2

    try {
      const dateRaw = row[mapping.date]?.trim();
      const descriptionRaw = row[mapping.description]?.trim() || null;
      const amountRaw = row[mapping.amount]?.trim();
      const referenceRaw = mapping.reference ? row[mapping.reference]?.trim() || null : null;
      const balanceRaw = mapping.balance ? row[mapping.balance]?.trim() || null : null;

      if (!dateRaw) {
        errors.push(`Row ${rowNum}: Missing date value.`);
        continue;
      }

      if (!amountRaw) {
        errors.push(`Row ${rowNum}: Missing amount value.`);
        continue;
      }

      // Parse date using the robust parser
      const txnDate = parseBankDate(dateRaw);
      if (!txnDate) {
        errors.push(`Row ${rowNum}: Cannot parse date "${dateRaw}".`);
        continue;
      }

      const amountPence = parseMoneyToPence(amountRaw);
      const balancePence = balanceRaw ? parseMoneyToPence(balanceRaw) : null;

      const fingerprint = makeFingerprint({
        txn_date: txnDate,
        amount_pence: amountPence,
        reference: referenceRaw ?? '',
        description: descriptionRaw ?? '',
      });

      validRows.push({
        organisation_id: orgId,
        bank_account_id: bankAccountId,
        txn_date: txnDate,
        description: descriptionRaw,
        reference: referenceRaw,
        amount_pence: Number(amountPence),
        balance_pence: balancePence !== null ? Number(balancePence) : null,
        fingerprint,
        raw: row,
        created_by: user.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Row ${rowNum}: ${msg}`);
    }
  }

  if (validRows.length === 0) {
    return {
      total_rows: totalRows,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: errors.length,
      sample_errors: errors.slice(0, 10),
    };
  }

  // 4. Bulk upsert — ignore duplicates on (bank_account_id, fingerprint)
  const supabase = await createClient();
  const BATCH_SIZE = 500;
  let insertedCount = 0;

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from('bank_lines')
      .upsert(batch, {
        onConflict: 'bank_account_id,fingerprint',
        ignoreDuplicates: true,
      })
      .select('id');

    if (error) {
      errors.push(`Batch insert error: ${error.message}`);
    } else {
      insertedCount += data?.length ?? 0;
    }
  }

  const skippedDuplicates = validRows.length - insertedCount;

  return {
    total_rows: totalRows,
    inserted_count: insertedCount,
    skipped_duplicates: skippedDuplicates,
    errors_count: errors.length,
    sample_errors: errors.slice(0, 10),
  };
}

/* ------------------------------------------------------------------ */
/*  listRecentBankLines                                                */
/* ------------------------------------------------------------------ */

export async function listRecentBankLines(
  orgId: string,
  bankAccountId: string
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('bank_lines')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('bank_account_id', bankAccountId)
    .order('txn_date', { ascending: false })
    .limit(20);

  return { data: data ?? [], error: error?.message ?? null };
}
