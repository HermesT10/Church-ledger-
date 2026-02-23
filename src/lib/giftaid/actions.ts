'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertWriteAllowed } from '@/lib/demo';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { logAuditEvent } from '@/lib/audit';
import { invalidateOrgReportCache } from '@/lib/cache';
import { isDateInLockedPeriod } from '@/lib/periods/actions';
import type {
  GiftAidClaimRow,
  GiftAidClaimDetail,
  ClaimDonationRow,
  GiftAidDashboard,
  GiftAidDeclarationRow,
} from './types';
import {
  buildClaimPreview,
  buildGiftAidCsv,
  calculateClaimablePence,
  penceToPounds,
  type ClaimPreviewDonation,
  type ClaimPreviewResult,
  type EligibilityDeclaration,
  type GiftAidCsvRow,
} from './eligibility';

/* ------------------------------------------------------------------ */
/*  Approval event helper                                              */
/* ------------------------------------------------------------------ */

async function logGiftAidApprovalEvent(params: {
  orgId: string;
  entityId: string;
  action: string;
  performedBy: string;
  notes?: string;
}) {
  const supabase = await createClient();
  await supabase.from('approval_events').insert({
    organisation_id: params.orgId,
    entity_type: 'gift_aid_claim',
    entity_id: params.entityId,
    action: params.action,
    performed_by: params.performedBy,
    notes: params.notes ?? null,
  });
}

/* ================================================================== */
/*  CLAIM PREVIEW                                                      */
/* ================================================================== */

export async function getGiftAidClaimPreview(params: {
  organisationId: string;
  startDate: string;
  endDate: string;
}): Promise<{ data: ClaimPreviewResult | null; error: string | null }> {
  const { organisationId, startDate, endDate } = params;

  if (!organisationId || !startDate || !endDate) {
    return { data: null, error: 'Organisation ID, start date, and end date are required.' };
  }

  const supabase = await createClient();

  const { data: donations, error: donationsErr } = await supabase
    .from('donations')
    .select('id, donation_date, amount_pence, gift_aid_claim_id, donor_id, fund_id, donors(full_name, address, postcode)')
    .eq('organisation_id', organisationId)
    .eq('status', 'posted')
    .gte('donation_date', startDate)
    .lte('donation_date', endDate)
    .order('donation_date', { ascending: true });

  if (donationsErr) {
    return { data: null, error: donationsErr.message };
  }

  if (!donations || donations.length === 0) {
    return {
      data: buildClaimPreview([], startDate, endDate),
      error: null,
    };
  }

  const donorIds = new Set<string>();
  for (const d of donations) {
    if (d.donor_id) donorIds.add(d.donor_id);
  }

  let declarationsByDonor: Record<string, EligibilityDeclaration[]> = {};

  if (donorIds.size > 0) {
    const { data: declarations, error: declErr } = await supabase
      .from('gift_aid_declarations')
      .select('donor_id, start_date, end_date, is_active')
      .in('donor_id', Array.from(donorIds));

    if (declErr) {
      return { data: null, error: declErr.message };
    }

    for (const decl of declarations ?? []) {
      const did = decl.donor_id as string;
      if (!declarationsByDonor[did]) declarationsByDonor[did] = [];
      declarationsByDonor[did].push({
        start_date: decl.start_date,
        end_date: decl.end_date,
        is_active: decl.is_active,
      });
    }
  }

  const previewDonations: ClaimPreviewDonation[] = donations.map((d) => {
    const donor = d.donors as
      | { full_name: string; address: string | null; postcode: string | null }
      | { full_name: string; address: string | null; postcode: string | null }[]
      | null;

    const donorObj = Array.isArray(donor) ? donor[0] ?? null : donor;

    return {
      id: d.id,
      donation_date: d.donation_date,
      amount_pence: Number(d.amount_pence),
      gift_aid_claim_id: d.gift_aid_claim_id,
      donor: donorObj
        ? {
            full_name: donorObj.full_name,
            address: donorObj.address,
            postcode: donorObj.postcode,
          }
        : null,
      declarations: d.donor_id ? (declarationsByDonor[d.donor_id] ?? []) : [],
    };
  });

  const result = buildClaimPreview(previewDonations, startDate, endDate);

  return { data: result, error: null };
}

