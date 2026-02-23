'use server';

import Papa from 'papaparse';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { getProviderMapper } from './providers';
import {
  fingerprintGivingRow,
  validateGivingRow,
  importHashFromCsv,
} from './importUtils';
import {
  groupRowsByDate,
  buildJournalSpecs,
  groupPayoutRows,
  buildPayoutJournalSpecs,
  isJournalBalanced,
} from './journalBuilder';
import type {
  GivingProvider,
  GivingImportResult,
  NormalizedRow,
  GivingImportSummary,
  GivingImportRowView,
} from './types';
import { assertWriteAllowed } from '@/lib/demo';

/* ------------------------------------------------------------------ */
/*  importGivingCsv                                                    */
/* ------------------------------------------------------------------ */

export async function importGivingCsv(
  formData: FormData
): Promise<GivingImportResult> {
  await assertWriteAllowed();
  const { user, role, orgId } = await getActiveOrg();

  try { assertCanPerform(role, 'create', 'giving_imports'); }
  catch (e) { return emptyResult(e instanceof PermissionError ? e.message : 'Permission denied.'); }

  const provider = formData.get('provider') as GivingProvider;
  const file = formData.get('file') as File | null;
  const bankAccountLedgerId = (formData.get('bankAccountLedgerId') as string) || null;

  if (!provider || !file) {
    return emptyResult('Missing provider or file.');
  }

  // 1. Parse CSV
  const csvText = await file.text();
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.data.length === 0) {
    return emptyResult('CSV file is empty or has no data rows.');
  }

  // 2. Detect columns via provider mapper
  const mapper = getProviderMapper(provider);
  const headers = parsed.meta.fields ?? [];
  const cols = mapper.detectColumns(headers);

  if (!cols) {
    return emptyResult(
      `Could not detect required columns for ${provider}. Ensure your CSV has Date and Amount columns.`
    );
  }

  // 3. Map and validate rows
  const normalizedRows: NormalizedRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const raw = parsed.data[i];
    const rowNum = i + 2;

    try {
      const mapped = mapper.mapRow(raw, cols);
      if (!mapped) {
        errors.push(`Row ${rowNum}: Could not parse (missing date or zero amount).`);
        continue;
      }

      const validationErr = validateGivingRow(mapped);
      if (validationErr) {
        errors.push(`Row ${rowNum}: ${validationErr}`);
        continue;
      }

      normalizedRows.push(mapped);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Row ${rowNum}: ${msg}`);
    }
  }

  if (normalizedRows.length === 0) {
    return {
      importId: '',
      total_rows: parsed.data.length,
      inserted_count: 0,
      skipped_count: 0,
      error_count: errors.length,
      journals_created: 0,
      sample_errors: errors.slice(0, 10),
    };
  }

  // 4. Fetch platform mapping for this provider
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: platform, error: platErr } = await supabase
    .from('giving_platforms')
    .select('clearing_account_id, fee_account_id, donations_income_account_id')
    .eq('organisation_id', orgId)
    .eq('provider', provider)
    .single();

  if (platErr || !platform) {
    return emptyResult(
      `No giving platform mapping found for ${provider}. Configure it in Giving Platforms or run Seed Data.`
    );
  }

  // Resolve income account: platform config → fallback to "Donations Income"
  let incomeAccountId = platform.donations_income_account_id as string | null;
  if (!incomeAccountId) {
    const { data: fallback } = await supabase
      .from('accounts')
      .select('id')
      .eq('organisation_id', orgId)
      .eq('name', 'Donations Income')
      .eq('type', 'income')
      .limit(1)
      .single();

    incomeAccountId = fallback?.id ?? null;
  }

  if (!incomeAccountId) {
    return emptyResult(
      'No donations income account configured. Seed one or set it on the Giving Platforms page.'
    );
  }

  // Resolve default fund (General Fund / unrestricted)
  const { data: defaultFund } = await supabase
    .from('funds')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('type', 'unrestricted')
    .limit(1)
    .single();

  const defaultFundId = defaultFund?.id ?? null;

  // 5. Create giving_import record
  const importHash = importHashFromCsv(csvText, provider);
  const dates = normalizedRows.map((r) => r.txn_date).sort();

  const { data: importRecord, error: importErr } = await supabase
    .from('giving_imports')
    .insert({
      organisation_id: orgId,
      provider,
      import_start: dates[0],
      import_end: dates[dates.length - 1],
      file_name: file.name,
      import_hash: importHash,
      status: 'completed',
      inserted_count: 0,
      skipped_count: 0,
      error_count: errors.length,
      journals_created: 0,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (importErr || !importRecord) {
    return emptyResult(importErr?.message ?? 'Failed to create import record.');
  }

  const importId = importRecord.id;

  // 6. Prepare rows with fingerprints for bulk insert
  const dbRows = normalizedRows.map((row) => ({
    giving_import_id: importId,
    organisation_id: orgId,
    provider,
    txn_date: row.txn_date,
    gross_amount_pence: row.gross_amount_pence,
    fee_amount_pence: row.fee_amount_pence,
    net_amount_pence: row.net_amount_pence,
    donor_name: row.donor_name,
    reference: row.reference,
    payout_reference: row.payout_reference,
    fingerprint: fingerprintGivingRow({
      provider,
      txn_date: row.txn_date,
      gross_amount_pence: row.gross_amount_pence,
      fee_amount_pence: row.fee_amount_pence,
      reference: row.reference,
    }),
    raw: row.raw,
  }));

  // 7. Bulk upsert rows (skip duplicates)
  const BATCH_SIZE = 500;
  let insertedCount = 0;

  for (let i = 0; i < dbRows.length; i += BATCH_SIZE) {
    const batch = dbRows.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from('giving_import_rows')
      .upsert(batch, {
        onConflict: 'organisation_id,provider,fingerprint',
        ignoreDuplicates: true,
      })
      .select('id');

    if (error) {
      errors.push(`Batch insert error: ${error.message}`);
    } else {
      insertedCount += data?.length ?? 0;
    }
  }

  const skippedCount = dbRows.length - insertedCount;

  // 8. Build and post journals (one per day)
  const groups = groupRowsByDate(normalizedRows);
  const journalSpecs = buildJournalSpecs({
    groups,
    provider,
    importId,
    clearingAccountId: platform.clearing_account_id,
    feeAccountId: platform.fee_account_id,
    incomeAccountId,
    defaultFundId,
  });

  let journalsCreated = 0;

  for (const spec of journalSpecs) {
    if (!isJournalBalanced(spec.lines)) {
      errors.push(`Journal for ${spec.journal_date}: not balanced, skipping.`);
      continue;
    }

    try {
      // Create journal as draft
      const { data: journal, error: journalErr } = await admin
        .from('journals')
        .insert({
          organisation_id: orgId,
          journal_date: spec.journal_date,
          memo: spec.memo,
          status: 'draft',
          created_by: user.id,
        })
        .select('id')
        .single();

      if (journalErr || !journal) {
        errors.push(
          `Journal for ${spec.journal_date}: ${journalErr?.message ?? 'creation failed'}`
        );
        continue;
      }

      // Insert journal lines
      const jRows = spec.lines.map((jl) => ({
        journal_id: journal.id,
        organisation_id: orgId,
        account_id: jl.account_id,
        fund_id: jl.fund_id || null,
        description: jl.description,
        debit_pence: jl.debit_pence,
        credit_pence: jl.credit_pence,
      }));

      const { error: jLinesErr } = await admin
        .from('journal_lines')
        .insert(jRows);

      if (jLinesErr) {
        await admin.from('journals').delete().eq('id', journal.id);
        errors.push(
          `Journal for ${spec.journal_date}: lines insert failed – ${jLinesErr.message}`
        );
        continue;
      }

      // Post the journal (triggers balance check)
      const { error: postErr } = await admin
        .from('journals')
        .update({ status: 'posted' })
        .eq('id', journal.id);

      if (postErr) {
        await admin.from('journals').delete().eq('id', journal.id);
        errors.push(
          `Journal for ${spec.journal_date}: posting failed – ${postErr.message}`
        );
        continue;
      }

      journalsCreated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Journal for ${spec.journal_date}: ${msg}`);
    }
  }

  // 8b. Build and post payout journals (grouped by payout_reference)
  if (bankAccountLedgerId) {
    const payoutGroups = groupPayoutRows(normalizedRows);
    const payoutSpecs = buildPayoutJournalSpecs({
      payoutGroups,
      provider,
      importId,
      clearingAccountId: platform.clearing_account_id,
      bankAccountId: bankAccountLedgerId,
    });

    for (const spec of payoutSpecs) {
      if (!isJournalBalanced(spec.lines)) {
        errors.push(`Payout journal: not balanced, skipping.`);
        continue;
      }

      try {
        const { data: journal, error: journalErr } = await admin
          .from('journals')
          .insert({
            organisation_id: orgId,
            journal_date: spec.journal_date,
            memo: spec.memo,
            status: 'draft',
            created_by: user.id,
          })
          .select('id')
          .single();

        if (journalErr || !journal) {
          errors.push(
            `Payout journal: ${journalErr?.message ?? 'creation failed'}`
          );
          continue;
        }

        const jRows = spec.lines.map((jl) => ({
          journal_id: journal.id,
          organisation_id: orgId,
          account_id: jl.account_id,
          fund_id: jl.fund_id || null,
          description: jl.description,
          debit_pence: jl.debit_pence,
          credit_pence: jl.credit_pence,
        }));

        const { error: jLinesErr } = await admin
          .from('journal_lines')
          .insert(jRows);

        if (jLinesErr) {
          await admin.from('journals').delete().eq('id', journal.id);
          errors.push(`Payout journal: lines insert failed – ${jLinesErr.message}`);
          continue;
        }

        const { error: postErr } = await admin
          .from('journals')
          .update({ status: 'posted' })
          .eq('id', journal.id);

        if (postErr) {
          await admin.from('journals').delete().eq('id', journal.id);
          errors.push(`Payout journal: posting failed – ${postErr.message}`);
          continue;
        }

        journalsCreated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Payout journal: ${msg}`);
      }
    }
  }

  // 9. Create donations records from imported rows
  let donationsCreated = 0;

  // Fetch all donors for name-based matching
  const { data: allDonors } = await supabase
    .from('donors')
    .select('id, full_name, email')
    .eq('organisation_id', orgId);

  const donorsByName = new Map<string, string>();
  for (const donor of allDonors ?? []) {
    if (donor.full_name) {
      donorsByName.set(donor.full_name.trim().toLowerCase(), donor.id);
    }
  }

  for (const row of normalizedRows) {
    try {
      // Match donor by name
      let donorId: string | null = null;
      if (row.donor_name) {
        donorId = donorsByName.get(row.donor_name.trim().toLowerCase()) ?? null;
      }

      // Build fingerprint for the donation record
      const fp = [
        donorId ?? 'anon',
        row.txn_date,
        String(row.gross_amount_pence),
        row.reference ?? '',
      ].join('|');

      // Check duplicate
      const { data: existingDonation } = await supabase
        .from('donations')
        .select('id')
        .eq('organisation_id', orgId)
        .eq('fingerprint', fp)
        .limit(1);

      if (existingDonation && existingDonation.length > 0) continue;

      const { error: donErr } = await admin
        .from('donations')
        .insert({
          organisation_id: orgId,
          donor_id: donorId,
          donation_date: row.txn_date,
          amount_pence: row.gross_amount_pence,
          gross_amount_pence: row.gross_amount_pence,
          fee_amount_pence: row.fee_amount_pence,
          net_amount_pence: row.net_amount_pence,
          channel: 'online',
          source: provider,
          fund_id: defaultFundId,
          status: 'posted',
          provider_reference: row.reference ?? null,
          gift_aid_eligible: false,
          import_batch_id: importId,
          fingerprint: fp,
          created_by: user.id,
        });

      if (!donErr) donationsCreated++;
    } catch {
      // Non-critical — donation record creation failure should not block import
    }
  }

  // 10. Update import record with final counts
  await supabase
    .from('giving_imports')
    .update({
      inserted_count: insertedCount,
      skipped_count: skippedCount,
      error_count: errors.length,
      journals_created: journalsCreated,
    })
    .eq('id', importId);

  return {
    importId,
    total_rows: parsed.data.length,
    inserted_count: insertedCount,
    skipped_count: skippedCount,
    error_count: errors.length,
    journals_created: journalsCreated,
    sample_errors: errors.slice(0, 10),
  };
}

/* ------------------------------------------------------------------ */
/*  listGivingImports                                                  */
/* ------------------------------------------------------------------ */


export async function listGivingImports(
  orgId: string,
  provider?: GivingProvider
): Promise<{ data: GivingImportSummary[]; error: string | null }> {
  const supabase = await createClient();

  let query = supabase
    .from('giving_imports')
    .select('*')
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: false });

  if (provider) {
    query = query.eq('provider', provider);
  }

  const { data, error } = await query;

  if (error) return { data: [], error: error.message };

  const rows: GivingImportSummary[] = (data ?? []).map((d) => ({
    id: d.id,
    provider: d.provider,
    import_start: d.import_start,
    import_end: d.import_end,
    file_name: d.file_name,
    status: d.status,
    inserted_count: d.inserted_count,
    skipped_count: d.skipped_count,
    error_count: d.error_count,
    journals_created: d.journals_created,
    created_at: d.created_at,
  }));

  return { data: rows, error: null };
}

/* ------------------------------------------------------------------ */
/*  viewGivingImport                                                   */
/* ------------------------------------------------------------------ */


export async function viewGivingImport(importId: string): Promise<{
  import_record: GivingImportSummary | null;
  rows: GivingImportRowView[];
  error: string | null;
}> {
  const supabase = await createClient();

  const { data: record, error: recErr } = await supabase
    .from('giving_imports')
    .select('*')
    .eq('id', importId)
    .single();

  if (recErr || !record) {
    return { import_record: null, rows: [], error: recErr?.message ?? 'Not found.' };
  }

  const { data: rows, error: rowsErr } = await supabase
    .from('giving_import_rows')
    .select('id, txn_date, gross_amount_pence, fee_amount_pence, net_amount_pence, donor_name, reference, payout_reference')
    .eq('giving_import_id', importId)
    .order('txn_date', { ascending: true });

  if (rowsErr) {
    return { import_record: null, rows: [], error: rowsErr.message };
  }

  const importSummary: GivingImportSummary = {
    id: record.id,
    provider: record.provider,
    import_start: record.import_start,
    import_end: record.import_end,
    file_name: record.file_name,
    status: record.status,
    inserted_count: record.inserted_count,
    skipped_count: record.skipped_count,
    error_count: record.error_count,
    journals_created: record.journals_created,
    created_at: record.created_at,
  };

  const viewRows: GivingImportRowView[] = (rows ?? []).map((r) => ({
    id: r.id,
    txn_date: r.txn_date,
    gross_amount_pence: Number(r.gross_amount_pence),
    fee_amount_pence: Number(r.fee_amount_pence),
    net_amount_pence: Number(r.net_amount_pence),
    donor_name: r.donor_name,
    reference: r.reference,
    payout_reference: r.payout_reference,
  }));

  return { import_record: importSummary, rows: viewRows, error: null };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function emptyResult(errorMsg: string): GivingImportResult {
  return {
    importId: '',
    total_rows: 0,
    inserted_count: 0,
    skipped_count: 0,
    error_count: 1,
    journals_created: 0,
    sample_errors: [errorMsg],
  };
}
