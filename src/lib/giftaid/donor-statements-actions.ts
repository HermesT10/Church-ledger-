'use server';

import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { assertWriteAllowed } from '@/lib/demo';
import { getActiveOrg } from '@/lib/org';
import {
  assertCanExportGiftAid,
  PermissionError,
} from '@/lib/permissions';
import { logAuditEvent } from '@/lib/audit';
import {
  buildDonorStatementRows,
  type DonationForStatementRow,
} from './donor-statement-rows';
import {
  resolveDonorStatementPeriod,
  type DonorStatementPeriodType,
} from './donor-statement-periods';
import { renderDonorStatementPdf } from './donor-statement-pdf';

export interface DonorStatementRunListRow {
  id: string;
  period_start: string;
  period_end: string;
  period_type: string;
  label: string | null;
  status: string;
  created_at: string;
}

export interface DonorStatementListRow {
  id: string;
  run_id: string | null;
  donor_id: string;
  donor_name: string;
  period_start: string;
  period_end: string;
  label: string | null;
  pdf_path: string | null;
  email_sent_at: string | null;
  status: string;
  total_donations_pence: number | null;
  total_gift_aid_reclaimable_pence: number | null;
  created_at: string;
}

async function loadCharityBlock(orgId: string) {
  const admin = createAdminClient();
  const { data: org } = await admin
    .from('organisations')
    .select(
      'name, legal_name, charity_number, address_line1, address_line2, county, postcode, contact_email'
    )
    .eq('id', orgId)
    .maybeSingle();
  const { data: settings } = await admin
    .from('organisation_settings')
    .select('report_brand_name')
    .eq('organisation_id', orgId)
    .maybeSingle();

  const displayName =
    settings?.report_brand_name?.trim()
    || org?.legal_name?.trim()
    || org?.name?.trim()
    || 'Charity';

  const lines: string[] = [];
  if (org?.address_line1) lines.push(org.address_line1);
  if (org?.address_line2) lines.push(org.address_line2);
  const tail = [org?.county, org?.postcode].filter(Boolean).join(', ');
  if (tail) lines.push(tail);

  return {
    displayName,
    charityNumber: org?.charity_number ?? null,
    lines: lines.length > 0 ? lines : [displayName],
    contactEmail: org?.contact_email ?? null,
  };
}

function donorDisplayName(d: {
  display_name: string | null;
  full_name: string;
}): string {
  return d.display_name?.trim() || d.full_name;
}

function donorAddressLines(d: {
  house_name_or_number: string | null;
  address: string | null;
  postcode: string | null;
}): string[] {
  const parts = [d.house_name_or_number, d.address, d.postcode]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  return parts;
}

