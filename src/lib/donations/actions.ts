'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { invalidateOrgReportCache } from '@/lib/cache';
import { logAuditEvent } from '@/lib/audit';
import {
  getFinancialPeriodIdForDate,
  isDateInLockedPeriod,
} from '@/lib/periods/actions';
import {
  validateDonation,
  buildDonationJournalLines,
  donationFingerprint,
} from './validation';
import type {
  DonationRow,
  DonationsDashboard,
  DonationChannel,
  RecurringDonationRow,
  RecurringFrequency,
  RecurringStatus,
} from './types';

/* ================================================================== */
/*  CREATE DONATION                                                    */
/* ================================================================== */

export async function createDonation(params: {
  donorId: string | null;
  donationDate: string;
  channel: DonationChannel;
  fundId: string | null;
  grossAmountPence: number;
  feeAmountPence: number;
  providerReference?: string | null;
  giftAidEligible?: boolean;
}): Promise<{ data: { id: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'create', 'donations');
    assertCanPerform(role, 'post', 'donations');
  }
  catch (e) { return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const netAmountPence = params.grossAmountPence - params.feeAmountPence;

  const validation = validateDonation({
    gross_amount_pence: params.grossAmountPence,
    fee_amount_pence: params.feeAmountPence,
    net_amount_pence: netAmountPence,
    donation_date: params.donationDate,
    channel: params.channel,
    source: 'manual',
    donor_id: params.donorId,
    fund_id: params.fundId,
    provider_reference: params.providerReference,
    gift_aid_eligible: params.giftAidEligible,
  });

  if (!validation.valid) {
    return { data: null, error: validation.errors.join(' ') };
  }

  // Period lock check
  const locked = await isDateInLockedPeriod(params.donationDate);
  if (locked) return { data: null, error: 'Donation date falls in a locked financial period.' };

  // Validate fund is active
  if (params.fundId) {
    const supabase = await createClient();
    const { data: fund } = await supabase
      .from('funds')
      .select('is_active')
      .eq('id', params.fundId)
      .single();
    if (fund && !fund.is_active) {
      return { data: null, error: 'Cannot donate to an inactive fund.' };
    }
  }

  // Get donation settings
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('default_donations_income_account_id, default_donations_bank_account_id, default_donations_fee_account_id')
    .eq('organisation_id', orgId)
    .single();

  const incomeAccountId = settings?.default_donations_income_account_id;
  const bankAccountId = settings?.default_donations_bank_account_id;
  const feeAccountId = settings?.default_donations_fee_account_id;

  if (!incomeAccountId || !bankAccountId) {
    return { data: null, error: 'Donations income and bank accounts must be configured in Settings before recording donations.' };
  }

  // Duplicate check
  const fp = donationFingerprint({
    donorId: params.donorId,
    donationDate: params.donationDate,
    grossAmountPence: params.grossAmountPence,
    providerReference: params.providerReference ?? null,
  });

  const { data: existing } = await supabase
    .from('donations')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('fingerprint', fp)
    .limit(1);

  if (existing && existing.length > 0) {
    return { data: null, error: 'A donation with the same donor, date, amount, and reference already exists.' };
  }

  // Build GL entries
  const donorDesc = params.donorId ? 'donor donation' : 'anonymous donation';
  const journalLines = buildDonationJournalLines({
    grossAmountPence: params.grossAmountPence,
    feeAmountPence: params.feeAmountPence,
    netAmountPence,
    bankAccountId,
    donationsIncomeAccountId: incomeAccountId,
    feeAccountId: params.feeAmountPence > 0 ? feeAccountId : null,
    fundId: params.fundId,
    description: donorDesc,
  });
  const periodId = await getFinancialPeriodIdForDate(params.donationDate);

  const admin = createAdminClient();

  // Create journal
  const { data: journal, error: journalErr } = await admin
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: params.donationDate,
      memo: `Donation: ${donorDesc}`,
      status: 'draft',
      period_id: periodId,
      source_type: 'donation',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (journalErr || !journal) {
    return { data: null, error: journalErr?.message ?? 'Failed to create journal.' };
  }

  const jRows = journalLines.map((jl) => ({
    journal_id: journal.id,
    organisation_id: orgId,
    account_id: jl.account_id,
    fund_id: jl.fund_id || null,
    description: jl.description,
    debit_pence: jl.debit_pence,
    credit_pence: jl.credit_pence,
  }));

  const { error: jlErr } = await admin.from('journal_lines').insert(jRows);
  if (jlErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    return { data: null, error: jlErr.message };
  }

  // Post journal
  const { error: postErr } = await admin
    .from('journals')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', journal.id);

  if (postErr) {
    await admin.from('journal_lines').delete().eq('journal_id', journal.id);
    await admin.from('journals').delete().eq('id', journal.id);
    return { data: null, error: postErr.message };
  }

  // Create donation record
  const { data: donation, error: donErr } = await supabase
    .from('donations')
    .insert({
      organisation_id: orgId,
      donor_id: params.donorId || null,
      donation_date: params.donationDate,
      amount_pence: params.grossAmountPence,
      gross_amount_pence: params.grossAmountPence,
      fee_amount_pence: params.feeAmountPence,
      net_amount_pence: netAmountPence,
      channel: params.channel,
      source: 'manual',
      fund_id: params.fundId || null,
      journal_id: journal.id,
      status: 'posted',
      provider_reference: params.providerReference || null,
      gift_aid_eligible: params.giftAidEligible ?? false,
      fingerprint: fp,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (donErr || !donation) {
    return { data: null, error: donErr?.message ?? 'Failed to create donation record.' };
  }

  // Update journal source_id
  await admin.from('journals').update({ source_id: donation.id }).eq('id', journal.id);

  invalidateOrgReportCache(orgId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_donation',
    entityType: 'donation',
    entityId: donation.id,
  });

  return { data: { id: donation.id }, error: null };
}

/* ================================================================== */
/*  LIST DONATIONS                                                     */
/* ================================================================== */

export async function listDonations(
  orgId: string,
  options?: {
    page?: number;
    pageSize?: number;
    channel?: DonationChannel;
    fundId?: string;
    donorId?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<{ data: DonationRow[]; total: number; error: string | null }> {
  const supabase = await createClient();
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('donations')
    .select('id, organisation_id, donor_id, donation_date, channel, source, fund_id, gross_amount_pence, fee_amount_pence, net_amount_pence, provider_reference, gift_aid_eligible, gift_aid_claim_id, import_batch_id, journal_id, status, created_at, donors(full_name), funds(name)', { count: 'exact' })
    .eq('organisation_id', orgId)
    .order('donation_date', { ascending: false })
    .range(from, to);

  if (options?.channel) query = query.eq('channel', options.channel);
  if (options?.fundId) query = query.eq('fund_id', options.fundId);
  if (options?.donorId) query = query.eq('donor_id', options.donorId);
  if (options?.startDate) query = query.gte('donation_date', options.startDate);
  if (options?.endDate) query = query.lte('donation_date', options.endDate);

  const { data, error, count } = await query;

  if (error) return { data: [], total: 0, error: error.message };

  const rows: DonationRow[] = (data ?? []).map((d) => {
    const donor = d.donors as unknown as { full_name: string } | null;
    const fund = d.funds as unknown as { name: string } | null;
    return {
      id: d.id,
      organisation_id: d.organisation_id,
      donor_id: d.donor_id,
      donor_name: donor?.full_name ?? null,
      donation_date: d.donation_date,
      channel: (d.channel ?? 'other') as DonationChannel,
      source: d.source,
      fund_id: d.fund_id,
      fund_name: fund?.name ?? null,
      gross_amount_pence: Number(d.gross_amount_pence ?? d.net_amount_pence ?? 0),
      fee_amount_pence: Number(d.fee_amount_pence ?? 0),
      net_amount_pence: Number(d.net_amount_pence ?? d.gross_amount_pence ?? 0),
      provider_reference: d.provider_reference,
      gift_aid_eligible: d.gift_aid_eligible,
      gift_aid_claim_id: d.gift_aid_claim_id,
      import_batch_id: d.import_batch_id,
      journal_id: d.journal_id,
      status: d.status as 'draft' | 'posted',
      created_at: d.created_at,
    };
  });

  return { data: rows, total: count ?? 0, error: null };
}

/* ================================================================== */
/*  GET DONATION                                                       */
/* ================================================================== */

export async function getDonation(
  donationId: string
): Promise<{ data: DonationRow | null; error: string | null }> {
  const supabase = await createClient();

  const { data: d, error } = await supabase
    .from('donations')
    .select('*, donors(full_name), funds(name)')
    .eq('id', donationId)
    .single();

  if (error || !d) return { data: null, error: error?.message ?? 'Not found.' };

  const donor = d.donors as unknown as { full_name: string } | null;
  const fund = d.funds as unknown as { name: string } | null;

  return {
    data: {
      id: d.id,
      organisation_id: d.organisation_id,
      donor_id: d.donor_id,
      donor_name: donor?.full_name ?? null,
      donation_date: d.donation_date,
      channel: (d.channel ?? 'other') as DonationChannel,
      source: d.source,
      fund_id: d.fund_id,
      fund_name: fund?.name ?? null,
      gross_amount_pence: Number(d.gross_amount_pence ?? 0),
      fee_amount_pence: Number(d.fee_amount_pence ?? 0),
      net_amount_pence: Number(d.net_amount_pence ?? 0),
      provider_reference: d.provider_reference,
      gift_aid_eligible: d.gift_aid_eligible,
      gift_aid_claim_id: d.gift_aid_claim_id,
      import_batch_id: d.import_batch_id,
      journal_id: d.journal_id,
      status: d.status as 'draft' | 'posted',
      created_at: d.created_at,
    },
    error: null,
  };
}

/* ================================================================== */
/*  DASHBOARD                                                          */
/* ================================================================== */

export async function getDonationsDashboard(
  orgId: string
): Promise<{ data: DonationsDashboard | null; error: string | null }> {
  const supabase = await createClient();
  const now = new Date();

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = now.toISOString().slice(0, 10);
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const yearEnd = now.toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('get_donations_dashboard', {
    p_org_id: orgId,
    p_month_start: monthStart,
    p_month_end: monthEnd,
    p_year_start: yearStart,
    p_year_end: yearEnd,
  });

  if (error) return { data: null, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { data: null, error: 'No data returned.' };

  return {
    data: {
      totalThisMonthPence: Number(row.month_total_pence),
      totalYtdPence: Number(row.ytd_total_pence),
      onlinePence: Number(row.online_total_pence),
      cashPence: Number(row.cash_total_pence),
      recurringTotalPence: Number(row.recurring_total_pence),
      giftAidEstimatePence: Math.round(Number(row.gift_aid_eligible_pence) * 0.25),
      platformFeesPence: Number(row.fees_total_pence),
      donationCount: Number(row.donation_count),
      donorCount: Number(row.donor_count),
    },
    error: null,
  };
}

/* ================================================================== */
/*  RECURRING DONATIONS                                                */
/* ================================================================== */

export async function listRecurringDonations(
  orgId: string
): Promise<{ data: RecurringDonationRow[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('recurring_donations')
    .select('id, donor_id, fund_id, amount_pence, frequency, next_due_date, channel, provider_reference, status, created_at, donors(full_name), funds(name)')
    .eq('organisation_id', orgId)
    .order('status')
    .order('next_due_date', { ascending: true });

  if (error) return { data: [], error: error.message };

  return {
    data: (data ?? []).map((r) => {
      const donor = r.donors as unknown as { full_name: string } | null;
      const fund = r.funds as unknown as { name: string } | null;
      return {
        id: r.id,
        donor_id: r.donor_id,
        donor_name: donor?.full_name ?? null,
        fund_id: r.fund_id,
        fund_name: fund?.name ?? null,
        amount_pence: Number(r.amount_pence),
        frequency: r.frequency as RecurringFrequency,
        next_due_date: r.next_due_date,
        channel: (r.channel ?? 'direct_debit') as DonationChannel,
        provider_reference: r.provider_reference,
        status: r.status as RecurringStatus,
        created_at: r.created_at,
      };
    }),
    error: null,
  };
}

export async function createRecurringDonation(params: {
  donorId: string;
  fundId: string | null;
  amountPence: number;
  frequency: RecurringFrequency;
  nextDueDate: string | null;
  channel: DonationChannel;
  providerReference?: string;
}): Promise<{ data: { id: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'create', 'donations'); }
  catch (e) { return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  if (params.amountPence <= 0) return { data: null, error: 'Amount must be positive.' };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('recurring_donations')
    .insert({
      organisation_id: orgId,
      donor_id: params.donorId,
      fund_id: params.fundId || null,
      amount_pence: params.amountPence,
      frequency: params.frequency,
      next_due_date: params.nextDueDate || null,
      channel: params.channel,
      provider_reference: params.providerReference || null,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !data) return { data: null, error: error?.message ?? 'Failed to create.' };
  return { data: { id: data.id }, error: null };
}

export async function updateRecurringDonationStatus(
  recurringId: string,
  status: RecurringStatus
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'donations'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { error } = await supabase
    .from('recurring_donations')
    .update({ status })
    .eq('id', recurringId);

  return { error: error?.message ?? null };
}