/* ================================================================== */
/*  CREATE CLAIM (atomic)                                              */
/* ================================================================== */

export async function createGiftAidClaim(params: {
  organisationId: string;
  startDate: string;
  endDate: string;
  donationIds: string[];
}): Promise<{ data: { claimId: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { organisationId, startDate, endDate, donationIds } = params;

  const { role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'create', 'gift_aid'); }
  catch (e) { return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  if (!donationIds || donationIds.length === 0) {
    return { data: null, error: 'No donations selected for the claim.' };
  }

  const supabase = await createClient();

  const { data: claimId, error: rpcErr } = await supabase.rpc(
    'create_gift_aid_claim',
    {
      p_organisation_id: organisationId,
      p_claim_start: startDate,
      p_claim_end: endDate,
      p_donation_ids: donationIds,
      p_created_by: user.id,
    }
  );

  if (rpcErr) {
    return { data: null, error: rpcErr.message };
  }

  const claimIdStr = claimId as string;

  // Compute and store totals + status
  const admin = createAdminClient();
  const { data: claimDonations } = await admin
    .from('donations')
    .select('amount_pence')
    .eq('gift_aid_claim_id', claimIdStr);

  const totalDonationsPence = (claimDonations ?? []).reduce(
    (s, d) => s + Number(d.amount_pence),
    0
  );
  const totalGiftAidPence = Math.round(totalDonationsPence * 0.25);

  await admin
    .from('gift_aid_claims')
    .update({
      status: 'draft',
      total_donations_pence: totalDonationsPence,
      total_gift_aid_pence: totalGiftAidPence,
    })
    .eq('id', claimIdStr);

  // Audit trail
  await logGiftAidApprovalEvent({
    orgId: organisationId,
    entityId: claimIdStr,
    action: 'created',
    performedBy: user.id,
    notes: `Period: ${startDate} to ${endDate}, ${donationIds.length} donation(s)`,
  });

  await logAuditEvent({
    orgId: organisationId,
    userId: user.id,
    action: 'create_gift_aid_claim',
    entityType: 'gift_aid_claim',
    entityId: claimIdStr,
  });

  return { data: { claimId: claimIdStr }, error: null };
}

/* ================================================================== */
/*  EXPORT CSV                                                         */
/* ================================================================== */

export async function exportGiftAidClaimCsv(params: {
  claimId: string;
}): Promise<{ data: string | null; error: string | null }> {
  const { claimId } = params;

  if (!claimId) {
    return { data: null, error: 'Claim ID is required.' };
  }

  const supabase = await createClient();

  const { data: donations, error: fetchErr } = await supabase
    .from('donations')
    .select('id, donation_date, amount_pence, donors(full_name, address, postcode)')
    .eq('gift_aid_claim_id', claimId)
    .order('donation_date', { ascending: true });

  if (fetchErr) {
    return { data: null, error: fetchErr.message };
  }

  if (!donations || donations.length === 0) {
    return { data: buildGiftAidCsv([]), error: null };
  }

  const rows: GiftAidCsvRow[] = donations.map((d) => {
    const donor = d.donors as
      | { full_name: string; address: string | null; postcode: string | null }
      | { full_name: string; address: string | null; postcode: string | null }[]
      | null;

    const donorObj = Array.isArray(donor) ? donor[0] ?? null : donor;
    const amountPence = Number(d.amount_pence);

    return {
      donorName: donorObj?.full_name ?? 'Anonymous',
      address: donorObj?.address ?? '',
      postcode: donorObj?.postcode ?? '',
      donationDate: d.donation_date,
      amountPounds: penceToPounds(amountPence),
      claimablePounds: penceToPounds(calculateClaimablePence(amountPence)),
    };
  });

  return { data: buildGiftAidCsv(rows), error: null };
}

/* ================================================================== */
/*  LIST CLAIMS                                                        */
/* ================================================================== */

export async function listGiftAidClaims(
  organisationId: string
): Promise<{ data: GiftAidClaimRow[] | null; error: string | null }> {
  const supabase = await createClient();

  const { data: claims, error: claimsErr } = await supabase
    .from('gift_aid_claims')
    .select('id, claim_start, claim_end, created_at, submitted_at, paid_at, reference, status, total_donations_pence, total_gift_aid_pence, journal_id')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });

  if (claimsErr) {
    return { data: null, error: claimsErr.message };
  }

  if (!claims || claims.length === 0) {
    return { data: [], error: null };
  }

  // For each claim, count donations and sum amounts
  const claimIds = claims.map((c) => c.id);
  const { data: donations, error: donErr } = await supabase
    .from('donations')
    .select('gift_aid_claim_id, amount_pence')
    .in('gift_aid_claim_id', claimIds);

  if (donErr) {
    return { data: null, error: donErr.message };
  }

  const agg: Record<string, { count: number; totalPence: number }> = {};
  for (const d of donations ?? []) {
    const cid = d.gift_aid_claim_id as string;
    if (!agg[cid]) agg[cid] = { count: 0, totalPence: 0 };
    agg[cid].count++;
    agg[cid].totalPence += Number(d.amount_pence);
  }

  const rows: GiftAidClaimRow[] = claims.map((c) => {
    const a = agg[c.id] ?? { count: 0, totalPence: 0 };
    return {
      id: c.id,
      claim_start: c.claim_start,
      claim_end: c.claim_end,
      created_at: c.created_at,
      submitted_at: c.submitted_at,
      paid_at: c.paid_at ?? null,
      reference: c.reference,
      status: (c.status as 'draft' | 'submitted' | 'paid') ?? 'draft',
      donation_count: a.count,
      eligible_amount_pence: a.totalPence,
      claimable_total_pence: c.total_gift_aid_pence
        ? Number(c.total_gift_aid_pence)
        : Math.round(a.totalPence * 0.25),
      journal_id: c.journal_id ?? null,
    };
  });

  return { data: rows, error: null };
}

