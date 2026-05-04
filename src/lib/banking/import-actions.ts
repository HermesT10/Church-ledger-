'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import { FINANCIAL_EVIDENCE_BUCKET } from '@/lib/evidence/config';
import { invalidateOrgReportCache } from '@/lib/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { listCorrectionEventsForStatementImport, insertBankStatementImportRemovalEvent } from '@/lib/banking/correction-events';
import { unreconcileBankTransaction } from '@/lib/banking/unreconcile-bank-transaction';
import type {
  BankStatementImportRow,
  StatementPreviewSummary,
  StatementPreviewResult,
  ImportParsedStatementResult,
  DeleteBankStatementReason,
  DeleteBankStatementImportResult,
  BankStatementImportDetail,
  RemoveBankStatementImportWithOptionsResult,
} from './import-actions.types';
import {
  detectBankColumns,
  normaliseStatementRows,
  parseCsvStatement,
  parseUnsupportedStatement,
  parseXlsxStatement,
  type BankStatementColumnMeta,
  type BankStatementColumnMapping,
  type BankStatementFileType,
  type NormalisedBankTransactionRow,
} from './statement-parser';
import { createBankCategorisationSuggestionsForImport } from './categorisation-suggestions';

type StatementContinuityWarning = {
  type: 'date_gap' | 'date_overlap' | 'balance_mismatch';
  severity: 'warning';
  message: string;
  previous_statement_import_id?: string | null;
  previous_statement_end_date?: string | null;
  current_statement_start_date?: string | null;
  previous_closing_balance?: number | null;
  current_opening_balance?: number | null;
};

const GIFT_AID_STATEMENT_REMOVAL_GUARD_STATUSES = [
  'submitted',
  'paid',
  'included_in_claim',
  'included_in_draft_claim',
  'exported',
  'already_claimed',
] as const;

type BankLineForImportRemoval = {
  id: string;
  txn_date: string | null;
  status: string | null;
  allocated: boolean | null;
  reconciled: boolean | null;
  posted_journal_id: string | null;
  matched_source_type: string | null;
  matched_source_id: string | null;
};

function isTreasurerOrAdminRole(role: string): boolean {
  return role === 'admin' || role === 'treasurer';
}

function lineBlocksImportDeletion(line: BankLineForImportRemoval, confirmedIds: Set<string>): boolean {
  if (confirmedIds.has(line.id)) return true;
  return Boolean(
    line.allocated ||
      line.reconciled ||
      line.posted_journal_id ||
      line.matched_source_type ||
      line.matched_source_id ||
      ['matched', 'reconciled', 'excluded'].includes(String(line.status ?? '')),
  );
}

function isMatchOnlyStray(line: BankLineForImportRemoval, confirmedIds: Set<string>): boolean {
  if (!confirmedIds.has(line.id)) return false;
  return (
    !line.allocated &&
    !line.reconciled &&
    !line.posted_journal_id &&
    !line.matched_source_type &&
    !line.matched_source_id &&
    !['matched', 'reconciled', 'excluded'].includes(String(line.status ?? ''))
  );
}

async function loadConfirmedMatchIdsForBankLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  bankLineIds: string[],
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (bankLineIds.length === 0) return ids;
  const [{ data: brm }, { data: tm }] = await Promise.all([
    supabase
      .from('bank_reconciliation_matches')
      .select('bank_transaction_id')
      .eq('workspace_id', orgId)
      .eq('status', 'confirmed')
      .in('bank_transaction_id', bankLineIds),
    supabase
      .from('transaction_matches')
      .select('bank_line_id')
      .eq('organisation_id', orgId)
      .eq('match_status', 'confirmed')
      .in('bank_line_id', bankLineIds),
  ]);
  for (const row of brm ?? []) {
    const id = row.bank_transaction_id as string | undefined;
    if (id) ids.add(id);
  }
  for (const row of tm ?? []) {
    const id = row.bank_line_id as string | undefined;
    if (id) ids.add(id);
  }
  return ids;
}

async function rejectConfirmedMatchesForBankLine(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  bankTransactionId: string,
): Promise<void> {
  await admin
    .from('bank_reconciliation_matches')
    .update({ status: 'rejected' })
    .eq('workspace_id', orgId)
    .eq('bank_transaction_id', bankTransactionId)
    .eq('status', 'confirmed');

  await admin
    .from('transaction_matches')
    .update({ match_status: 'rejected' })
    .eq('organisation_id', orgId)
    .eq('bank_line_id', bankTransactionId)
    .eq('match_status', 'confirmed');
}

function emptyPreview(error: string): StatementPreviewResult {
  return {
    ok: false,
    error,
    statement_import_id: null,
    headers: [],
    columns: [],
    amountMode: 'signed',
    hasHeaders: false,
    saved_template_applied: false,
    saved_template_name: null,
    mapping: {},
    confidence: 'low',
    detection_reasons: [],
    summary: {
      rows_detected: 0,
      valid_rows: 0,
      invalid_rows: 0,
      duplicate_rows: 0,
      date_start: null,
      date_end: null,
      opening_balance: null,
      closing_balance: null,
    },
    preview_rows: [],
    invalid_rows: [],
  };
}

function emptyImportResult(error: string, statementImportId: string | null = null): ImportParsedStatementResult {
  return {
    ok: false,
    error,
    statement_import_id: statementImportId,
    total_rows: 0,
    inserted_count: 0,
    skipped_duplicates: 0,
    errors_count: 1,
    sample_errors: [error],
  };
}

function slugifyFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function detectFileType(fileName: string, mimeType: string): BankStatementFileType | 'ofx' | 'qif' | 'pdf' | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv') || mimeType.includes('csv') || mimeType === 'text/plain') return 'csv';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || mimeType.includes('spreadsheet')) return 'xlsx';
  if (lower.endsWith('.ofx')) return 'ofx';
  if (lower.endsWith('.qif')) return 'qif';
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') return 'pdf';
  return null;
}

function validatePermission(role: string): string | null {
  try {
    assertCanPerform(role, 'create', 'banking');
    return null;
  } catch (error) {
    return error instanceof PermissionError ? error.message : 'Permission denied.';
  }
}