export async function generateDonorStatement(params: {
  donorId: string;
  period_type: DonorStatementPeriodType;
  anchor_year: number;
  custom_start?: string | null;
  custom_end?: string | null;
  include_address_on_pdf?: boolean;
}): Promise<{ data: { statementId: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return {
      data: null,
      error:
        e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('fiscal_year_start_month')
    .eq('organisation_id', orgId)
    .single();

  let resolved;
  try {
    resolved = resolveDonorStatementPeriod({
      period_type: params.period_type,
      anchor_year: params.anchor_year,
      custom_start: params.custom_start ?? null,
      custom_end: params.custom_end ?? null,
      fiscal_year_start_month: settings?.fiscal_year_start_month ?? 4,
    });
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Invalid period.',
    };
  }

  const result = await generateDonorStatementCore({
    workspaceId: orgId,
    runId: null,
    donorId: params.donorId,
    periodStart: resolved.period_start,
    periodEnd: resolved.period_end,
    periodLabel: resolved.label,
    includeAddressOnPdf: params.include_address_on_pdf !== false,
    userId: user.id,
  });

  return result.success
    ? { data: { statementId: result.statementId! }, error: null }
    : { data: null, error: result.error ?? 'Generation failed.' };
}

export async function bulkGenerateDonorStatements(params: {
  period_type: DonorStatementPeriodType;
  anchor_year: number;
  custom_start?: string | null;
  custom_end?: string | null;
}): Promise<{
  data: { runId: string; successCount: number; failCount: number } | null;
  error: string | null;
}> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return {
      data: null,
      error:
        e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('fiscal_year_start_month')
    .eq('organisation_id', orgId)
    .single();

  let resolved;
  try {
    resolved = resolveDonorStatementPeriod({
      period_type: params.period_type,
      anchor_year: params.anchor_year,
      custom_start: params.custom_start ?? null,
      custom_end: params.custom_end ?? null,
      fiscal_year_start_month: settings?.fiscal_year_start_month ?? 4,
    });
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Invalid period.',
    };
  }

  const admin = createAdminClient();
  const { data: donorRows } = await admin
    .from('donors')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('is_active', true);

  const donorIds = (donorRows ?? []).map((r) => r.id as string);
  if (donorIds.length === 0) {
    return { data: null, error: 'No active donors to include.' };
  }

  const { data: runRow, error: runErr } = await admin
    .from('donor_statement_runs')
    .insert({
      workspace_id: orgId,
      period_start: resolved.period_start,
      period_end: resolved.period_end,
      period_type: resolved.period_type,
      label: resolved.label,
      status: 'processing',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (runErr || !runRow) {
    return { data: null, error: runErr?.message ?? 'Could not create run.' };
  }

  const runId = runRow.id as string;
  let successCount = 0;
  let failCount = 0;

  for (const donorId of donorIds) {
    const out = await generateDonorStatementCore({
      workspaceId: orgId,
      runId,
      donorId,
      periodStart: resolved.period_start,
      periodEnd: resolved.period_end,
      periodLabel: resolved.label,
      includeAddressOnPdf: true,
      userId: user.id,
    });
    if (out.success) successCount += 1;
    else failCount += 1;
  }

  await admin
    .from('donor_statement_runs')
    .update({
      status: failCount === donorIds.length ? 'failed' : 'completed',
    })
    .eq('id', runId)
    .eq('workspace_id', orgId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'bulk_donor_statements_generated',
    entityType: 'donor_statement_run',
    entityId: runId,
    metadata: {
      successCount,
      failCount,
      period: resolved.label,
    },
  });

  return {
    data: { runId, successCount, failCount },
    error: null,
  };
}

async function generateDonorStatementCore(opts: {
  workspaceId: string;
  runId: string | null;
  donorId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  includeAddressOnPdf: boolean;
  userId: string;
}): Promise<
  | { success: true; statementId: string }
  | { success: false; error: string }
> {
  const admin = createAdminClient();

  const { data: donor, error: dErr } = await admin
    .from('donors')
    .select(
      'id, organisation_id, full_name, display_name, house_name_or_number, address, postcode'
    )
    .eq('id', opts.donorId)
    .eq('organisation_id', opts.workspaceId)
    .maybeSingle();

  if (dErr || !donor) {
    return { success: false, error: 'Donor not found.' };
  }

  const { data: rawDonations, error: donErr } = await admin
    .from('donations')
    .select(
      'id, donation_date, amount_pence, source, gift_aid_status, gift_aid_eligible, funds(name)'
    )
    .eq('organisation_id', opts.workspaceId)
    .eq('donor_id', opts.donorId)
    .eq('status', 'posted')
    .gte('donation_date', opts.periodStart)
    .lte('donation_date', opts.periodEnd);

  if (donErr) {
    return { success: false, error: donErr.message };
  }

  const donations: DonationForStatementRow[] = (rawDonations ?? []).map(
    (row) => {
      const fund = row.funds as { name?: string } | null;
      return {
        id: row.id as string,
        donation_date: row.donation_date as string,
        amount_pence: Number(row.amount_pence),
        source:
          typeof row.source === 'string' ? row.source : String(row.source ?? ''),
        gift_aid_status:
          row.gift_aid_status != null ? String(row.gift_aid_status) : null,
        gift_aid_eligible: row.gift_aid_eligible ?? null,
        fund_name: fund?.name ? String(fund.name) : null,
      };
    },
  );

  const computed = buildDonorStatementRows(donations);
  const charity = await loadCharityBlock(opts.workspaceId);

  const pdfBuffer = await renderDonorStatementPdf({
    donorName: donorDisplayName(donor),
    donorAddressLines: opts.includeAddressOnPdf
      ? donorAddressLines(donor)
      : [],
    periodLabel: opts.periodLabel,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    charity,
    rows: computed.rows,
    totalDonationsPence: computed.total_donations_pence,
    totalGiftAidPence: computed.total_gift_aid_reclaimable_pence,
  });

  const statementId = randomUUID();
  const storagePath = `${opts.workspaceId}/donor-statements/${statementId}.pdf`;

  const { error: upErr } = await admin.storage
    .from('gift-aid')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (upErr) {
    return { success: false, error: upErr.message };
  }

  const { error: insErr } = await admin.from('donor_statements').insert({
    id: statementId,
    workspace_id: opts.workspaceId,
    run_id: opts.runId,
    donor_id: opts.donorId,
    period_start: opts.periodStart,
    period_end: opts.periodEnd,
    pdf_path: storagePath,
    status: 'generated',
    total_donations_pence: computed.total_donations_pence,
    total_gift_aid_reclaimable_pence: computed.total_gift_aid_reclaimable_pence,
  });

  if (insErr) {
    await admin.storage.from('gift-aid').remove([storagePath]);
    return { success: false, error: insErr.message };
  }

  await logAuditEvent({
    orgId: opts.workspaceId,
    userId: opts.userId,
    action: 'donor_statement_generated',
    entityType: 'donor_statement',
    entityId: statementId,
    metadata: {
      donorId: opts.donorId,
      runId: opts.runId,
      period: opts.periodLabel,
    },
  });

  return { success: true, statementId };
}

export async function listDonorStatementRuns(): Promise<{
  data: DonorStatementRunListRow[];
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('donor_statement_runs')
    .select('id, period_start, period_end, period_type, label, status, created_at')
    .eq('workspace_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []).map((r) => ({
      id: r.id,
      period_start: r.period_start,
      period_end: r.period_end,
      period_type: r.period_type,
      label: r.label,
      status: r.status,
      created_at: r.created_at,
    })),
    error: null,
  };
}