/* ================================================================== */
/*  GET SINGLE CLAIM                                                   */
/* ================================================================== */

export async function getGiftAidClaim(claimId: string): Promise<{
  data: { claim: GiftAidClaimDetail; donations: ClaimDonationRow[] } | null;
  error: string | null;
}> {
  if (!claimId) {
    return { data: null, error: 'Claim ID is required.' };
  }

  const supabase = await createClient();

  const { data: claim, error: claimErr } = await supabase
    .from('gift_aid_claims')
    .select('id, claim_start, claim_end, created_at, submitted_at, paid_at, reference, created_by, status, journal_id, total_donations_pence, total_gift_aid_pence')
    .eq('id', claimId)
    .single();

  if (claimErr || !claim) {
    return { data: null, error: claimErr?.message ?? 'Claim not found.' };
  }

  const { data: donations, error: donErr } = await supabase
    .from('donations')
    .select('id, donation_date, amount_pence, fund_id, donors(full_name, address, postcode)')
    .eq('gift_aid_claim_id', claimId)
    .order('donation_date', { ascending: true });

  if (donErr) {
    return { data: null, error: donErr.message };
  }

  const donationRows: ClaimDonationRow[] = (donations ?? []).map((d) => {
    const donor = d.donors as
      | { full_name: string; address: string | null; postcode: string | null }
      | { full_name: string; address: string | null; postcode: string | null }[]
      | null;

    const donorObj = Array.isArray(donor) ? donor[0] ?? null : donor;
    const amountPence = Number(d.amount_pence);

    return {
      id: d.id,
      donation_date: d.donation_date,
      amount_pence: amountPence,
      donor_name: donorObj?.full_name ?? 'Anonymous',
      address: donorObj?.address ?? '',
      postcode: donorObj?.postcode ?? '',
      claimable_pence: calculateClaimablePence(amountPence),
      fund_id: d.fund_id ?? null,
    };
  });

  return {
    data: {
      claim: {
        id: claim.id,
        claim_start: claim.claim_start,
        claim_end: claim.claim_end,
        created_at: claim.created_at,
        submitted_at: claim.submitted_at,
        paid_at: claim.paid_at ?? null,
        reference: claim.reference,
        status: (claim.status as 'draft' | 'submitted' | 'paid') ?? 'draft',
        created_by: claim.created_by,
        journal_id: claim.journal_id ?? null,
        total_donations_pence: claim.total_donations_pence ? Number(claim.total_donations_pence) : null,
        total_gift_aid_pence: claim.total_gift_aid_pence ? Number(claim.total_gift_aid_pence) : null,
      },
      donations: donationRows,
    },
    error: null,
  };
}