async function getActiveBankAccount(bankAccountId: string, orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id, name, organisation_id, workspace_id, status, is_active, bank_name')
    .eq('id', bankAccountId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (error) return { bankAccount: null, error: error.message };
  if (!data) return { bankAccount: null, error: 'Bank account not found.' };
  if (data.status === 'archived' || data.is_active === false) {
    return { bankAccount: null, error: 'Cannot import into an archived bank account.' };
  }

  return { bankAccount: data, error: null };
}

async function loadStatementImport(statementImportId: string, orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bank_statement_imports')
    .select('*')
    .eq('id', statementImportId)
    .eq('workspace_id', orgId)
    .maybeSingle();

  if (error) return { statementImport: null, error: error.message };
  if (!data) return { statementImport: null, error: 'Statement import not found.' };
  return { statementImport: data as BankStatementImportRow, error: null };
}

async function parseStoredStatement(statementImport: BankStatementImportRow) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(FINANCIAL_EVIDENCE_BUCKET)
    .download(statementImport.file_path);

  if (error || !data) {
    return {
      parsed: null,
      error: error?.message ?? 'Could not download uploaded statement file.',
    };
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  if (statementImport.file_type === 'csv') return { parsed: parseCsvStatement(buffer.toString('utf8')), error: null };
  if (statementImport.file_type === 'xlsx') return { parsed: await parseXlsxStatement(buffer), error: null };
  return {
    parsed: parseUnsupportedStatement(statementImport.file_type),
    error: null,
  };
}

function summariseRows(rows: NormalisedBankTransactionRow[], duplicateFingerprints = new Set<string>()): StatementPreviewSummary {
  const validRows = rows.filter((row) => row.validation_errors.length === 0);
  const dates = validRows.map((row) => row.transaction_date).filter((d): d is string => Boolean(d)).sort();
  const balances = validRows
    .map((row) => row.running_balance_pence == null ? null : row.running_balance_pence / 100)
    .filter((value): value is number => value != null);

  return {
    rows_detected: rows.length,
    valid_rows: validRows.length,
    invalid_rows: rows.length - validRows.length,
    duplicate_rows: validRows.filter((row) => row.fingerprint && duplicateFingerprints.has(row.fingerprint)).length,
    date_start: dates[0] ?? null,
    date_end: dates[dates.length - 1] ?? null,
    opening_balance: balances[0] ?? null,
    closing_balance: balances[balances.length - 1] ?? null,
  };
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

async function detectStatementContinuityWarnings(params: {
  orgId: string;
  bankAccountId: string;
  statementImportId: string;
  summary: StatementPreviewSummary;
}): Promise<StatementContinuityWarning[]> {
  const warnings: StatementContinuityWarning[] = [];
  const supabase = await createClient();
  const { data: previous } = await supabase
    .from('bank_statement_imports')
    .select('id, statement_end_date, closing_balance')
    .eq('workspace_id', params.orgId)
    .eq('bank_account_id', params.bankAccountId)
    .neq('id', params.statementImportId)
    .not('statement_end_date', 'is', null)
    .order('statement_end_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!previous || !params.summary.date_start) return warnings;

  const previousEnd = previous.statement_end_date as string | null;
  if (previousEnd) {
    if (previousEnd >= params.summary.date_start) {
      warnings.push({
        type: 'date_overlap',
        severity: 'warning',
        message: `This statement appears to overlap the prior statement ending ${previousEnd}.`,
        previous_statement_import_id: previous.id,
        previous_statement_end_date: previousEnd,
        current_statement_start_date: params.summary.date_start,
      });
    } else if (addDays(previousEnd, 1) < params.summary.date_start) {
      warnings.push({
        type: 'date_gap',
        severity: 'warning',
        message: `There is a gap between the prior statement ending ${previousEnd} and this statement starting ${params.summary.date_start}.`,
        previous_statement_import_id: previous.id,
        previous_statement_end_date: previousEnd,
        current_statement_start_date: params.summary.date_start,
      });
    }
  }

  const previousClosing = previous.closing_balance == null ? null : Number(previous.closing_balance);
  const currentOpening = params.summary.opening_balance;
  if (previousClosing != null && currentOpening != null && Math.round(previousClosing * 100) !== Math.round(currentOpening * 100)) {
    warnings.push({
      type: 'balance_mismatch',
      severity: 'warning',
      message: `Prior closing balance ${previousClosing.toFixed(2)} does not match this statement opening balance ${currentOpening.toFixed(2)}.`,
      previous_statement_import_id: previous.id,
      previous_closing_balance: previousClosing,
      current_opening_balance: currentOpening,
    });
  }

  return warnings;
}

function applyDuplicateValidation(
  rows: NormalisedBankTransactionRow[],
  existingDuplicateFingerprints = new Set<string>(),
): NormalisedBankTransactionRow[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const validationErrors = [...row.validation_errors];
    const validationWarnings = [...row.validation_warnings];

    if (row.fingerprint) {
      if (seen.has(row.fingerprint)) {
        validationErrors.push('Duplicate transaction in this file.');
      } else {
        seen.add(row.fingerprint);
      }
      if (existingDuplicateFingerprints.has(row.fingerprint)) {
        validationWarnings.push('This transaction already exists and will be skipped.');
      }
    }

    return {
      ...row,
      validation_errors: validationErrors,
      validation_warnings: validationWarnings,
      validation_status: validationErrors.length > 0 ? 'error' : validationWarnings.length > 0 ? 'warning' : 'valid',
    };
  });
}

function mappingIsCompatible(mapping: BankStatementColumnMapping, availableColumnKeys: Set<string>): boolean {
  const keys = [
    mapping.date,
    mapping.time,
    mapping.description,
    mapping.additional_description,
    mapping.reference,
    mapping.money_in,
    mapping.money_out,
    mapping.amount,
    mapping.balance,
  ].filter((value): value is string => Boolean(value));
  return keys.length > 0 && keys.every((key) => availableColumnKeys.has(key));
}

async function loadSavedBankImportMapping(params: {
  orgId: string;
  bankName?: string | null;
  fileType: BankStatementFileType | string;
  columns: BankStatementColumnMeta[];
}): Promise<{ mapping: BankStatementColumnMapping; name: string } | null> {
  const supabase = await createClient();
  let query = supabase
    .from('bank_import_mappings')
    .select('mapping_name, date_column, time_column, description_column, additional_description_column, reference_column, money_in_column, money_out_column, amount_column, amount_mode, balance_column, bank_name, created_at')
    .eq('workspace_id', params.orgId)
    .eq('file_type', params.fileType)
    .order('created_at', { ascending: false })
    .limit(10);

  query = params.bankName
    ? query.or(`bank_name.is.null,bank_name.eq.${params.bankName.replaceAll(',', '\\,')}`)
    : query.is('bank_name', null);

  const { data } = await query;

  const availableColumnKeys = new Set(params.columns.map((column) => column.columnKey));
  for (const row of data ?? []) {
    const mapping: BankStatementColumnMapping = {
      date: row.date_column ?? undefined,
      time: row.time_column ?? undefined,
      description: row.description_column ?? undefined,
      additional_description: row.additional_description_column ?? undefined,
      reference: row.reference_column ?? undefined,
      money_in: row.money_in_column ?? undefined,
      money_out: row.money_out_column ?? undefined,
      amount: row.amount_column ?? undefined,
      amountMode: row.amount_mode === 'separate' ? 'separate' : 'signed',
      balance: row.balance_column ?? undefined,
    };
    if (mappingIsCompatible(mapping, availableColumnKeys)) {
      return { mapping, name: row.mapping_name };
    }
  }

  return null;
}

async function findDuplicateFingerprints(bankAccountId: string, fingerprints: string[]) {
  if (fingerprints.length === 0) return new Set<string>();
  const supabase = await createClient();
  const { data } = await supabase
    .from('bank_lines')
    .select('fingerprint')
    .eq('bank_account_id', bankAccountId)
    .in('fingerprint', fingerprints);

  return new Set((data ?? []).map((row) => row.fingerprint as string));
}

async function updateStatementImportStatus(
  statementImportId: string,
  orgId: string,
  values: Record<string, unknown>,
) {
  const supabase = await createClient();
  await supabase
    .from('bank_statement_imports')
    .update(values)
    .eq('id', statementImportId)
    .eq('workspace_id', orgId);
}

export async function uploadBankStatementFile(formData: FormData): Promise<{
  ok: boolean;
  error: string | null;
  statement_import_id: string | null;
  duplicate_statement_import_id?: string;
}> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  const permissionError = validatePermission(role);
  if (permissionError) return { ok: false, error: permissionError, statement_import_id: null };

  const bankAccountId = String(formData.get('bankAccountId') ?? '');
  const file = formData.get('file');
  if (!bankAccountId || !(file instanceof File)) {
    return { ok: false, error: 'Choose a bank account and statement file.', statement_import_id: null };
  }

  const { bankAccount, error: bankAccountError } = await getActiveBankAccount(bankAccountId, orgId);
  if (bankAccountError || !bankAccount) {
    return { ok: false, error: bankAccountError ?? 'Bank account not found.', statement_import_id: null };
  }

  const fileType = detectFileType(file.name, file.type);
  if (!fileType) {
    return { ok: false, error: 'Upload a CSV or XLSX bank statement file.', statement_import_id: null };
  }
  if (!['csv', 'xlsx'].includes(fileType)) {
    return { ok: false, error: `${fileType.toUpperCase()} uploads are tracked, but parsing is not supported yet.`, statement_import_id: null };
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash('sha256').update(fileBuffer).digest('hex');
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('bank_statement_imports')
    .select('id, status')
    .eq('workspace_id', orgId)
    .eq('bank_account_id', bankAccountId)
    .eq('file_hash', fileHash)
    .maybeSingle();

  if (existing) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'bank_statement_duplicate_upload_skipped',
      entityType: 'bank_statement_import',
      entityId: existing.id,
      metadata: { bankAccountId, fileName: file.name, fileHash, status: existing.status },
    });
    return {
      ok: false,
      error: 'This statement file has already been uploaded for this bank account.',
      statement_import_id: existing.id,
      duplicate_statement_import_id: existing.id,
    };
  }

  const safeName = slugifyFileName(file.name) || `bank-statement.${fileType}`;
  const filePath = `${orgId}/bank-imports/${Date.now()}-${fileHash.slice(0, 12)}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(FINANCIAL_EVIDENCE_BUCKET)
    .upload(filePath, fileBuffer, { contentType: file.type || 'application/octet-stream', upsert: false });

  if (uploadError) {
    return { ok: false, error: uploadError.message, statement_import_id: null };
  }

  const { data: statementImport, error: insertError } = await supabase
    .from('bank_statement_imports')
    .insert({
      workspace_id: orgId,
      bank_account_id: bankAccountId,
      file_name: file.name,
      file_path: filePath,
      file_type: fileType,
      file_hash: fileHash,
      status: 'uploaded',
      uploaded_by: user.id,
    })
    .select('id')
    .single();

  if (insertError || !statementImport) {
    return {
      ok: false,
      error: insertError?.message ?? 'Could not create statement import record.',
      statement_import_id: null,
    };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'bank_statement_upload',
    entityType: 'bank_statement_import',
    entityId: statementImport.id,
    metadata: { bankAccountId, fileName: file.name, fileHash, filePath, fileType },
  });

  return { ok: true, error: null, statement_import_id: statementImport.id };
}

export async function parseBankStatementImport(params: {
  statementImportId: string;
  mapping?: BankStatementColumnMapping;
}): Promise<StatementPreviewResult> {
  const { orgId, role, user } = await getActiveOrg();
  const permissionError = validatePermission(role);
  if (permissionError) return emptyPreview(permissionError);

  const { statementImport, error } = await loadStatementImport(params.statementImportId, orgId);
  if (error || !statementImport) return emptyPreview(error ?? 'Statement import not found.');

  await updateStatementImportStatus(statementImport.id, orgId, { status: 'parsing' });

  const { parsed, error: parseError } = await parseStoredStatement(statementImport);
  if (parseError || !parsed || parsed.parse_errors.length > 0 && parsed.rows.length === 0) {
    const errors = parsed?.parse_errors ?? [parseError ?? 'Could not parse statement.'];
    await updateStatementImportStatus(statementImport.id, orgId, {
      status: 'failed',
      rows_detected: parsed?.rows.length ?? 0,
      rows_imported: 0,
      duplicates_skipped: 0,
      errors_count: errors.length,
      parse_errors: errors.slice(0, 50),
    });
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'bank_statement_parse_failed',
      entityType: 'bank_statement_import',
      entityId: statementImport.id,
      metadata: { errors: errors.slice(0, 10) },
    });
    return emptyPreview(errors[0] ?? 'Could not parse statement.');
  }

  const detected = detectBankColumns(parsed);
  const { bankAccount } = await getActiveBankAccount(statementImport.bank_account_id, orgId);
  const savedTemplate = await loadSavedBankImportMapping({
    orgId,
    bankName: bankAccount?.bank_name ?? null,
    fileType: statementImport.file_type,
    columns: parsed.columns,
  });
  const mapping = {
    ...detected.mapping,
    ...(savedTemplate?.mapping ?? {}),
    ...params.mapping,
  };
  const amountMode = mapping.amountMode ?? detected.amountMode;
  mapping.amountMode = amountMode;
  const rowsBeforeDuplicateValidation = normaliseStatementRows({
    rows: parsed.rows,
    mapping,
    workspaceId: orgId,
    bankAccountId: statementImport.bank_account_id,
  });
  const fingerprints = rowsBeforeDuplicateValidation
    .map((row) => row.fingerprint)
    .filter((fingerprint): fingerprint is string => Boolean(fingerprint));
  const duplicates = await findDuplicateFingerprints(statementImport.bank_account_id, fingerprints);
  const normalisedRows = applyDuplicateValidation(rowsBeforeDuplicateValidation, duplicates);
  const summary = summariseRows(normalisedRows, duplicates);
  const continuityWarnings = await detectStatementContinuityWarnings({
    orgId,
    bankAccountId: statementImport.bank_account_id,
    statementImportId: statementImport.id,
    summary,
  });
  const importStatus =
    parsed.parse_errors.length > 0 || detected.confidence === 'low' || summary.invalid_rows > 0
      ? 'needs_mapping'
      : 'ready_to_import';

  await updateStatementImportStatus(statementImport.id, orgId, {
    status: importStatus,
    rows_detected: summary.rows_detected,
    duplicates_skipped: summary.duplicate_rows,
    errors_count: parsed.parse_errors.length + summary.invalid_rows,
    parse_errors: [...parsed.parse_errors, ...normalisedRows.flatMap((row) => row.validation_errors.map((err) => `Row ${row.row_number}: ${err}`))].slice(0, 50),
    statement_start_date: summary.date_start,
    statement_end_date: summary.date_end,
    opening_balance: summary.opening_balance,
    closing_balance: summary.closing_balance,
    statement_warnings: continuityWarnings,
    warning_status: continuityWarnings.length > 0 ? 'warning' : 'clear',
  });

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'bank_statement_preview_generated',
    entityType: 'bank_statement_import',
    entityId: statementImport.id,
    metadata: { rowsDetected: summary.rows_detected, invalidRows: summary.invalid_rows, duplicateRows: summary.duplicate_rows, statementWarnings: continuityWarnings },
  });
  await logAuditEvent({
    orgId,
    userId: user.id,
    action: params.mapping ? 'bank_statement_mapping_manually_edited' : 'bank_statement_mapping_detected',
    entityType: 'bank_statement_import',
    entityId: statementImport.id,
    metadata: { mapping, confidence: detected.confidence, amountMode },
  });

  return {
    ok: true,
    error: null,
    statement_import_id: statementImport.id,
    headers: parsed.headers,
    columns: parsed.columns,
    amountMode,
    hasHeaders: parsed.hasHeaders,
    saved_template_applied: Boolean(savedTemplate && !params.mapping),
    saved_template_name: savedTemplate?.name ?? null,
    mapping,
    confidence: detected.confidence,
    detection_reasons: [
      parsed.hasHeaders ? 'Header row detected.' : 'No confident header row detected; generated Column A/B labels.',
      `Amount mode: ${amountMode === 'signed' ? 'transaction amount column' : 'separate money in/out columns'}.`,
      savedTemplate && !params.mapping ? `Applied saved mapping template "${savedTemplate.name}".` : 'Using detected mapping.',
      ...continuityWarnings.map((warning) => warning.message),
    ],
    summary,
    preview_rows: normalisedRows.slice(0, 50),
    invalid_rows: normalisedRows.filter((row) => row.validation_errors.length > 0 || row.validation_warnings.length > 0).slice(0, 250),
  };
}

export async function saveBankImportMapping(params: {
  mappingName: string;
  bankName?: string | null;
  fileType: BankStatementFileType;
  mapping: BankStatementColumnMapping;
}): Promise<{ ok: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  const permissionError = validatePermission(role);
  if (permissionError) return { ok: false, error: permissionError };

  const mappingName = params.mappingName.trim();
  if (!mappingName) return { ok: false, error: 'Mapping name is required.' };
  const supabase = await createClient();
  const { error } = await supabase.from('bank_import_mappings').upsert({
    workspace_id: orgId,
    bank_name: params.bankName?.trim() || null,
    file_type: params.fileType,
    mapping_name: mappingName,
    date_column: params.mapping.date ?? null,
    time_column: params.mapping.time ?? null,
    description_column: params.mapping.description ?? null,
    additional_description_column: params.mapping.additional_description ?? null,
    reference_column: params.mapping.reference ?? null,
    money_in_column: params.mapping.money_in ?? null,
    money_out_column: params.mapping.money_out ?? null,
    amount_column: params.mapping.amount ?? null,
    amount_mode: params.mapping.amountMode ?? (params.mapping.amount ? 'signed' : 'separate'),
    balance_column: params.mapping.balance ?? null,
    created_by: user.id,
  }, { onConflict: 'workspace_id,mapping_name' });

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function importParsedBankStatement(params: {
  statementImportId: string;
  mapping: BankStatementColumnMapping;
  saveMapping?: boolean;
  mappingName?: string;
}): Promise<ImportParsedStatementResult> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  const permissionError = validatePermission(role);
  if (permissionError) return emptyImportResult(permissionError, params.statementImportId);

  const { statementImport, error } = await loadStatementImport(params.statementImportId, orgId);
  if (error || !statementImport) return emptyImportResult(error ?? 'Statement import not found.', params.statementImportId);

  const { parsed, error: parseError } = await parseStoredStatement(statementImport);
  if (parseError || !parsed) return emptyImportResult(parseError ?? 'Could not parse statement.', statementImport.id);

  const detected = detectBankColumns(parsed);
  const mapping = {
    ...params.mapping,
    amountMode: params.mapping.amountMode ?? detected.amountMode,
  };
  const rowsBeforeDuplicateValidation = normaliseStatementRows({
    rows: parsed.rows,
    mapping,
    workspaceId: orgId,
    bankAccountId: statementImport.bank_account_id,
  });
  const existingDuplicates = await findDuplicateFingerprints(
    statementImport.bank_account_id,
    rowsBeforeDuplicateValidation.map((row) => row.fingerprint).filter((fingerprint): fingerprint is string => Boolean(fingerprint)),
  );
  const rows = applyDuplicateValidation(rowsBeforeDuplicateValidation, existingDuplicates);
  const validRows = rows.filter((row) => row.validation_errors.length === 0 && row.fingerprint);
  const insertableRows = validRows.filter((row) => !existingDuplicates.has(row.fingerprint));
  const errors = [
    ...parsed.parse_errors,
    ...rows.flatMap((row) => row.validation_errors.map((err) => `Row ${row.row_number}: ${err}`)),
  ];

  if (validRows.length === 0) {
    await updateStatementImportStatus(statementImport.id, orgId, {
      status: 'failed',
      rows_detected: rows.length,
      rows_imported: 0,
      duplicates_skipped: 0,
      errors_count: errors.length || 1,
      parse_errors: errors.length > 0 ? errors.slice(0, 50) : ['No valid transaction rows were found.'],
    });
    return emptyImportResult('No valid transaction rows were found.', statementImport.id);
  }

  const insertRows = insertableRows.map((row) => ({
    workspace_id: orgId,
    organisation_id: orgId,
    bank_account_id: statementImport.bank_account_id,
    statement_import_id: statementImport.id,
    txn_date: row.transaction_date,
    transaction_date: row.transaction_date,
    transaction_time: row.transaction_time,
    row_number: row.row_number,
    description: row.description,
    additional_description: row.additional_description,
    display_description: row.display_description,
    reference: row.reference,
    amount: row.amount_pence / 100,
    amount_pence: row.amount_pence,
    direction: (row.amount_pence ?? 0) >= 0 ? 'in' : 'out',
    money_in: row.money_in_pence > 0 ? row.money_in_pence / 100 : null,
    money_out: row.money_out_pence > 0 ? row.money_out_pence / 100 : null,
    running_balance: row.running_balance_pence == null ? null : row.running_balance_pence / 100,
    balance_pence: row.running_balance_pence,
    fingerprint: row.fingerprint,
    raw: {
      ...row.raw,
      __mapping: mapping,
      __row_number: row.row_number,
      __transaction_time: row.transaction_time,
    },
    status: 'unmatched',
    allocated: false,
    reconciled: false,
    created_by: user.id,
  }));

  const BATCH_SIZE = 500;
  let insertedCount = 0;
  const supabase = await createClient();

  for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
    const batch = insertRows.slice(i, i + BATCH_SIZE);
    const { data, error: insertError } = await supabase
      .from('bank_lines')
      .upsert(batch, { onConflict: 'bank_account_id,fingerprint', ignoreDuplicates: true })
      .select('id');

    if (insertError) {
      errors.push(`Batch insert error: ${insertError.message}`);
    } else {
      insertedCount += data?.length ?? 0;
    }
  }

  const skippedDuplicates = validRows.length - insertedCount;
  const summary = summariseRows(rows);
  const continuityWarnings = await detectStatementContinuityWarnings({
    orgId,
    bankAccountId: statementImport.bank_account_id,
    statementImportId: statementImport.id,
    summary,
  });
  const status =
    errors.length > 0
      ? insertedCount > 0
        ? 'partially_imported'
        : 'failed'
      : skippedDuplicates > 0
        ? 'partially_imported'
        : 'imported';

  await updateStatementImportStatus(statementImport.id, orgId, {
    status,
    statement_start_date: summary.date_start,
    statement_end_date: summary.date_end,
    opening_balance: summary.opening_balance,
    closing_balance: summary.closing_balance,
    rows_detected: rows.length,
    rows_imported: insertedCount,
    duplicates_skipped: skippedDuplicates,
    errors_count: errors.length,
    parse_errors: errors.length > 0 ? errors.slice(0, 50) : null,
    imported_at: insertedCount > 0 ? new Date().toISOString() : null,
    statement_warnings: continuityWarnings,
    warning_status: continuityWarnings.length > 0 ? 'warning' : 'clear',
  });

  if (skippedDuplicates > 0) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'bank_statement_duplicate_transactions_skipped',
      entityType: 'bank_statement_import',
      entityId: statementImport.id,
      metadata: { bankAccountId: statementImport.bank_account_id, duplicatesSkipped: skippedDuplicates },
    });
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: status === 'failed' ? 'bank_statement_import_failed' : 'bank_statement_import',
    entityType: 'bank_statement_import',
    entityId: statementImport.id,
    metadata: {
      bankAccountId: statementImport.bank_account_id,
      rowsDetected: rows.length,
      rowsImported: insertedCount,
      duplicatesSkipped: skippedDuplicates,
      errorsCount: errors.length,
    },
  });

  if (insertedCount > 0) {
    await supabase.from('workspace_setup_progress').upsert(
      {
        workspace_id: orgId,
        statement_uploaded: true,
        updated_by: user.id,
      },
      { onConflict: 'workspace_id' },
    );

    const suggestionResult = await createBankCategorisationSuggestionsForImport({
      orgId,
      userId: user.id,
      statementImportId: statementImport.id,
    });

    if (suggestionResult.error) {
      await logAuditEvent({
        orgId,
        userId: user.id,
        action: 'bank_categorisation_suggestions_failed',
        entityType: 'bank_statement_import',
        entityId: statementImport.id,
        metadata: { error: suggestionResult.error },
      });
    }
  }

  if (params.saveMapping && params.mappingName) {
    const { bankAccount } = await getActiveBankAccount(statementImport.bank_account_id, orgId);
    await saveBankImportMapping({
      mappingName: params.mappingName,
      bankName: bankAccount?.bank_name ?? null,
      fileType: statementImport.file_type as BankStatementFileType,
      mapping,
    });
  }

  revalidatePath('/banking');
  revalidatePath(`/banking/${statementImport.bank_account_id}`);

  return {
    ok: status !== 'failed',
    error: status === 'failed' ? errors[0] ?? 'Import failed.' : null,
    statement_import_id: statementImport.id,
    total_rows: rows.length,
    inserted_count: insertedCount,
    skipped_duplicates: skippedDuplicates,
    errors_count: errors.length,
    sample_errors: errors.slice(0, 10),
    donation_candidates_scanned: 0,
    donation_candidates_created: 0,
    donation_candidates_updated: 0,
    donation_candidates_skipped: 0,
  };
}

async function assertStatementImportCanBeReprocessed(statementImportId: string, orgId: string): Promise<{
  ok: boolean;
  error: string | null;
  bankLineIds: string[];
}> {
  const supabase = await createClient();
  const { data: bankLines, error } = await supabase
    .from('bank_lines')
    .select('id, status, allocated, reconciled, posted_journal_id, matched_source_type, matched_source_id')
    .eq('organisation_id', orgId)
    .eq('statement_import_id', statementImportId);

  if (error) return { ok: false, error: error.message, bankLineIds: [] };
  const lines = bankLines ?? [];
  const blockedLine = lines.find((line) => {
    return Boolean(
      line.allocated
      || line.reconciled
      || line.posted_journal_id
      || line.matched_source_type
      || line.matched_source_id
      || ['matched', 'reconciled', 'excluded'].includes(String(line.status ?? '')),
    );
  });
  if (blockedLine) {
    return {
      ok: false,
      error: 'This import cannot be reprocessed because at least one transaction is already matched, reconciled, posted, or excluded.',
      bankLineIds: [],
    };
  }

  const bankLineIds = lines.map((line) => line.id as string);
  if (bankLineIds.length > 0) {
    const [{ data: reconciliationMatch }, { data: transactionMatch }] = await Promise.all([
      supabase
        .from('bank_reconciliation_matches')
        .select('id')
        .eq('workspace_id', orgId)
        .eq('status', 'confirmed')
        .in('bank_transaction_id', bankLineIds)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('transaction_matches')
        .select('id')
        .eq('organisation_id', orgId)
        .eq('match_status', 'confirmed')
        .in('bank_line_id', bankLineIds)
        .limit(1)
        .maybeSingle(),
    ]);
    if (reconciliationMatch || transactionMatch) {
      return {
        ok: false,
        error: 'This import cannot be reprocessed because at least one transaction already has a confirmed match.',
        bankLineIds: [],
      };
    }
  }

  return { ok: true, error: null, bankLineIds };
}

export async function reprocessBankStatementImport(params: {
  statementImportId: string;
  mapping: BankStatementColumnMapping;
  saveMapping?: boolean;
  mappingName?: string;
}): Promise<ImportParsedStatementResult> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  const permissionError = validatePermission(role);
  if (permissionError) return emptyImportResult(permissionError, params.statementImportId);

  const { statementImport, error } = await loadStatementImport(params.statementImportId, orgId);
  if (error || !statementImport) return emptyImportResult(error ?? 'Statement import not found.', params.statementImportId);

  const reprocessable = await assertStatementImportCanBeReprocessed(statementImport.id, orgId);
  if (!reprocessable.ok) return emptyImportResult(reprocessable.error ?? 'Import cannot be reprocessed.', statementImport.id);

  const supabase = await createClient();
  if (reprocessable.bankLineIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('bank_lines')
      .delete()
      .eq('organisation_id', orgId)
      .eq('statement_import_id', statementImport.id);
    if (deleteError) return emptyImportResult(deleteError.message, statementImport.id);
  }

  await updateStatementImportStatus(statementImport.id, orgId, {
    status: 'uploaded',
    rows_imported: 0,
    duplicates_skipped: 0,
    errors_count: 0,
    parse_errors: null,
    imported_at: null,
  });

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'bank_statement_reprocess_started',
    entityType: 'bank_statement_import',
    entityId: statementImport.id,
    metadata: {
      bankAccountId: statementImport.bank_account_id,
      removedRows: reprocessable.bankLineIds.length,
      mapping: params.mapping,
    },
  });

  const result = await importParsedBankStatement({
    statementImportId: statementImport.id,
    mapping: params.mapping,
    saveMapping: params.saveMapping,
    mappingName: params.mappingName,
  });

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: result.ok ? 'bank_statement_reprocessed' : 'bank_statement_reprocess_failed',
    entityType: 'bank_statement_import',
    entityId: statementImport.id,
    metadata: {
      bankAccountId: statementImport.bank_account_id,
      insertedCount: result.inserted_count,
      skippedDuplicates: result.skipped_duplicates,
      errorsCount: result.errors_count,
    },
  });

  return result;
}

export async function getBankStatementImportDetail(params: {
  bankAccountId: string;
  importId: string;
}): Promise<{ data: BankStatementImportDetail | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data: bankAccount, error: bankErr } = await supabase
    .from('bank_accounts')
    .select('id, name')
    .eq('id', params.bankAccountId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (bankErr || !bankAccount) {
    return { data: null, error: bankErr?.message ?? 'Bank account not found.' };
  }

  const { statementImport, error: importErr } = await loadStatementImport(params.importId, orgId);
  if (importErr || !statementImport) {
    return { data: null, error: importErr ?? 'Statement import not found.' };
  }

  if (statementImport.bank_account_id !== params.bankAccountId) {
    return { data: null, error: 'Statement import does not belong to this bank account.' };
  }

  const { data: bankLines, error: lineError } = await supabase
    .from('bank_lines')
    .select(
      'id, status, allocated, reconciled, posted_journal_id, matched_source_type, matched_source_id',
    )
    .eq('organisation_id', orgId)
    .eq('statement_import_id', statementImport.id);

  if (lineError) {
    return { data: null, error: lineError.message };
  }

  const lines = (bankLines ?? []) as BankLineForImportRemoval[];
  const bankLineIds = lines.map((line) => line.id);
  const confirmedIds = await loadConfirmedMatchIdsForBankLines(supabase, orgId, bankLineIds);

  const reconciledRows = lines.filter((line) => Boolean(line.reconciled) || line.status === 'reconciled').length;
  const postedRows = lines.filter((line) => Boolean(line.posted_journal_id) || line.status === 'matched').length;
  const excludedRows = lines.filter(
    (line) => line.status === 'excluded' || line.matched_source_type === 'excluded',
  ).length;
  const linesNeedingUndo = lines.filter((line) => lineBlocksImportDeletion(line, confirmedIds)).length;
  const unreconciledRows = Math.max(0, lines.length - linesNeedingUndo);

  let giftAidLockedMatchCount = 0;
  if (bankLineIds.length > 0) {
    const { count, error: gaErr } = await supabase
      .from('donations')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .in('bank_transaction_id', bankLineIds)
      .in('gift_aid_status', [...GIFT_AID_STATEMENT_REMOVAL_GUARD_STATUSES]);
    if (!gaErr && count != null) giftAidLockedMatchCount = count;
  }

  const { data: events, error: eventsErr } = await listCorrectionEventsForStatementImport(
    orgId,
    statementImport.id,
  );
  if (eventsErr) {
    return { data: null, error: eventsErr };
  }

  return {
    data: {
      import: statementImport,
      bank_account_id: bankAccount.id,
      bank_account_name: bankAccount.name,
      aggregates: {
        total_lines: lines.length,
        unreconciled_rows: unreconciledRows,
        reconciled_rows: reconciledRows,
        posted_rows: postedRows,
        excluded_rows: excludedRows,
        lines_needing_undo: linesNeedingUndo,
        gift_aid_locked_match_count: giftAidLockedMatchCount,
      },
      correction_events: events,
    },
    error: null,
  };
}

export async function createBankStatementImportSignedDownloadUrl(importId: string): Promise<{
  url: string | null;
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const { statementImport, error } = await loadStatementImport(importId, orgId);
  if (error || !statementImport) {
    return { url: null, error: error ?? 'Statement import not found.' };
  }
  if (!statementImport.file_path) {
    return { url: null, error: 'No uploaded file path is recorded for this import.' };
  }

  const supabase = await createClient();
  const { data, error: signErr } = await supabase.storage
    .from(FINANCIAL_EVIDENCE_BUCKET)
    .createSignedUrl(statementImport.file_path, 60 * 5);

  if (signErr || !data?.signedUrl) {
    return { url: null, error: signErr?.message ?? 'Could not create download link.' };
  }
  return { url: data.signedUrl, error: null };
}

export async function removeBankStatementImportWithOptions(params: {
  importId: string;
  reason: DeleteBankStatementReason | string;
  deleteUploadedFile?: boolean;
  giftAidUnreconcileOverride?: boolean;
}): Promise<RemoveBankStatementImportWithOptionsResult> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  if (!isTreasurerOrAdminRole(role)) {
    return {
      ok: false,
      error: 'Only an admin or treasurer can remove a statement that has reconciled activity.',
      deleted_transactions: 0,
      file_deleted: false,
      unreconciled_line_count: 0,
    };
  }

  const reason = String(params.reason ?? '').trim();
  if (reason.length < 3) {
    return {
      ok: false,
      error: 'Please enter a reason (at least 3 characters).',
      deleted_transactions: 0,
      file_deleted: false,
      unreconciled_line_count: 0,
    };
  }

  const giftAidUnreconcileOverride = Boolean(params.giftAidUnreconcileOverride);

  const { statementImport, error: loadErr } = await loadStatementImport(params.importId, orgId);
  if (loadErr || !statementImport) {
    return {
      ok: false,
      error: loadErr ?? 'Statement import not found.',
      deleted_transactions: 0,
      file_deleted: false,
      unreconciled_line_count: 0,
    };
  }

  const supabase = await createClient();
  const { data: bankLines, error: lineError } = await supabase
    .from('bank_lines')
    .select(
      'id, txn_date, status, allocated, reconciled, posted_journal_id, matched_source_type, matched_source_id',
    )
    .eq('organisation_id', orgId)
    .eq('statement_import_id', statementImport.id);

  if (lineError) {
    return {
      ok: false,
      error: lineError.message,
      deleted_transactions: 0,
      file_deleted: false,
      unreconciled_line_count: 0,
    };
  }

  const lines = (bankLines ?? []) as BankLineForImportRemoval[];
  const bankLineIds = lines.map((l) => l.id);
  let confirmedIds = await loadConfirmedMatchIdsForBankLines(supabase, orgId, bankLineIds);

  const linesToUndo = lines.filter((line) => lineBlocksImportDeletion(line, confirmedIds));
  const matchOnlyStray = linesToUndo.filter((line) => isMatchOnlyStray(line, confirmedIds));
  const needsUnreconcile = linesToUndo.filter((line) => !isMatchOnlyStray(line, confirmedIds));

  if (matchOnlyStray.length > 0) {
    const admin = createAdminClient();
    for (const line of matchOnlyStray) {
      await rejectConfirmedMatchesForBankLine(admin, orgId, line.id);
    }
    const { error: strayResetErr } = await admin
      .from('bank_lines')
      .update({
        reconciled: false,
        reconciled_at: null,
        reconciled_by: null,
        matched_source_type: null,
        matched_source_id: null,
        posted_journal_id: null,
        status: 'unmatched',
        allocated: false,
      })
      .in(
        'id',
        matchOnlyStray.map((l) => l.id),
      )
      .eq('organisation_id', orgId);
    if (strayResetErr) {
      return {
        ok: false,
        error: strayResetErr.message,
        deleted_transactions: 0,
        file_deleted: false,
        unreconciled_line_count: 0,
      };
    }
  }

  needsUnreconcile.sort((a, b) => {
    const ae = a.status === 'excluded' || a.matched_source_type === 'excluded' ? 0 : 1;
    const be = b.status === 'excluded' || b.matched_source_type === 'excluded' ? 0 : 1;
    if (ae !== be) return ae - be;
    return String(a.txn_date ?? '').localeCompare(String(b.txn_date ?? ''));
  });

  let unreconciledCount = 0;
  for (const line of needsUnreconcile) {
    const result = await unreconcileBankTransaction({
      bankTransactionId: line.id,
      reason,
      giftAidUnreconcileOverride,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? 'Unreconcile failed.',
        deleted_transactions: 0,
        file_deleted: false,
        unreconciled_line_count: unreconciledCount,
      };
    }
    unreconciledCount += 1;
  }

  const { data: linesAfter, error: afterErr } = await supabase
    .from('bank_lines')
    .select(
      'id, status, allocated, reconciled, posted_journal_id, matched_source_type, matched_source_id',
    )
    .eq('organisation_id', orgId)
    .eq('statement_import_id', statementImport.id);

  if (afterErr) {
    return {
      ok: false,
      error: afterErr.message,
      deleted_transactions: 0,
      file_deleted: false,
      unreconciled_line_count: unreconciledCount,
    };
  }

  const refreshed = (linesAfter ?? []) as BankLineForImportRemoval[];
  const refreshedIds = refreshed.map((l) => l.id);
  confirmedIds = await loadConfirmedMatchIdsForBankLines(supabase, orgId, refreshedIds);
  const stillBlocked = refreshed.filter((line) => lineBlocksImportDeletion(line, confirmedIds));

  if (stillBlocked.length > 0) {
    const risky = stillBlocked.some(
      (line) => Boolean(line.posted_journal_id) || Boolean(line.reconciled) || Boolean(line.allocated),
    );
    if (risky) {
      return {
        ok: false,
        error:
          'Some imported rows still carry posted or allocated activity after unreconcile. Nothing was deleted; contact support if this persists.',
        deleted_transactions: 0,
        file_deleted: false,
        unreconciled_line_count: unreconciledCount,
      };
    }

    const admin = createAdminClient();
    for (const line of stillBlocked) {
      await rejectConfirmedMatchesForBankLine(admin, orgId, line.id);
    }
    const { error: resetErr } = await admin
      .from('bank_lines')
      .update({
        reconciled: false,
        reconciled_at: null,
        reconciled_by: null,
        matched_source_type: null,
        matched_source_id: null,
        posted_journal_id: null,
        status: 'unmatched',
        allocated: false,
      })
      .in(
        'id',
        stillBlocked.map((l) => l.id),
      )
      .eq('organisation_id', orgId);

    if (resetErr) {
      return {
        ok: false,
        error: resetErr.message,
        deleted_transactions: 0,
        file_deleted: false,
        unreconciled_line_count: unreconciledCount,
      };
    }
  }

  const { data: finalLines, error: finalErr } = await supabase
    .from('bank_lines')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('statement_import_id', statementImport.id);

  if (finalErr) {
    return {
      ok: false,
      error: finalErr.message,
      deleted_transactions: 0,
      file_deleted: false,
      unreconciled_line_count: unreconciledCount,
    };
  }

  const finalLineIds = (finalLines ?? []).map((l) => l.id as string);
  const finalConfirmed = await loadConfirmedMatchIdsForBankLines(supabase, orgId, finalLineIds);
  const { data: finalSnapshot, error: snapErr } = await supabase
    .from('bank_lines')
    .select(
      'id, status, allocated, reconciled, posted_journal_id, matched_source_type, matched_source_id',
    )
    .eq('organisation_id', orgId)
    .eq('statement_import_id', statementImport.id);

  if (snapErr) {
    return {
      ok: false,
      error: snapErr.message,
      deleted_transactions: 0,
      file_deleted: false,
      unreconciled_line_count: unreconciledCount,
    };
  }

  const snapshot = (finalSnapshot ?? []) as BankLineForImportRemoval[];
  const deleteBlocked = snapshot.some((line) => lineBlocksImportDeletion(line, finalConfirmed));
  if (deleteBlocked) {
    return {
      ok: false,
      error:
        'This statement still has reconciled or matched rows. Undo them from reconciliation, or resolve any unsupported match types, then try again.',
      deleted_transactions: 0,
      file_deleted: false,
      unreconciled_line_count: unreconciledCount,
    };
  }

  if (finalLineIds.length > 0) {
    await supabase
      .from('categorisation_suggestions')
      .delete()
      .eq('workspace_id', orgId)
      .in('bank_transaction_id', finalLineIds);

    const { error: deleteLinesError } = await supabase
      .from('bank_lines')
      .delete()
      .eq('organisation_id', orgId)
      .eq('statement_import_id', statementImport.id);

    if (deleteLinesError) {
      return {
        ok: false,
        error: deleteLinesError.message,
        deleted_transactions: 0,
        file_deleted: false,
        unreconciled_line_count: unreconciledCount,
      };
    }
  }

  const { error: deleteImportError } = await supabase
    .from('bank_statement_imports')
    .delete()
    .eq('id', statementImport.id)
    .eq('workspace_id', orgId);

  if (deleteImportError) {
    return {
      ok: false,
      error: deleteImportError.message,
      deleted_transactions: 0,
      file_deleted: false,
      unreconciled_line_count: unreconciledCount,
    };
  }

  let fileDeleted = false;
  let storageError: string | null = null;
  if (params.deleteUploadedFile !== false && statementImport.file_path) {
    const { error: removeError } = await supabase.storage
      .from(FINANCIAL_EVIDENCE_BUCKET)
      .remove([statementImport.file_path]);
    fileDeleted = !removeError;
    storageError = removeError?.message ?? null;
  }

  const correctionMeta = {
    bankAccountId: statementImport.bank_account_id,
    transactions_removed: snapshot.length,
    unreconciled_steps: unreconciledCount,
    file_deleted: fileDeleted,
    gift_aid_override: giftAidUnreconcileOverride,
    storage_error: storageError,
  };

  const { error: correctionErr } = await insertBankStatementImportRemovalEvent({
    orgId,
    statementImportId: statementImport.id,
    bankAccountId: statementImport.bank_account_id,
    userId: user.id,
    reason,
    metadata: correctionMeta,
  });

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'bank_statement_import_removed_orchestrated',
    entityType: 'bank_statement_import',
    entityId: statementImport.id,
    metadata: {
      bankAccountId: statementImport.bank_account_id,
      reason,
      deletedTransactions: snapshot.length,
      unreconciledLineCount: unreconciledCount,
      fileDeleted,
      storageError,
      correction_event_error: correctionErr,
    },
  });

  revalidatePath('/banking');
  revalidatePath(`/banking/${statementImport.bank_account_id}`);
  revalidatePath(`/banking/${statementImport.bank_account_id}/imports/${statementImport.id}`);
  revalidatePath('/reconciliation');
  revalidatePath('/dashboard');
  revalidatePath('/reports');
  revalidatePath('/donations');
  revalidatePath('/gift-aid');
  revalidatePath('/journals');
  invalidateOrgReportCache(orgId);

  return {
    ok: true,
    error: null,
    deleted_transactions: snapshot.length,
    file_deleted: fileDeleted,
    unreconciled_line_count: unreconciledCount,
    storage_error: storageError,
    correction_event_error: correctionErr,
  };
}

export async function deleteBankStatementImport(params: {
  importId: string;
  reason: DeleteBankStatementReason | string;
  deleteFile?: boolean;
}): Promise<DeleteBankStatementImportResult> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  const permissionError = validatePermission(role);
  if (permissionError) {
    return {
      ok: false,
      error: permissionError,
      deleted_transactions: 0,
      reconciled_count: 0,
      posted_count: 0,
      excluded_count: 0,
      file_deleted: false,
    };
  }

  const reason = String(params.reason ?? '').trim();
  if (!reason) {
    return {
      ok: false,
      error: 'A deletion reason is required.',
      deleted_transactions: 0,
      reconciled_count: 0,
      posted_count: 0,
      excluded_count: 0,
      file_deleted: false,
    };
  }

  const { statementImport, error } = await loadStatementImport(params.importId, orgId);
  if (error || !statementImport) {
    return {
      ok: false,
      error: error ?? 'Statement import not found.',
      deleted_transactions: 0,
      reconciled_count: 0,
      posted_count: 0,
      excluded_count: 0,
      file_deleted: false,
    };
  }

  const supabase = await createClient();
  const { data: bankLines, error: lineError } = await supabase
    .from('bank_lines')
    .select('id, status, allocated, reconciled, posted_journal_id, matched_source_type, matched_source_id')
    .eq('organisation_id', orgId)
    .eq('statement_import_id', statementImport.id);

  if (lineError) {
    return {
      ok: false,
      error: lineError.message,
      deleted_transactions: 0,
      reconciled_count: 0,
      posted_count: 0,
      excluded_count: 0,
      file_deleted: false,
    };
  }

  const lines = bankLines ?? [];
  const bankLineIds = lines.map((line) => line.id as string);
  const reconciledCount = lines.filter((line) => Boolean(line.reconciled) || line.status === 'reconciled').length;
  const postedCount = lines.filter((line) => Boolean(line.posted_journal_id) || line.status === 'matched').length;
  const excludedCount = lines.filter((line) => line.status === 'excluded' || line.matched_source_type === 'excluded').length;

  let confirmedMatchCount = 0;
  if (bankLineIds.length > 0) {
    const [{ count: bankMatchCount }, { count: transactionMatchCount }] = await Promise.all([
      supabase
        .from('bank_reconciliation_matches')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', orgId)
        .eq('status', 'confirmed')
        .in('bank_transaction_id', bankLineIds),
      supabase
        .from('transaction_matches')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .eq('match_status', 'confirmed')
        .in('bank_line_id', bankLineIds),
    ]);
    confirmedMatchCount = (bankMatchCount ?? 0) + (transactionMatchCount ?? 0);
  }

  const blocked = lines.some((line) => Boolean(
    line.allocated
    || line.reconciled
    || line.posted_journal_id
    || line.matched_source_type
    || line.matched_source_id
    || ['matched', 'reconciled', 'excluded'].includes(String(line.status ?? '')),
  )) || confirmedMatchCount > 0;

  if (blocked) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'bank_statement_delete_blocked',
      entityType: 'bank_statement_import',
      entityId: statementImport.id,
      metadata: {
        bankAccountId: statementImport.bank_account_id,
        reason,
        transactionCount: lines.length,
        reconciledCount,
        postedCount,
        excludedCount,
        confirmedMatchCount,
      },
    });
    return {
      ok: false,
      error: 'This statement has reconciled transactions. Unreconcile them before deleting this import.',
      deleted_transactions: 0,
      reconciled_count: reconciledCount,
      posted_count: postedCount,
      excluded_count: excludedCount,
      file_deleted: false,
    };
  }

  if (bankLineIds.length > 0) {
    await supabase
      .from('categorisation_suggestions')
      .delete()
      .eq('workspace_id', orgId)
      .in('bank_transaction_id', bankLineIds);

    const { error: deleteLinesError } = await supabase
      .from('bank_lines')
      .delete()
      .eq('organisation_id', orgId)
      .eq('statement_import_id', statementImport.id);

    if (deleteLinesError) {
      return {
        ok: false,
        error: deleteLinesError.message,
        deleted_transactions: 0,
        reconciled_count: reconciledCount,
        posted_count: postedCount,
        excluded_count: excludedCount,
        file_deleted: false,
      };
    }
  }

  const { error: deleteImportError } = await supabase
    .from('bank_statement_imports')
    .delete()
    .eq('id', statementImport.id)
    .eq('workspace_id', orgId);

  if (deleteImportError) {
    return {
      ok: false,
      error: deleteImportError.message,
      deleted_transactions: 0,
      reconciled_count: reconciledCount,
      posted_count: postedCount,
      excluded_count: excludedCount,
      file_deleted: false,
    };
  }

  let fileDeleted = false;
  let storageError: string | null = null;
  if (params.deleteFile !== false && statementImport.file_path) {
    const { error: removeError } = await supabase.storage
      .from(FINANCIAL_EVIDENCE_BUCKET)
      .remove([statementImport.file_path]);
    fileDeleted = !removeError;
    storageError = removeError?.message ?? null;
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'bank_statement_import_deleted',
    entityType: 'bank_statement_import',
    entityId: statementImport.id,
    metadata: {
      bankAccountId: statementImport.bank_account_id,
      reason,
      transactionCount: lines.length,
      deletedFile: fileDeleted,
      storageError,
      filePath: statementImport.file_path,
    },
  });

  revalidatePath('/banking');
  revalidatePath(`/banking/${statementImport.bank_account_id}`);
  revalidatePath('/reconciliation');
  revalidatePath('/dashboard');
  revalidatePath('/reports');
  invalidateOrgReportCache(orgId);

  return {
    ok: true,
    error: null,
    deleted_transactions: lines.length,
    reconciled_count: reconciledCount,
    posted_count: postedCount,
    excluded_count: excludedCount,
    file_deleted: fileDeleted,
    storage_error: storageError,
  };
}

export async function voidBankStatementImport(statementImportId: string): Promise<{ ok: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  const permissionError = validatePermission(role);
  if (permissionError) return { ok: false, error: permissionError };

  const { statementImport, error } = await loadStatementImport(statementImportId, orgId);
  if (error || !statementImport) return { ok: false, error: error ?? 'Statement import not found.' };

  await updateStatementImportStatus(statementImport.id, orgId, { status: 'voided' });
  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'bank_statement_voided',
    entityType: 'bank_statement_import',
    entityId: statementImport.id,
    metadata: { bankAccountId: statementImport.bank_account_id },
  });
  revalidatePath('/banking');
  revalidatePath(`/banking/${statementImport.bank_account_id}`);
  return { ok: true, error: null };
}

export async function listBankStatementImports(bankAccountId: string): Promise<{
  data: BankStatementImportRow[];
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bank_statement_imports')
    .select('*')
    .eq('workspace_id', orgId)
    .eq('bank_account_id', bankAccountId)
    .order('uploaded_at', { ascending: false })
    .limit(25);

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as BankStatementImportRow[], error: null };
}