function mapStatementListRow(r: Record<string, unknown>): DonorStatementListRow {
  const drRaw = r.donors as
    | { display_name?: string | null; full_name?: string }
    | Array<{ display_name?: string | null; full_name?: string }>
    | null;
  const dr = Array.isArray(drRaw) ? drRaw[0] : drRaw;
  const name = dr
    ? String(dr.display_name?.trim() || dr.full_name || 'Donor')
    : 'Donor';

  const runRaw = r.donor_statement_runs as
    | { label?: string | null }
    | Array<{ label?: string | null }>
    | null;
  const ru = Array.isArray(runRaw) ? runRaw[0] : runRaw;
  const runLabel = ru?.label ?? null;

  return {
    id: String(r.id),
    run_id: (r.run_id as string | null) ?? null,
    donor_id: String(r.donor_id),
    donor_name: name,
    period_start: String(r.period_start),
    period_end: String(r.period_end),
    label: runLabel,
    pdf_path: (r.pdf_path as string | null) ?? null,
    email_sent_at: (r.email_sent_at as string | null) ?? null,
    status: String(r.status),
    total_donations_pence:
      r.total_donations_pence != null ? Number(r.total_donations_pence) : null,
    total_gift_aid_reclaimable_pence:
      r.total_gift_aid_reclaimable_pence != null
        ? Number(r.total_gift_aid_reclaimable_pence)
        : null,
    created_at: String(r.created_at),
  };
}

export async function listDonorStatements(): Promise<{
  data: DonorStatementListRow[];
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('donor_statements')
    .select(
      `
      id, run_id, donor_id, period_start, period_end, pdf_path, email_sent_at, status,
      total_donations_pence, total_gift_aid_reclaimable_pence, created_at,
      donors ( full_name, display_name ),
      donor_statement_runs ( label )
    `
    )
    .eq('workspace_id', orgId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []).map((r) => mapStatementListRow(r as Record<string, unknown>)),
    error: null,
  };
}

export async function listDonorStatementsForDonor(donorId: string): Promise<{
  data: DonorStatementListRow[];
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('donor_statements')
    .select(
      `
      id, run_id, donor_id, period_start, period_end, pdf_path, email_sent_at, status,
      total_donations_pence, total_gift_aid_reclaimable_pence, created_at,
      donors ( full_name, display_name ),
      donor_statement_runs ( label )
    `
    )
    .eq('workspace_id', orgId)
    .eq('donor_id', donorId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []).map((r) => mapStatementListRow(r as Record<string, unknown>)),
    error: null,
  };
}

export async function getDonorStatementDownloadUrl(statementId: string): Promise<{
  url: string | null;
  fileName: string | null;
  error: string | null;
}> {
  const { orgId, role } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return {
      url: null,
      fileName: null,
      error:
        e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from('donor_statements')
    .select('id, donor_id, pdf_path, period_start, period_end, workspace_id')
    .eq('id', statementId)
    .eq('workspace_id', orgId)
    .maybeSingle();

  if (error || !row?.pdf_path) {
    return { url: null, fileName: null, error: error?.message ?? 'Not found.' };
  }

  const admin = createAdminClient();
  const { data: signed, error: signErr } = await admin.storage
    .from('gift-aid')
    .createSignedUrl(row.pdf_path, 600, {
      download: `donor-statement-${String(row.period_start).slice(0, 4)}.pdf`,
    });

  if (signErr || !signed?.signedUrl) {
    return {
      url: null,
      fileName: null,
      error: signErr?.message ?? 'Could not sign URL.',
    };
  }

  return {
    url: signed.signedUrl,
    fileName: `donor-statement-${statementId.slice(0, 8)}.pdf`,
    error: null,
  };
}

export async function recordDonorStatementMarkedSent(statementId: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('donor_statements')
    .update({
      email_sent_at: new Date().toISOString(),
      status: 'sent',
    })
    .eq('id', statementId)
    .eq('workspace_id', orgId);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'donor_statement_marked_sent',
      entityType: 'donor_statement',
      entityId: statementId,
      metadata: {},
    });
  }

  return { success: !error, error: error?.message ?? null };
}

/** Reserved for transactional email integrations — not wired in this repo yet. */
export async function sendDonorStatementEmail(_statementId: string): Promise<{
  success: boolean;
  sent: boolean;
  error: string | null;
}> {
  return {
    success: false,
    sent: false,
    error:
      'Automated email is not configured. Download the PDF and send it from your mail client, then use “Mark as sent”.',
  };
}