/* ================================================================== */
/*  MARK CLAIM SUBMITTED                                               */
/* ================================================================== */

export async function markClaimSubmitted(
  claimId: string,
  reference: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'gift_aid'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  if (!claimId) {
    return { success: false, error: 'Claim ID is required.' };
  }

  const supabase = await createClient();

  // Verify claim exists and is in draft status
  const { data: claim } = await supabase
    .from('gift_aid_claims')
    .select('id, status')
    .eq('id', claimId)
    .single();

  if (!claim) {
    return { success: false, error: 'Claim not found.' };
  }

  if (claim.status === 'paid') {
    return { success: false, error: 'Claim has already been paid. Cannot change status.' };
  }

  const { error } = await supabase
    .from('gift_aid_claims')
    .update({
      submitted_at: new Date().toISOString(),
      reference: reference.trim() || null,
      status: 'submitted',
    })
    .eq('id', claimId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logGiftAidApprovalEvent({
    orgId,
    entityId: claimId,
    action: 'submitted',
    performedBy: user.id,
    notes: reference.trim() ? `HMRC ref: ${reference.trim()}` : undefined,
  });

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'submit_gift_aid_claim',
    entityType: 'gift_aid_claim',
    entityId: claimId,
  });

  return { success: true, error: null };
}

/* ================================================================== */
/*  RECORD HMRC PAYMENT — GL POSTING                                   */
/*  Creates a GL transaction: Debit Bank, Credit Gift Aid Income.      */
/*  Supports proportional fund allocation by default.                  */
/* ================================================================== */

