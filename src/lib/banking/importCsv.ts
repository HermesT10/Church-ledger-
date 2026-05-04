'use server';

import { createHash } from 'node:crypto';
import Papa from 'papaparse';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { parseMoneyToPence, makeFingerprint, parseBankDate } from '@/lib/banking/importUtils';
import { runDonationCandidateIngestion } from '@/lib/donations/candidate-ingestion';
import { runGiftAidDonorMatching } from '@/lib/giftaid/matching';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import { FINANCIAL_EVIDENCE_BUCKET } from '@/lib/evidence/config';
import type { ColumnMapping, ImportResult } from './types';

function slugifyFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function moneyPenceToPounds(pence: number | bigint): number {
  return Number(pence) / 100;
}

/* ------------------------------------------------------------------ */
/*  importBankCsv                                                      */
/* ------------------------------------------------------------------ */

export async function importBankCsv(formData: FormData): Promise<ImportResult> {
  await assertWriteAllowed();

  // 1. Auth & role check
  const { user, role, orgId } = await getActiveOrg();

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

  const submittedOrgId = formData.get('orgId') as string | null;
  const bankAccountId = formData.get('bankAccountId') as string;
  const file = formData.get('file') as File | null;
  const mappingJson = formData.get('mapping') as string;

  if (submittedOrgId && submittedOrgId !== orgId) {
    return {
      total_rows: 0,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: 1,
      sample_errors: ['The selected workspace does not match your active workspace.'],
    };
  }

  if (!bankAccountId || !file || !mappingJson) {
    return {
      total_rows: 0,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: 1,
      sample_errors: ['Missing required fields (bankAccountId, file, or mapping).'],
    };
  }

  const supabase = await createClient();

  const { data: bankAccount, error: bankAccountError } = await supabase
    .from('bank_accounts')
    .select('id, name, status, is_active')
    .eq('id', bankAccountId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (bankAccountError || !bankAccount) {
    return {
      total_rows: 0,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: 1,
      sample_errors: [bankAccountError?.message ?? 'Bank account not found.'],
    };
  }

  if (bankAccount.status === 'archived' || bankAccount.is_active === false) {
    return {
      total_rows: 0,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: 1,
      sample_errors: ['Cannot import into an archived bank account.'],
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

  // 2. Persist source file and create statement-import metadata.
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash('sha256').update(fileBuffer).digest('hex');
  const fileType = file.type || 'text/csv';
  const safeName = slugifyFileName(file.name) || 'bank-statement.csv';

  const { data: existingImport } = await supabase
    .from('bank_statement_imports')
    .select('id, status, uploaded_at')
    .eq('workspace_id', orgId)
    .eq('bank_account_id', bankAccountId)
    .eq('file_hash', fileHash)
    .maybeSingle();

  if (existingImport) {
    return {
      total_rows: 0,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: 1,
      sample_errors: [
        `This statement file was already uploaded (${existingImport.status}, ${existingImport.uploaded_at}).`,
      ],
      statement_import_id: existingImport.id,
    };
  }

  const filePath = `${orgId}/bank-imports/${Date.now()}-${fileHash.slice(0, 12)}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(FINANCIAL_EVIDENCE_BUCKET)
    .upload(filePath, fileBuffer, {
      contentType: fileType,
      upsert: false,
    });

  if (uploadError) {
    return {
      total_rows: 0,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: 1,
      sample_errors: [uploadError.message],
    };
  }

  const { data: statementImport, error: statementImportError } = await supabase
    .from('bank_statement_imports')
    .insert({
      workspace_id: orgId,
      bank_account_id: bankAccountId,
      file_name: file.name,
      file_path: filePath,
      file_type: fileType,
      file_hash: fileHash,
      status: 'parsing',
      uploaded_by: user.id,
    })
    .select('id')
    .single();

  if (statementImportError || !statementImport) {
    return {
      total_rows: 0,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: 1,
      sample_errors: [statementImportError?.message ?? 'Could not create statement import record.'],
      file_path: filePath,
    };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'bank_statement_upload',
    entityType: 'bank_statement_import',
    entityId: statementImport.id,
    metadata: {
      bankAccountId,
      fileName: file.name,
      fileHash,
      filePath,
    },
  });

  // 3. Read and parse CSV
  const csvText = fileBuffer.toString('utf8');
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
    await supabase
      .from('bank_statement_imports')
      .update({
        status: 'failed',
        rows_detected: 0,
        rows_imported: 0,
        duplicates_skipped: 0,
        errors_count: errors.length,
        parse_errors: errors.length > 0 ? errors.slice(0, 50) : ['No rows found in CSV.'],
      })
      .eq('id', statementImport.id)
      .eq('workspace_id', orgId);

    return {
      total_rows: 0,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: errors.length,
      sample_errors: errors.slice(0, 10),
      statement_import_id: statementImport.id,
      file_path: filePath,
    };
  }

  // 4. Convert rows
  const validRows: {
    workspace_id: string;
    organisation_id: string;
    bank_account_id: string;
    statement_import_id: string;
    txn_date: string;
    transaction_date: string;
    description: string | null;
    reference: string | null;
    amount: number;
    amount_pence: number;
    direction: 'in' | 'out';
    money_in: number | null;
    money_out: number | null;
    running_balance: number | null;
    balance_pence: number | null;
    fingerprint: string;
    raw: Record<string, string>;
    status: 'unmatched';
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
      const amountPenceNumber = Number(amountPence);
      const direction = amountPenceNumber >= 0 ? 'in' : 'out';

      const fingerprint = makeFingerprint({
        txn_date: txnDate,
        amount_pence: amountPence,
        reference: referenceRaw ?? '',
        description: descriptionRaw ?? '',
      });

      validRows.push({
        workspace_id: orgId,
        organisation_id: orgId,
        bank_account_id: bankAccountId,
        statement_import_id: statementImport.id,
        txn_date: txnDate,
        transaction_date: txnDate,
        description: descriptionRaw,
        reference: referenceRaw,
        amount: moneyPenceToPounds(amountPenceNumber),
        amount_pence: amountPenceNumber,
        direction,
        money_in: direction === 'in' ? moneyPenceToPounds(amountPenceNumber) : null,
        money_out: direction === 'out' ? moneyPenceToPounds(Math.abs(amountPenceNumber)) : null,
        running_balance: balancePence !== null ? moneyPenceToPounds(balancePence) : null,
        balance_pence: balancePence !== null ? Number(balancePence) : null,
        fingerprint,
        raw: row,
        status: 'unmatched',
        created_by: user.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Row ${rowNum}: ${msg}`);
    }
  }

  if (validRows.length === 0) {
    await supabase
      .from('bank_statement_imports')
      .update({
        status: 'failed',
        rows_detected: totalRows,
        rows_imported: 0,
        duplicates_skipped: 0,
        errors_count: errors.length,
        parse_errors: errors.slice(0, 50),
      })
      .eq('id', statementImport.id)
      .eq('workspace_id', orgId);

    return {
      total_rows: totalRows,
      inserted_count: 0,
      skipped_duplicates: 0,
      errors_count: errors.length,
      sample_errors: errors.slice(0, 10),
      statement_import_id: statementImport.id,
      file_path: filePath,
    };
  }

  // 5. Bulk upsert — ignore duplicates on (bank_account_id, fingerprint)
  const BATCH_SIZE = 500;
  let insertedCount = 0;
  const insertedBankTransactionIds: string[] = [];

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
      insertedBankTransactionIds.push(...(data ?? []).map((row) => row.id));
    }
  }

  const skippedDuplicates = validRows.length - insertedCount;
  const validDates = validRows.map((row) => row.txn_date).sort();
  const balances = validRows
    .map((row) => row.running_balance)
    .filter((value): value is number => value != null);
  const importStatus =
    errors.length > 0
      ? insertedCount > 0
        ? 'partially_imported'
        : 'failed'
      : 'imported';

  await supabase
    .from('bank_statement_imports')
    .update({
      status: importStatus,
      statement_start_date: validDates[0] ?? null,
      statement_end_date: validDates[validDates.length - 1] ?? null,
      opening_balance: balances[0] ?? null,
      closing_balance: balances[balances.length - 1] ?? null,
      rows_detected: totalRows,
      rows_imported: insertedCount,
      duplicates_skipped: skippedDuplicates,
      errors_count: errors.length,
      parse_errors: errors.length > 0 ? errors.slice(0, 50) : null,
      imported_at: insertedCount > 0 ? new Date().toISOString() : null,
    })
    .eq('id', statementImport.id)
    .eq('workspace_id', orgId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'bank_statement_import',
    entityType: 'bank_statement_import',
    entityId: statementImport.id,
    metadata: {
      bankAccountId,
      rowsDetected: totalRows,
      rowsImported: insertedCount,
      duplicatesSkipped: skippedDuplicates,
      errorsCount: errors.length,
    },
  });

  let candidateResult = {
    scanned: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as string[],
  };

  if (insertedBankTransactionIds.length > 0) {
    try {
      candidateResult = await runDonationCandidateIngestion({
        bankAccountId,
        bankTransactionIds: insertedBankTransactionIds,
      });

      for (const error of candidateResult.errors) {
        errors.push(`Donation candidate ingestion: ${error}`);
      }
    } catch (error) {
      errors.push(
        `Donation candidate ingestion: ${
          error instanceof Error ? error.message : 'Unknown ingestion failure.'
        }`
      );
    }
  }

  if (insertedBankTransactionIds.length > 0) {
    try {
      const matchResult = await runGiftAidDonorMatching({
        bankTransactionIds: insertedBankTransactionIds,
      });

      for (const error of matchResult.errors) {
        errors.push(`Donor matching: ${error}`);
      }
    } catch (error) {
      errors.push(
        `Donor matching: ${
          error instanceof Error ? error.message : 'Unknown donor matching failure.'
        }`
      );
    }
  }

  return {
    total_rows: totalRows,
    inserted_count: insertedCount,
    skipped_duplicates: skippedDuplicates,
    errors_count: errors.length,
    sample_errors: errors.slice(0, 10),
    statement_import_id: statementImport.id,
    file_path: filePath,
    donation_candidates_scanned: candidateResult.scanned,
    donation_candidates_created: candidateResult.created,
    donation_candidates_updated: candidateResult.updated,
    donation_candidates_skipped: candidateResult.skipped,
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