export async function recordGiftAidPayment(params: {
  claimId: string;
  paymentDate: string;
  amountPence?: number;
}): Promise<{ success: boolean; journalId: string | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'gift_aid'); }
  catch (e) { return { success: false, journalId: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const { claimId, paymentDate } = params;

  if (!claimId || !paymentDate) {
    return { success: false, journalId: null, error: 'Claim ID and payment date are required.' };
  }

  // Period lock check
  const locked = await isDateInLockedPeriod(paymentDate);
  if (locked) {
    return { success: false, journalId: null, error: 'Payment date falls in a locked financial period.' };
  }

  const supabase = await createClient();

  // Fetch claim
  const { data: claim, error: claimErr } = await supabase
    .from('gift_aid_claims')
    .select('id, status, total_gift_aid_pence, organisation_id')
    .eq('id', claimId)
    .single();

  if (claimErr || !claim) {
    return { success: false, journalId: null, error: 'Claim not found.' };
  }

  if (claim.status === 'paid') {
    return { success: false, journalId: null, error: 'This claim has already been marked as paid.' };
  }

  if (claim.status !== 'submitted') {
    return { success: false, journalId: null, error: 'Claim must be submitted before recording payment.' };
  }

  const giftAidPence = params.amountPence
    ?? (claim.total_gift_aid_pence ? Number(claim.total_gift_aid_pence) : 0);

  if (giftAidPence <= 0) {
    return { success: false, journalId: null, error: 'Gift Aid amount must be positive.' };
  }

  // Fetch org settings for account mappings
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('gift_aid_income_account_id, gift_aid_bank_account_id, gift_aid_default_fund_id, gift_aid_use_proportional_funds')
    .eq('organisation_id', orgId)
    .single();

  if (!settings?.gift_aid_income_account_id) {
    return { success: false, journalId: null, error: 'Gift Aid Income account not configured. Set it in Settings.' };
  }

  if (!settings?.gift_aid_bank_account_id) {
    return { success: false, journalId: null, error: 'Gift Aid Bank account not configured. Set it in Settings.' };
  }

  const incomeAccountId = settings.gift_aid_income_account_id;
  const bankAccountId = settings.gift_aid_bank_account_id;
  const useProportionalFunds = settings.gift_aid_use_proportional_funds ?? true;
  const defaultFundId = settings.gift_aid_default_fund_id ?? null;

  // Build journal lines
  const admin = createAdminClient();

  // Determine fund allocation
  interface JournalLineInput {
    account_id: string;
    fund_id: string | null;
    description: string;
    debit_pence: number;
    credit_pence: number;
  }

  const journalLines: JournalLineInput[] = [];

  if (useProportionalFunds) {
    // Fetch donations for proportional split by fund
    const { data: claimDonations } = await admin
      .from('donations')
      .select('fund_id, amount_pence')
      .eq('gift_aid_claim_id', claimId);

    const fundTotals: Record<string, number> = {};
    let grandTotal = 0;

    for (const d of claimDonations ?? []) {
      const fid = d.fund_id ?? '__none__';
      fundTotals[fid] = (fundTotals[fid] ?? 0) + Number(d.amount_pence);
      grandTotal += Number(d.amount_pence);
    }

    if (grandTotal > 0) {
      let allocatedPence = 0;
      const fundEntries = Object.entries(fundTotals);

      for (let i = 0; i < fundEntries.length; i++) {
        const [fundKey, fundAmount] = fundEntries[i];
        const isLast = i === fundEntries.length - 1;
        const fundId = fundKey === '__none__' ? defaultFundId : fundKey;

        const portion = isLast
          ? giftAidPence - allocatedPence
          : Math.round((fundAmount / grandTotal) * giftAidPence);

        allocatedPence += portion;

        // Credit Gift Aid Income (per fund)
        journalLines.push({
          account_id: incomeAccountId,
          fund_id: fundId,
          description: 'Gift Aid reclaim — HMRC payment',
          debit_pence: 0,
          credit_pence: portion,
        });

        // Debit Bank (per fund)
        journalLines.push({
          account_id: bankAccountId,
          fund_id: fundId,
          description: 'Gift Aid reclaim — HMRC payment',
          debit_pence: portion,
          credit_pence: 0,
        });
      }
    }
  }

  // If no proportional lines built (or proportional disabled), create simple pair
  if (journalLines.length === 0) {
    journalLines.push(
      {
        account_id: bankAccountId,
        fund_id: defaultFundId,
        description: 'Gift Aid reclaim — HMRC payment',
        debit_pence: giftAidPence,
        credit_pence: 0,
      },
      {
        account_id: incomeAccountId,
        fund_id: defaultFundId,
        description: 'Gift Aid reclaim — HMRC payment',
        debit_pence: 0,
        credit_pence: giftAidPence,
      }
    );
  }

  // Create journal
  const memo = `Gift Aid HMRC Payment — Claim ${claimId.slice(0, 8)}`;

  const { data: journal, error: journalErr } = await admin
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: paymentDate,
      memo,
      status: 'draft',
      source_type: 'gift_aid',
      source_id: claimId,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (journalErr || !journal) {
    return { success: false, journalId: null, error: journalErr?.message ?? 'Failed to create journal.' };
  }

  // Insert journal lines
  const jRows = journalLines.map((jl) => ({
    journal_id: journal.id,
    organisation_id: orgId,
    account_id: jl.account_id,
    fund_id: jl.fund_id || null,
    description: jl.description,
    debit_pence: jl.debit_pence,
    credit_pence: jl.credit_pence,
  }));

  const { error: jLinesErr } = await admin.from('journal_lines').insert(jRows);

  if (jLinesErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    return { success: false, journalId: null, error: jLinesErr.message };
  }

  // Post the journal
  const { error: postErr } = await admin
    .from('journals')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', journal.id);

  if (postErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    return { success: false, journalId: null, error: postErr.message };
  }

  // Update claim status to paid
  const { error: claimUpdateErr } = await admin
    .from('gift_aid_claims')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      journal_id: journal.id,
    })
    .eq('id', claimId);

  if (claimUpdateErr) {
    return { success: false, journalId: journal.id, error: claimUpdateErr.message };
  }

  invalidateOrgReportCache(orgId);

  await logGiftAidApprovalEvent({
    orgId,
    entityId: claimId,
    action: 'paid',
    performedBy: user.id,
    notes: `Payment date: ${paymentDate}, amount: ${giftAidPence}p, journal: ${journal.id}`,
  });

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'record_gift_aid_payment',
    entityType: 'gift_aid_claim',
    entityId: claimId,
  });

  return { success: true, journalId: journal.id, error: null };
}

/* ================================================================== */
/*  DASHBOARD METRICS                                                  */
/* ================================================================== */

export async function getGiftAidDashboard(
  organisationId: string
): Promise<{ data: GiftAidDashboard | null; error: string | null }> {
  const supabase = await createClient();

  // Current fiscal year (default: Jan–Dec)
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('fiscal_year_start_month')
    .eq('organisation_id', organisationId)
    .single();

  const startMonth = settings?.fiscal_year_start_month ?? 1;
  const now = new Date();
  let yearStart: Date;
  if (now.getMonth() + 1 >= startMonth) {
    yearStart = new Date(now.getFullYear(), startMonth - 1, 1);
  } else {
    yearStart = new Date(now.getFullYear() - 1, startMonth - 1, 1);
  }
  const yearStartStr = yearStart.toISOString().slice(0, 10);

  // 1. Estimated reclaim this year: 25% of all eligible posted donations in current year
  const { data: eligibleDonations } = await supabase
    .from('donations')
    .select('amount_pence')
    .eq('organisation_id', organisationId)
    .eq('status', 'posted')
    .gte('donation_date', yearStartStr)
    .is('gift_aid_claim_id', null);

  // Filter: only donations where gift_aid_eligible might be true
  // For simplicity, count all unclaimed posted donations in the year
  const estimatedPence = (eligibleDonations ?? []).reduce(
    (s, d) => s + Math.round(Number(d.amount_pence) * 0.25),
    0
  );

  // 2. Claimed amount (total gift_aid_pence for all claims in the year)
  const { data: yearClaims } = await supabase
    .from('gift_aid_claims')
    .select('total_gift_aid_pence, status')
    .eq('organisation_id', organisationId)
    .gte('created_at', yearStart.toISOString());

  let claimedPence = 0;
  let paidPence = 0;
  for (const c of yearClaims ?? []) {
    const ga = c.total_gift_aid_pence ? Number(c.total_gift_aid_pence) : 0;
    claimedPence += ga;
    if (c.status === 'paid') paidPence += ga;
  }

  const outstandingPence = claimedPence - paidPence;

  // 3. Donors missing declarations
  const { data: allDonors } = await supabase
    .from('donors')
    .select('id')
    .eq('organisation_id', organisationId)
    .eq('is_active', true);

  const donorIds = (allDonors ?? []).map((d) => d.id);

  let donorsMissingDeclarations = 0;

  if (donorIds.length > 0) {
    const { data: declaredDonors } = await supabase
      .from('gift_aid_declarations')
      .select('donor_id')
      .in('donor_id', donorIds)
      .eq('is_active', true);

    const declaredSet = new Set((declaredDonors ?? []).map((d) => d.donor_id));
    donorsMissingDeclarations = donorIds.filter((id) => !declaredSet.has(id)).length;
  }

  // 4. Donations excluded (unclaimed + would-be-ineligible for current year)
  // We count unclaimed donations in the year that are NOT eligible
  // (For dashboard purposes: donations posted this year with no claim and no active declaration)
  const donationsExcluded = (eligibleDonations ?? []).length;
  // We already have the unclaimed count; the excluded = total unclaimed in year
  // This is a simplification; ideally we'd run full eligibility checks

  return {
    data: {
      estimatedReclaimThisYearPence: estimatedPence,
      claimedAmountPence: claimedPence,
      outstandingReclaimPence: outstandingPence,
      paidAmountPence: paidPence,
      donorsMissingDeclarations,
      donationsExcluded,
    },
    error: null,
  };
}

/* ================================================================== */
/*  DECLARATION MANAGEMENT                                             */
/* ================================================================== */

export async function listDeclarations(
  organisationId: string
): Promise<{ data: GiftAidDeclarationRow[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('gift_aid_declarations')
    .select('id, donor_id, start_date, end_date, is_active, declaration_date, hmrc_version, template_version, attachment_url, created_at, donors(full_name)')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  const rows: GiftAidDeclarationRow[] = (data ?? []).map((d) => {
    const donor = d.donors as { full_name: string } | { full_name: string }[] | null;
    const donorObj = Array.isArray(donor) ? donor[0] ?? null : donor;

    return {
      id: d.id,
      donor_id: d.donor_id,
      donor_name: donorObj?.full_name ?? 'Unknown',
      start_date: d.start_date,
      end_date: d.end_date,
      is_active: d.is_active,
      declaration_date: d.declaration_date,
      hmrc_version: d.hmrc_version,
      template_version: d.template_version,
      attachment_url: d.attachment_url,
      created_at: d.created_at,
    };
  });

  return { data: rows, error: null };
}

export async function createDeclaration(params: {
  donorId: string;
  startDate: string;
  endDate: string | null;
  declarationDate: string;
  hmrcVersion?: string;
  templateVersion?: string;
  attachmentUrl?: string;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'create', 'gift_aid'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  const { error } = await supabase.from('gift_aid_declarations').insert({
    donor_id: params.donorId,
    organisation_id: orgId,
    start_date: params.startDate,
    end_date: params.endDate || null,
    is_active: true,
    declaration_date: params.declarationDate,
    hmrc_version: params.hmrcVersion ?? null,
    template_version: params.templateVersion ?? null,
    attachment_url: params.attachmentUrl ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_gift_aid_declaration',
    entityType: 'gift_aid_declaration',
    entityId: params.donorId,
  });

  return { success: true, error: null };
}

export async function deactivateDeclaration(
  declarationId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'gift_aid'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { error } = await supabase
    .from('gift_aid_declarations')
    .update({ is_active: false, end_date: new Date().toISOString().slice(0, 10) })
    .eq('id', declarationId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'deactivate_gift_aid_declaration',
    entityType: 'gift_aid_declaration',
    entityId: declarationId,
  });

  return { success: true, error: null };
}

export async function reactivateDeclaration(
  declarationId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'gift_aid'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { error } = await supabase
    .from('gift_aid_declarations')
    .update({ is_active: true, end_date: null })
    .eq('id', declarationId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'reactivate_gift_aid_declaration',
    entityType: 'gift_aid_declaration',
    entityId: declarationId,
  });

  return { success: true, error: null };
}

/** Upload a declaration file to Supabase Storage and return the public URL. */
export async function uploadDeclarationFile(
  formData: FormData
): Promise<{ url: string | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId } = await getActiveOrg();

  const file = formData.get('file') as File | null;
  if (!file) {
    return { url: null, error: 'No file provided.' };
  }

  const supabase = await createClient();
  const ext = file.name.split('.').pop() ?? 'pdf';
  const path = `${orgId}/declarations/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('gift-aid')
    .upload(path, file, { upsert: false });

  if (uploadErr) {
    return { url: null, error: uploadErr.message };
  }

  const { data: urlData } = supabase.storage.from('gift-aid').getPublicUrl(path);

  return { url: urlData?.publicUrl ?? null, error: null };
}

/* ================================================================== */
/*  GET APPROVAL HISTORY                                               */
/* ================================================================== */

export async function getGiftAidApprovalHistory(
  claimId: string
): Promise<{ data: { action: string; performed_by: string; notes: string | null; created_at: string }[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('approval_events')
    .select('action, performed_by, notes, created_at')
    .eq('entity_type', 'gift_aid_claim')
    .eq('entity_id', claimId)
    .order('created_at', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: data ?? [], error: null };
}

/* ================================================================== */
/*  DONOR SOFT-DELETE                                                   */
/* ================================================================== */

export async function archiveDonor(
  donorId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'donations'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { error } = await supabase
    .from('donors')
    .update({ is_active: false })
    .eq('id', donorId);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'archive_donor',
      entityType: 'donor',
      entityId: donorId,
    });
  }

  return { success: !error, error: error?.message ?? null };
}

export async function unarchiveDonor(
  donorId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'donations'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { error } = await supabase
    .from('donors')
    .update({ is_active: true })
    .eq('id', donorId);

  return { success: !error, error: error?.message ?? null };
}
