'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { invalidateOrgReportCache } from '@/lib/cache';
import { logAuditEvent } from '@/lib/audit';
import { isDateInLockedPeriod } from '@/lib/periods/actions';
import {
  buildMatchCandidate,
  rankCandidates,
  type MatchCandidate,
} from './matching';
import {
  computeClearingBalances,
  type ClearingProviderRow,
  type JournalLineInput,
  type ProviderClearingMap,
} from './clearingReport';
import { assertWriteAllowed } from '@/lib/demo';
import { logServerFailure } from '@/lib/monitoring';
import { validateBankLedgerLink } from '@/lib/banking/ledger-link';
import {
  assessDonationGiftAidForReconciliation,
  GIFT_AID_DECLARATION_MISSING_ALERT,
} from '@/lib/giftaid/donation-reconciliation';
import {
  DEFAULT_DECLARATION_LINK_EXPIRY_DAYS,
  buildDeclarationLinkExpiry,
  generateDeclarationLinkToken,
  hashDeclarationLinkToken,
} from '@/lib/giftaid/self-service-declarations';
import {
  normalizeDonorMatchAlias,
  scoreDonorMatchesForBankTransaction,
  type BankDonorMatchRecurringHint,
} from '@/lib/giftaid/bank-donor-matching';
import type {
  UnreconciledBankLine,
  ReconciledBankLine,
  ReconciliationStats,
  ReconciliationRow,
  ReconciliationWithMeta,
  ClearableBankLine,
  ReconciliationSummary,
  GLReconciliationData,
} from './types';
import type { BankDonationDonorSuggestion } from './actions.types';

type ReconcileDonationQuickCreateDonor = {
  fullName: string;
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  houseNameOrNumber?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  townCity?: string | null;
  postcode?: string | null;
  email?: string | null;
};

function buildDeclarationUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return `${baseUrl.replace(/\/$/, '')}/gift-aid/declaration/${token}`;
}

async function upsertGiftAidDeclarationRequest(params: {
  admin: ReturnType<typeof createAdminClient>;
  orgId: string;
  donorId: string;
  donationId: string;
  userId: string;
}) {
  const { data: existing } = await params.admin
    .from('gift_aid_declaration_requests')
    .select('id')
    .eq('workspace_id', params.orgId)
    .eq('donor_id', params.donorId)
    .in('status', ['needed', 'link_generated', 'sent'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await params.admin
      .from('gift_aid_declaration_requests')
      .update({ donation_id: params.donationId })
      .eq('id', existing.id)
      .eq('workspace_id', params.orgId);
    return existing.id as string;
  }

  const { data: request } = await params.admin
    .from('gift_aid_declaration_requests')
    .insert({
      workspace_id: params.orgId,
      donor_id: params.donorId,
      donation_id: params.donationId,
      status: 'needed',
      request_reason: 'missing_declaration',
      created_by: params.userId,
    })
    .select('id')
    .maybeSingle();

  return (request?.id as string | null | undefined) ?? null;
}

async function generateGiftAidDeclarationLinkForRequest(params: {
  admin: ReturnType<typeof createAdminClient>;
  orgId: string;
  donorId: string;
  donationId: string;
  requestId: string | null;
  donorEmail: string | null;
  userId: string;
}) {
  if (!params.donorEmail) {
    return {
      declarationLinkUrl: null,
      warning: 'Gift Aid follow-up was added, but no declaration link was generated because the donor has no email address.',
    };
  }

  const token = generateDeclarationLinkToken();
  const expiresAt = buildDeclarationLinkExpiry(DEFAULT_DECLARATION_LINK_EXPIRY_DAYS);
  const { data: link } = await params.admin
    .from('gift_aid_declaration_links')
    .insert({
      workspace_id: params.orgId,
      donor_id: params.donorId,
      declaration_id: null,
      token_hash: hashDeclarationLinkToken(token),
      status: 'active',
      expires_at: expiresAt.toISOString(),
      created_by: params.userId,
    })
    .select('id')
    .single();

  if (!link) {
    return { declarationLinkUrl: null, warning: 'Gift Aid follow-up was added, but the declaration link could not be generated.' };
  }

  if (params.requestId) {
    await params.admin
      .from('gift_aid_declaration_requests')
      .update({
        declaration_link_id: link.id,
        status: 'link_generated',
      })
      .eq('id', params.requestId)
      .eq('workspace_id', params.orgId);
  }

  await logAuditEvent({
    orgId: params.orgId,
    userId: params.userId,
    action: 'gift_aid_declaration_link_generated',
    entityType: 'gift_aid_declaration_link',
    entityId: link.id,
    metadata: { donorId: params.donorId, donationId: params.donationId, source: 'bank_reconciliation' },
  });

  return { declarationLinkUrl: buildDeclarationUrl(token), warning: null };
}

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/* ------------------------------------------------------------------ */
/*  getUnreconciledBankLines                                           */
/* ------------------------------------------------------------------ */

export async function getUnreconciledBankLines(
  bankAccountId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{ data: UnreconciledBankLine[]; error: string | null }> {
  const supabase = await createClient();

  // Get all bank line IDs that ARE matched
  const { data: matches } = await supabase
    .from('bank_reconciliation_matches')
    .select('bank_line_id')
    .not('bank_line_id', 'is', null);

  const matchedIds = new Set((matches ?? []).map((m) => m.bank_line_id));

  // Fetch all bank lines for this account
  let query = supabase
    .from('bank_lines')
    .select('id, txn_date, description, reference, amount_pence, balance_pence, status, reconciled, allocated, posted_journal_id')
    .eq('bank_account_id', bankAccountId)
    .eq('reconciled', false)
    .eq('allocated', false)
    .is('posted_journal_id', null)
    .not('status', 'in', '("excluded","duplicate","matched","reconciled")')
    .order('txn_date', { ascending: false });

  if (dateFrom) query = query.gte('txn_date', dateFrom);
  if (dateTo) query = query.lte('txn_date', dateTo);

  const { data, error } = await query;

  if (error) return { data: [], error: error.message };

  // Filter out matched lines
  const unreconciled = (data ?? [])
    .filter((bl) => !matchedIds.has(bl.id))
    .map((bl) => ({
      id: bl.id,
      txn_date: bl.txn_date,
      description: bl.description,
      reference: bl.reference,
      amount_pence: Number(bl.amount_pence),
      balance_pence: bl.balance_pence != null ? Number(bl.balance_pence) : null,
    }));

  return { data: unreconciled, error: null };
}

/* ------------------------------------------------------------------ */
/*  getReconciledBankLines                                             */
/* ------------------------------------------------------------------ */

export async function getReconciledBankLines(
  bankAccountId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{ data: ReconciledBankLine[]; error: string | null }> {
  const supabase = await createClient();

  // Get matched bank lines with their match info
  let query = supabase
    .from('bank_lines')
    .select('id, txn_date, description, reference, amount_pence')
    .eq('bank_account_id', bankAccountId)
    .order('txn_date', { ascending: false });

  if (dateFrom) query = query.gte('txn_date', dateFrom);
  if (dateTo) query = query.lte('txn_date', dateTo);

  const { data: bankLines, error: blErr } = await query;
  if (blErr) return { data: [], error: blErr.message };

  const blIds = (bankLines ?? []).map((bl) => bl.id);
  if (blIds.length === 0) return { data: [], error: null };

  // Fetch matches for these bank lines
  const { data: matches, error: mErr } = await supabase
    .from('bank_reconciliation_matches')
    .select('id, bank_line_id, journal_id, match_type, provider')
    .in('bank_line_id', blIds);

  if (mErr) return { data: [], error: mErr.message };

  const matchMap = new Map(
    (matches ?? []).map((m) => [m.bank_line_id, m])
  );

  // Fetch journal info for matched journals
  const journalIds = (matches ?? []).map((m) => m.journal_id);
  const journalMap = new Map<string, { memo: string | null; journal_date: string }>();
  if (journalIds.length > 0) {
    const { data: journals } = await supabase
      .from('journals')
      .select('id, memo, journal_date')
      .in('id', journalIds);

    for (const j of journals ?? []) {
      journalMap.set(j.id, { memo: j.memo, journal_date: j.journal_date });
    }
  }

  // Build reconciled rows
  const reconciled: ReconciledBankLine[] = [];
  for (const bl of bankLines ?? []) {
    const match = matchMap.get(bl.id);
    if (!match) continue;

    const journal = journalMap.get(match.journal_id);
    reconciled.push({
      id: bl.id,
      txn_date: bl.txn_date,
      description: bl.description,
      reference: bl.reference,
      amount_pence: Number(bl.amount_pence),
      match_id: match.id,
      match_type: match.match_type,
      match_provider: match.provider,
      journal_id: match.journal_id,
      journal_memo: journal?.memo ?? null,
      journal_date: journal?.journal_date ?? null,
    });
  }

  return { data: reconciled, error: null };
}

/* ------------------------------------------------------------------ */
/*  suggestMatches                                                     */
/* ------------------------------------------------------------------ */

export async function suggestMatches(
  bankLineId: string
): Promise<{ data: MatchCandidate[]; error: string | null }> {
  const supabase = await createClient();

  // 1. Fetch the bank line
  const { data: bankLine, error: blErr } = await supabase
    .from('bank_lines')
    .select('id, txn_date, description, reference, amount_pence, organisation_id')
    .eq('id', bankLineId)
    .single();

  if (blErr || !bankLine) {
    return { data: [], error: blErr?.message ?? 'Bank line not found.' };
  }

  const orgId = bankLine.organisation_id as string;

  // 2. Fetch already-matched journal IDs (exclude them from candidates)
  const { data: existingMatches } = await supabase
    .from('bank_reconciliation_matches')
    .select('journal_id')
    .eq('organisation_id', orgId);

  const matchedJournalIds = new Set(
    (existingMatches ?? []).map((m) => m.journal_id)
  );

  // 3. Fetch posted journals within ±14 days
  const bankDate = new Date(bankLine.txn_date);
  const dateFrom = new Date(bankDate.getTime() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const dateTo = new Date(bankDate.getTime() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data: journals, error: jErr } = await supabase
    .from('journals')
    .select('id, journal_date, memo')
    .eq('organisation_id', orgId)
    .eq('status', 'posted')
    .gte('journal_date', dateFrom)
    .lte('journal_date', dateTo);

  if (jErr) return { data: [], error: jErr.message };

  const candidateJournals = (journals ?? []).filter(
    (j) => !matchedJournalIds.has(j.id)
  );

  if (candidateJournals.length === 0) {
    return { data: [], error: null };
  }

  // 4. For each candidate journal, compute the relevant amount
  //    For incoming bank lines (positive amount): look for Dr Bank lines
  //    For outgoing bank lines (negative amount): look for Cr Bank lines
  const journalIds = candidateJournals.map((j) => j.id);
  const { data: jLines, error: jlErr } = await supabase
    .from('journal_lines')
    .select('journal_id, debit_pence, credit_pence')
    .in('journal_id', journalIds);

  if (jlErr) return { data: [], error: jlErr.message };

  // Sum total debits per journal (represents the journal's total movement)
  const journalAmountMap = new Map<string, number>();
  for (const jl of jLines ?? []) {
    const current = journalAmountMap.get(jl.journal_id) ?? 0;
    journalAmountMap.set(
      jl.journal_id,
      current + Number(jl.debit_pence)
    );
  }

  // 5. Score and rank
  const bankLineForMatching = {
    id: bankLine.id,
    txn_date: bankLine.txn_date,
    amount_pence: Number(bankLine.amount_pence),
    description: bankLine.description,
    reference: bankLine.reference,
  };

  const candidates: MatchCandidate[] = candidateJournals.map((j) => {
    const journalForMatching = {
      id: j.id,
      journal_date: j.journal_date,
      memo: j.memo,
      amountPence: journalAmountMap.get(j.id) ?? 0,
    };

    return buildMatchCandidate(bankLineForMatching, journalForMatching);
  });

  return { data: rankCandidates(candidates, 3), error: null };
}

/* ------------------------------------------------------------------ */
/*  createMatch                                                        */
/* ------------------------------------------------------------------ */

export async function createMatch(params: {
  bankLineId: string;
  journalId: string;
  matchType: 'manual' | 'payout' | 'auto';
  provider?: string | null;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { bankLineId, journalId, matchType, provider } = params;

  const { user, role, orgId } = await getActiveOrg();

  try { assertCanPerform(role, 'create', 'reconciliation'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  // Validate bank line belongs to org and has not already created final GL.
  const { data: bl } = await supabase
    .from('bank_lines')
    .select('organisation_id, allocated, reconciled')
    .eq('id', bankLineId)
    .single();

  if (!bl || bl.organisation_id !== orgId) {
    return { success: false, error: 'Bank line not found or does not belong to this organisation.' };
  }
  if (bl.allocated || bl.reconciled) {
    return { success: false, error: 'This bank line is already allocated or reconciled.' };
  }

  // Validate journal belongs to org
  const { data: journal } = await supabase
    .from('journals')
    .select('organisation_id')
    .eq('id', journalId)
    .single();

  if (!journal || journal.organisation_id !== orgId) {
    return { success: false, error: 'Journal not found or does not belong to this organisation.' };
  }

  // Insert (unique constraint on bank_line_id prevents duplicates)
  const { error: insertErr } = await supabase
    .from('bank_reconciliation_matches')
    .insert({
      organisation_id: orgId,
      bank_line_id: bankLineId,
      journal_id: journalId,
      match_type: matchType,
      provider: provider ?? null,
      matched_by: user.id,
    });

  if (insertErr) {
    if (insertErr.message.includes('unique') || insertErr.message.includes('duplicate')) {
      return { success: false, error: 'This bank line is already matched.' };
    }
    await logServerFailure({
      area: 'reconciliation',
      event: 'create_match_failed',
      error: insertErr,
      metadata: { bankLineId, journalId, orgId, userId: user.id },
    });
    return { success: false, error: insertErr.message };
  }

  // Mark bank line as reconciled
  await supabase
    .from('bank_lines')
    .update({ reconciled: true, reconciled_at: new Date().toISOString() })
    .eq('id', bankLineId);

  // Invalidate report caches since a bank line was reconciled
  invalidateOrgReportCache(orgId);

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  reconcileBankLineAsDonation                                        */
/* ------------------------------------------------------------------ */

export async function findDonorMatchesForBankTransaction(
  bankTransactionId: string,
  options?: { includeArchived?: boolean }
): Promise<{
  data: BankDonationDonorSuggestion[];
  warning: string | null;
  error: string | null;
}> {
  const { orgId, role } = await getActiveOrg();
  try {
    assertCanPerform(role, 'read', 'reconciliation');
  } catch (e) {
    return {
      data: [],
      warning: null,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  const supabase = await createClient();
  const { data: bankLine, error: bankLineError } = await supabase
    .from('bank_lines')
    .select('id, organisation_id, reference, description, amount_pence')
    .eq('id', bankTransactionId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (bankLineError || !bankLine) {
    return {
      data: [],
      warning: null,
      error: bankLineError?.message ?? 'Bank transaction not found.',
    };
  }

  const referenceText = [bankLine.reference, bankLine.description]
    .filter(Boolean)
    .join(' ');
  const normalizedReference = normalizeDonorMatchAlias(referenceText);

  const [
    { data: donors, error: donorError },
    { data: aliases, error: aliasError },
    { data: historicalMatches, error: matchError },
    { data: historicalDonations, error: donationError },
    { data: recurringPatternRows, error: recurringPatternError },
  ] = await Promise.all([
    supabase
      .from('donors')
      .select('id, full_name, first_name, last_name, display_name, reference_code, donor_reference_code, is_active')
      .eq('organisation_id', orgId)
      .order('full_name'),
    supabase
      .from('donor_matching_aliases')
      .select('donor_id, alias_text, normalized_alias, source, confidence')
      .eq('workspace_id', orgId),
    normalizedReference
      ? supabase
          .from('bank_transaction_donor_matches')
          .select('donor_id, confidence_score, review_status, bank_lines!inner(reference, description)')
          .eq('workspace_id', orgId)
          .eq('review_status', 'confirmed')
          .or(
            `reference.ilike.%${referenceText.replace(/[%_,]/g, '')}%,description.ilike.%${referenceText.replace(/[%_,]/g, '')}%`,
            { foreignTable: 'bank_lines' }
          )
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('donations')
      .select('donor_id, amount_pence, provider_reference')
      .eq('organisation_id', orgId)
      .eq('status', 'posted')
      .not('donor_id', 'is', null)
      .limit(500),
    supabase
      .from('recurring_donor_patterns')
      .select('donor_id, expected_amount_pence, amount_tolerance_pence, normalized_bank_reference')
      .eq('workspace_id', orgId)
      .eq('status', 'active'),
  ]);

  if (donorError) return { data: [], warning: null, error: donorError.message };
  if (aliasError) return { data: [], warning: null, error: aliasError.message };
  if (matchError) return { data: [], warning: null, error: matchError.message };
  if (donationError) return { data: [], warning: null, error: donationError.message };
  if (recurringPatternError) {
    return { data: [], warning: null, error: recurringPatternError.message };
  }

  const recurringPatterns: BankDonorMatchRecurringHint[] = (recurringPatternRows ?? []).map((row) => ({
    donor_id: row.donor_id as string,
    expected_amount_pence: Number(row.expected_amount_pence),
    amount_tolerance_pence: Number(row.amount_tolerance_pence ?? 50),
    normalized_bank_reference: row.normalized_bank_reference as string | null,
  }));

  const scored = scoreDonorMatchesForBankTransaction({
    bankTransaction: {
      id: bankLine.id,
      workspace_id: bankLine.organisation_id,
      reference: bankLine.reference,
      description: bankLine.description,
      amount_pence: Number(bankLine.amount_pence),
    },
    donors: (donors ?? []).map((donor) => ({
      id: donor.id,
      full_name: donor.full_name,
      first_name: donor.first_name ?? null,
      last_name: donor.last_name ?? null,
      display_name: donor.display_name ?? null,
      reference_code: donor.reference_code ?? null,
      donor_reference_code: donor.donor_reference_code ?? null,
      is_active: Boolean(donor.is_active),
    })),
    aliases: (aliases ?? []).map((alias) => ({
      donor_id: alias.donor_id,
      alias_text: alias.alias_text,
      normalized_alias: alias.normalized_alias,
      source: alias.source,
      confidence: Number(alias.confidence ?? 0.8),
    })),
    historicalMatches: (historicalMatches ?? []).map((match) => ({
      donor_id: match.donor_id,
      confidence_score:
        match.confidence_score == null ? null : Number(match.confidence_score),
      review_status: match.review_status,
    })),
    historicalDonations: (historicalDonations ?? []).map((donation) => ({
      donor_id: donation.donor_id,
      amount_pence: Number(donation.amount_pence),
      provider_reference: donation.provider_reference ?? null,
    })),
    recurringPatterns,
    includeArchived: options?.includeArchived ?? false,
  });

  return { data: scored.candidates, warning: scored.warning, error: null };
}

export async function reconcileBankLineAsDonation(params: {
  bankLineId: string;
  donorId?: string | null;
  quickCreateDonor?: ReconcileDonationQuickCreateDonor | null;
  anonymous?: boolean;
  saveBankReferenceAsAlias?: boolean;
  fundId: string;
  accountId: string;
  incomeStreamId?: string | null;
  giftAidEligible: boolean;
  declarationId?: string | null;
  addGiftAidFollowUp?: boolean;
  generateGiftAidDeclarationLink?: boolean;
}): Promise<{
  success: boolean;
  donationId: string | null;
  donorId: string | null;
  giftAidStatus: string | null;
  declarationRequestId?: string | null;
  declarationLinkUrl?: string | null;
  warning: string | null;
  error: string | null;
}> {
  await assertWriteAllowed();
  const { user, role, orgId } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'reconciliation');
    assertCanPerform(role, 'create', 'donations');
  } catch (e) {
    return {
      success: false,
      donationId: null,
      donorId: null,
      giftAidStatus: null,
      warning: null,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  if (
    !params.anonymous &&
    !params.donorId &&
    !optionalText(params.quickCreateDonor?.fullName)
  ) {
    return {
      success: false,
      donationId: null,
      donorId: null,
      giftAidStatus: null,
      warning: null,
      error: 'Select a donor, quick-create one, or mark the donation as anonymous before recording it.',
    };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const [
    { data: bankLine, error: bankLineError },
    { data: account },
    { data: fund },
    { data: existingBankMatch },
    { data: existingTransactionMatch },
  ] = await Promise.all([
    supabase
      .from('bank_lines')
      .select(
        'id, organisation_id, bank_account_id, txn_date, description, reference, amount_pence, allocated, reconciled, bank_accounts(linked_account_id, name)'
      )
      .eq('id', params.bankLineId)
      .eq('organisation_id', orgId)
      .maybeSingle(),
    supabase
      .from('accounts')
      .select('id, type, is_active')
      .eq('id', params.accountId)
      .eq('organisation_id', orgId)
      .maybeSingle(),
    supabase
      .from('funds')
      .select('id, is_active')
      .eq('id', params.fundId)
      .eq('organisation_id', orgId)
      .maybeSingle(),
    supabase
      .from('bank_reconciliation_matches')
      .select('id')
      .eq('bank_line_id', params.bankLineId)
      .maybeSingle(),
    supabase
      .from('transaction_matches')
      .select('id')
      .eq('bank_line_id', params.bankLineId)
      .eq('organisation_id', orgId)
      .eq('match_status', 'confirmed')
      .maybeSingle(),
  ]);

  if (bankLineError || !bankLine) {
    return {
      success: false,
      donationId: null,
      donorId: null,
      giftAidStatus: null,
      warning: null,
      error: bankLineError?.message ?? 'Bank line not found.',
    };
  }
  if (bankLine.allocated || bankLine.reconciled || existingBankMatch || existingTransactionMatch) {
    return {
      success: false,
      donationId: null,
      donorId: null,
      giftAidStatus: null,
      warning: null,
      error: 'This bank line is already matched, reconciled, or allocated.',
    };
  }

  const amountPence = Number(bankLine.amount_pence);
  if (amountPence <= 0) {
    return {
      success: false,
      donationId: null,
      donorId: null,
      giftAidStatus: null,
      warning: null,
      error: 'Only incoming bank transactions can be recorded as donations.',
    };
  }
  if (!account || account.type !== 'income' || !account.is_active) {
    return {
      success: false,
      donationId: null,
      donorId: null,
      giftAidStatus: null,
      warning: null,
      error: 'Select an active income account for the donation.',
    };
  }
  if (!fund || !fund.is_active) {
    return {
      success: false,
      donationId: null,
      donorId: null,
      giftAidStatus: null,
      warning: null,
      error: 'Select an active fund for the donation.',
    };
  }

  if (params.incomeStreamId) {
    const { data: stream } = await supabase
      .from('income_streams')
      .select('id, status')
      .eq('id', params.incomeStreamId)
      .eq('organisation_id', orgId)
      .maybeSingle();
    if (!stream || stream.status !== 'active') {
      return {
        success: false,
        donationId: null,
        donorId: null,
        giftAidStatus: null,
        warning: null,
        error: 'Select an active income stream for this organisation.',
      };
    }
  }

  const locked = await isDateInLockedPeriod(bankLine.txn_date);
  if (locked) {
    return {
      success: false,
      donationId: null,
      donorId: null,
      giftAidStatus: null,
      warning: null,
      error: 'Donation date falls in a locked financial period.',
    };
  }

  let donorId = params.anonymous ? null : params.donorId ?? null;
  if (donorId) {
    const { data: donor } = await supabase
      .from('donors')
      .select('id')
      .eq('id', donorId)
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .maybeSingle();
    if (!donor) {
      return {
        success: false,
        donationId: null,
        donorId: null,
        giftAidStatus: null,
        warning: null,
        error: 'Selected donor was not found for this organisation.',
      };
    }
  } else if (!params.anonymous && params.quickCreateDonor) {
    const fullName = optionalText(params.quickCreateDonor.fullName);
    const firstName = optionalText(params.quickCreateDonor.firstName);
    const lastName = optionalText(params.quickCreateDonor.lastName);
    const { data: donor, error: donorError } = await admin
      .from('donors')
      .insert({
        organisation_id: orgId,
        full_name: fullName,
        display_name: fullName,
        title: optionalText(params.quickCreateDonor.title),
        first_name: firstName,
        last_name: lastName,
        house_name_or_number: optionalText(params.quickCreateDonor.houseNameOrNumber),
        address: optionalText(params.quickCreateDonor.addressLine1) ?? optionalText(params.quickCreateDonor.houseNameOrNumber),
        address_line_1: optionalText(params.quickCreateDonor.addressLine1),
        address_line_2: optionalText(params.quickCreateDonor.addressLine2),
        town_city: optionalText(params.quickCreateDonor.townCity),
        postcode: optionalText(params.quickCreateDonor.postcode),
        email: optionalText(params.quickCreateDonor.email),
        is_active: true,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (donorError || !donor) {
      return {
        success: false,
        donationId: null,
        donorId: null,
        giftAidStatus: null,
        warning: null,
        error: donorError?.message ?? 'Failed to create donor.',
      };
    }
    donorId = donor.id;

    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'create_gift_aid_donor',
      entityType: 'donor',
      entityId: donor.id,
      metadata: { source: 'bank_reconciliation', bankLineId: params.bankLineId },
    });
  }

  const [{ data: donor }, { data: declarations }] = donorId
    ? await Promise.all([
        supabase
          .from('donors')
          .select('id, full_name, first_name, last_name, house_name_or_number, address, postcode, email')
          .eq('id', donorId)
          .eq('organisation_id', orgId)
          .maybeSingle(),
        supabase
          .from('gift_aid_declarations')
          .select('id, status, start_date, end_date, is_active')
          .eq('organisation_id', orgId)
          .eq('donor_id', donorId)
          .in('status', ['active', 'expired', 'cancelled', 'draft', 'invalid']),
      ])
    : [{ data: null }, { data: [] }];

  const assessment = assessDonationGiftAidForReconciliation({
    giftAidEligible: params.anonymous ? false : params.giftAidEligible,
    donation: {
      id: params.bankLineId,
      donor_id: donorId,
      donation_date: bankLine.txn_date,
      amount_pence: amountPence,
      gift_aid_claim_id: null,
    },
    donor: donor
      ? {
          full_name: donor.full_name,
          first_name: donor.first_name,
          last_name: donor.last_name,
          house_name_or_number: donor.house_name_or_number,
          address: donor.address,
          postcode: donor.postcode,
        }
      : null,
    declarations: (declarations ?? []).map((declaration) => ({
      id: declaration.id,
      status: declaration.status,
      start_date: declaration.start_date,
      end_date: declaration.end_date,
      is_active: declaration.is_active,
    })),
  });

  if (!params.anonymous && params.declarationId && assessment.matchedDeclarationId !== params.declarationId) {
    return {
      success: false,
      donationId: null,
      donorId,
      giftAidStatus: assessment.status,
      warning: assessment.warning,
      error:
        assessment.warning ??
        'The selected Gift Aid declaration does not cover this donation date.',
    };
  }

  const bankAccount = Array.isArray(bankLine.bank_accounts)
    ? bankLine.bank_accounts[0] ?? null
    : bankLine.bank_accounts;
  const ledgerLink = await validateBankLedgerLink(bankLine.bank_account_id, orgId);
  const linkedBankAccountId = ledgerLink.linkedAccountId;
  if (ledgerLink.status !== 'linked' || !linkedBankAccountId) {
    return {
      success: false,
      donationId: null,
      donorId,
      giftAidStatus: assessment.status,
      warning: null,
      error: ledgerLink.code,
    };
  }

  const memo = `Donation: ${params.anonymous ? 'anonymous donor' : donor?.full_name ?? 'donor donation'}`;
  const { data: journal, error: journalError } = await admin
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: bankLine.txn_date,
      memo,
      reference: bankLine.reference ?? `BANK-${params.bankLineId.slice(0, 8).toUpperCase()}`,
      status: 'draft',
      source_type: 'donation',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (journalError || !journal) {
    return {
      success: false,
      donationId: null,
      donorId,
      giftAidStatus: assessment.status,
      warning: null,
      error: journalError?.message ?? 'Failed to create donation journal.',
    };
  }

  const lineDescription = bankLine.description ?? memo;
  const { error: lineError } = await admin.from('journal_lines').insert([
    {
      journal_id: journal.id,
      organisation_id: orgId,
      account_id: linkedBankAccountId,
      fund_id: params.fundId,
      income_stream_id: params.incomeStreamId || null,
      description: `${bankAccount?.name ?? 'Bank'} deposit`,
      debit_pence: amountPence,
      credit_pence: 0,
    },
    {
      journal_id: journal.id,
      organisation_id: orgId,
      account_id: params.accountId,
      fund_id: params.fundId,
      income_stream_id: params.incomeStreamId || null,
      description: lineDescription,
      debit_pence: 0,
      credit_pence: amountPence,
    },
  ]);

  if (lineError) {
    await admin.from('journals').delete().eq('id', journal.id);
    return {
      success: false,
      donationId: null,
      donorId,
      giftAidStatus: assessment.status,
      warning: null,
      error: lineError.message,
    };
  }

  await admin
    .from('journals')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', journal.id);

  const providerReference = bankLine.reference ?? bankLine.description ?? params.bankLineId;
  const { data: donation, error: donationError } = await admin
    .from('donations')
    .insert({
      organisation_id: orgId,
      donor_id: donorId,
      donation_date: bankLine.txn_date,
      amount_pence: amountPence,
      gross_amount_pence: amountPence,
      fee_amount_pence: 0,
      net_amount_pence: amountPence,
      channel: 'bank_transfer',
      source: 'manual',
      fund_id: params.fundId,
      income_stream_id: params.incomeStreamId || null,
      journal_id: journal.id,
      bank_transaction_id: params.bankLineId,
      status: 'posted',
      provider_reference: providerReference,
      gift_aid_eligible: assessment.giftAidEligible,
      gift_aid_status: assessment.status,
      matched_declaration_id: assessment.matchedDeclarationId,
      gift_aid_estimated_claim_pence: assessment.estimatedClaimPence,
      review_reason: assessment.reason,
      fingerprint: `${donorId ?? 'anonymous'}|${bankLine.txn_date}|${amountPence}|${providerReference}`,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id')
    .single();

  if (donationError || !donation) {
    await admin.from('journal_lines').delete().eq('journal_id', journal.id);
    await admin.from('journals').delete().eq('id', journal.id);
    return {
      success: false,
      donationId: null,
      donorId,
      giftAidStatus: assessment.status,
      warning: null,
      error: donationError?.message ?? 'Failed to create donation record.',
    };
  }

  await Promise.all([
    admin.from('journals').update({ source_id: donation.id }).eq('id', journal.id),
    admin
      .from('bank_lines')
      .update({
        allocated: true,
        reconciled: true,
        reconciled_at: new Date().toISOString(),
      })
      .eq('id', params.bankLineId)
      .eq('organisation_id', orgId),
    admin.from('bank_reconciliation_matches').insert({
      organisation_id: orgId,
      bank_line_id: params.bankLineId,
      journal_id: journal.id,
      match_type: 'manual',
      provider: 'gift_aid_donation',
      matched_by: user.id,
    }),
  ]);

  await admin
    .from('bank_transaction_donor_matches')
    .update({
      review_status: 'superseded',
      updated_by: user.id,
    })
    .eq('workspace_id', orgId)
    .eq('bank_transaction_id', params.bankLineId)
    .in('review_status', ['suggested', 'auto_confirmed']);

  const { data: existingDonorMatch } = donorId
    ? await admin
        .from('bank_transaction_donor_matches')
        .select('id')
        .eq('workspace_id', orgId)
        .eq('bank_transaction_id', params.bankLineId)
        .eq('donor_id', donorId)
        .eq('match_method', 'manual')
        .maybeSingle()
    : { data: null };

  if (donorId && existingDonorMatch) {
    await admin
      .from('bank_transaction_donor_matches')
      .update({
        donation_id: donation.id,
        review_status: 'confirmed',
        confidence_score: 1,
        notes: 'Donor selected while reconciling bank transaction as a donation.',
        match_metadata: {
          giftAidStatus: assessment.status,
          declarationId: assessment.matchedDeclarationId,
        },
        updated_by: user.id,
      })
      .eq('id', existingDonorMatch.id);
  } else if (donorId) {
    await admin.from('bank_transaction_donor_matches').insert({
      workspace_id: orgId,
      bank_transaction_id: params.bankLineId,
      donation_id: donation.id,
      donor_id: donorId,
      match_method: 'manual',
      confidence_score: 1,
      review_status: 'confirmed',
      notes: 'Donor selected while reconciling bank transaction as a donation.',
      match_metadata: {
        giftAidStatus: assessment.status,
        declarationId: assessment.matchedDeclarationId,
      },
      created_by: user.id,
      updated_by: user.id,
    });
  }

  if (donorId && params.saveBankReferenceAsAlias) {
    const aliasText = optionalText(bankLine.reference) ?? optionalText(bankLine.description);
    const normalizedAlias = normalizeDonorMatchAlias(aliasText);
    if (aliasText && normalizedAlias) {
      await admin.from('donor_matching_aliases').upsert(
        {
          workspace_id: orgId,
          donor_id: donorId,
          alias_text: aliasText,
          normalized_alias: normalizedAlias,
          source: 'bank_reference',
          confidence: 0.95,
          created_from_bank_transaction_id: params.bankLineId,
        },
        { onConflict: 'workspace_id,normalized_alias,donor_id' }
      );
    }
  }

  let declarationRequestId: string | null = null;
  let declarationLinkUrl: string | null = null;
  let followUpWarning = assessment.warning;

  if (donorId && params.addGiftAidFollowUp && assessment.status === 'missing_declaration') {
    declarationRequestId = await upsertGiftAidDeclarationRequest({
      admin,
      orgId,
      donorId,
      donationId: donation.id,
      userId: user.id,
    });

    if (params.generateGiftAidDeclarationLink) {
      const result = await generateGiftAidDeclarationLinkForRequest({
        admin,
        orgId,
        donorId,
        donationId: donation.id,
        requestId: declarationRequestId,
        donorEmail: optionalText(donor?.email),
        userId: user.id,
      });
      declarationLinkUrl = result.declarationLinkUrl;
      followUpWarning = result.warning ?? followUpWarning;
    }
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'reconcile_bank_line_as_donation',
    entityType: 'donation',
    entityId: donation.id,
    metadata: {
      bankLineId: params.bankLineId,
      donorId,
      fundId: params.fundId,
      accountId: params.accountId,
      incomeStreamId: params.incomeStreamId ?? null,
      giftAidStatus: assessment.status,
      anonymous: Boolean(params.anonymous),
      savedBankReferenceAsAlias: Boolean(params.saveBankReferenceAsAlias && donorId),
      declarationRequestId,
      declarationLinkGenerated: Boolean(declarationLinkUrl),
      warning: followUpWarning,
      alert:
        assessment.status === 'missing_declaration'
          ? GIFT_AID_DECLARATION_MISSING_ALERT
          : null,
    },
  });

  invalidateOrgReportCache(orgId);

  return {
    success: true,
    donationId: donation.id,
    donorId,
    giftAidStatus: assessment.status,
    declarationRequestId,
    declarationLinkUrl,
    warning: followUpWarning,
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  removeMatch                                                        */
/* ------------------------------------------------------------------ */

export async function removeMatch(
  matchId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role, orgId, user } = await getActiveOrg();

  try { assertCanPerform(role, 'delete', 'reconciliation'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  // Fetch the match to get the bank_line_id before deleting
  const { data: match } = await supabase
    .from('bank_reconciliation_matches')
    .select('bank_line_id')
    .eq('id', matchId)
    .single();

  const { error } = await supabase
    .from('bank_reconciliation_matches')
    .delete()
    .eq('id', matchId);

  if (error) {
    await logServerFailure({
      area: 'reconciliation',
      event: 'remove_match_failed',
      error,
      metadata: { matchId, orgId, userId: user.id },
    });
    return { success: false, error: error.message };
  }

  // Clear reconciled flag on the bank line
  if (match?.bank_line_id) {
    await supabase
      .from('bank_lines')
      .update({ reconciled: false, reconciled_at: null })
      .eq('id', match.bank_line_id);
  }

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  getReconciliationStats                                             */
/* ------------------------------------------------------------------ */

export async function getReconciliationStats(
  bankAccountId: string
): Promise<{ data: ReconciliationStats | null; error: string | null }> {
  const supabase = await createClient();

  // All bank lines for this account
  const { data: bankLines, error: blErr } = await supabase
    .from('bank_lines')
    .select('id, amount_pence')
    .eq('bank_account_id', bankAccountId);

  if (blErr) return { data: null, error: blErr.message };

  const allIds = (bankLines ?? []).map((bl) => bl.id);
  if (allIds.length === 0) {
    return {
      data: {
        totalLines: 0,
        reconciledCount: 0,
        unreconciledCount: 0,
        unreconciledAmountPence: 0,
      },
      error: null,
    };
  }

  // Matched bank line IDs
  const { data: matches } = await supabase
    .from('bank_reconciliation_matches')
    .select('bank_line_id')
    .in('bank_line_id', allIds);

  const matchedIds = new Set((matches ?? []).map((m) => m.bank_line_id));

  const totalLines = allIds.length;
  const reconciledCount = matchedIds.size;
  const unreconciledCount = totalLines - reconciledCount;
  const unreconciledAmountPence = (bankLines ?? [])
    .filter((bl) => !matchedIds.has(bl.id))
    .reduce((sum, bl) => sum + Math.abs(Number(bl.amount_pence)), 0);

  return {
    data: {
      totalLines,
      reconciledCount,
      unreconciledCount,
      unreconciledAmountPence,
    },
    error: null,
  };
}

/* ================================================================== */
/*  STATEMENT RECONCILIATION                                           */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  getLastReconciliation                                              */
/* ------------------------------------------------------------------ */

export async function getLastReconciliation(
  bankAccountId: string,
): Promise<{ data: ReconciliationRow | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reconciliations')
    .select('*')
    .eq('bank_account_id', bankAccountId)
    .eq('locked', true)
    .order('statement_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error: error.message };

  if (!data) return { data: null, error: null };

  return {
    data: {
      id: data.id,
      organisation_id: data.organisation_id,
      bank_account_id: data.bank_account_id,
      statement_date: data.statement_date,
      statement_closing_balance_pence: Number(data.statement_closing_balance_pence),
      opening_balance_pence: Number(data.opening_balance_pence),
      cleared_balance_pence: data.cleared_balance_pence != null ? Number(data.cleared_balance_pence) : null,
      lines_cleared: data.lines_cleared,
      reconciled_by: data.reconciled_by,
      reconciled_at: data.reconciled_at,
      locked: data.locked,
      created_at: data.created_at,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  startReconciliation                                                */
/* ------------------------------------------------------------------ */

export async function startReconciliation(params: {
  bankAccountId: string;
  statementDate: string;
  statementClosingBalancePence: number;
}): Promise<{ data: ReconciliationRow | null; error: string | null }> {
  await assertWriteAllowed();
  const { bankAccountId, statementDate, statementClosingBalancePence } = params;
  const { user, role, orgId } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'reconciliation');
  } catch (e) {
    return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  // Cannot reconcile future dates
  const today = new Date().toISOString().slice(0, 10);
  if (statementDate > today) {
    return { data: null, error: 'Cannot reconcile a future date.' };
  }

  // Derive opening balance from last locked reconciliation
  const { data: lastRec } = await getLastReconciliation(bankAccountId);
  const openingBalancePence = lastRec?.statement_closing_balance_pence ?? 0;

  const supabase = await createClient();

  // Check for existing unlocked reconciliation for this account
  const { data: existing } = await supabase
    .from('reconciliations')
    .select('id')
    .eq('bank_account_id', bankAccountId)
    .eq('locked', false)
    .maybeSingle();

  if (existing) {
    // Delete old draft reconciliation and unlink its bank lines
    await supabase
      .from('bank_lines')
      .update({ reconciliation_id: null })
      .eq('reconciliation_id', existing.id);

    await supabase
      .from('reconciliations')
      .delete()
      .eq('id', existing.id);
  }

  const { data, error } = await supabase
    .from('reconciliations')
    .insert({
      organisation_id: orgId,
      bank_account_id: bankAccountId,
      statement_date: statementDate,
      statement_closing_balance_pence: statementClosingBalancePence,
      opening_balance_pence: openingBalancePence,
      reconciled_by: user.id,
    })
    .select('*')
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: {
      id: data.id,
      organisation_id: data.organisation_id,
      bank_account_id: data.bank_account_id,
      statement_date: data.statement_date,
      statement_closing_balance_pence: Number(data.statement_closing_balance_pence),
      opening_balance_pence: Number(data.opening_balance_pence),
      cleared_balance_pence: null,
      lines_cleared: 0,
      reconciled_by: data.reconciled_by,
      reconciled_at: data.reconciled_at,
      locked: data.locked,
      created_at: data.created_at,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  getClearableLines                                                  */
/* ------------------------------------------------------------------ */

export async function getClearableLines(params: {
  bankAccountId: string;
  statementDate: string;
  reconciliationId: string;
}): Promise<{ data: ClearableBankLine[]; error: string | null }> {
  const { bankAccountId, statementDate, reconciliationId } = params;
  const supabase = await createClient();

  // Fetch all bank lines up to the statement date that are either:
  // - Not yet assigned to any reconciliation, OR
  // - Already assigned to THIS reconciliation (cleared in this session)
  const { data, error } = await supabase
    .from('bank_lines')
    .select('id, txn_date, description, reference, amount_pence, balance_pence, allocated, reconciled, status, posted_journal_id, matched_source_type, reconciliation_id')
    .eq('bank_account_id', bankAccountId)
    .lte('txn_date', statementDate)
    .or(`reconciliation_id.is.null,reconciliation_id.eq.${reconciliationId}`)
    .not('status', 'in', '("excluded","duplicate","matched","reconciled")')
    .eq('reconciled', false)
    .eq('allocated', false)
    .is('posted_journal_id', null)
    .is('matched_source_type', null)
    .order('txn_date', { ascending: true });

  if (error) return { data: [], error: error.message };

  const lines: ClearableBankLine[] = (data ?? []).map((l) => ({
    id: l.id,
    txn_date: l.txn_date,
    description: l.description,
    reference: l.reference,
    amount_pence: Number(l.amount_pence),
    balance_pence: l.balance_pence != null ? Number(l.balance_pence) : null,
    allocated: l.allocated ?? false,
    cleared: l.reconciliation_id === reconciliationId,
  }));

  return { data: lines, error: null };
}

/* ------------------------------------------------------------------ */
/*  toggleClearLine                                                    */
/* ------------------------------------------------------------------ */

export async function toggleClearLine(params: {
  reconciliationId: string;
  bankLineId: string;
  cleared: boolean;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { reconciliationId, bankLineId, cleared } = params;
  const { role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'reconciliation');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();

  // Verify reconciliation is not locked
  const { data: rec } = await supabase
    .from('reconciliations')
    .select('locked')
    .eq('id', reconciliationId)
    .single();

  if (!rec) return { success: false, error: 'Reconciliation not found.' };
  if (rec.locked) return { success: false, error: 'This reconciliation is locked.' };

  const { error } = await supabase
    .from('bank_lines')
    .update({ reconciliation_id: cleared ? reconciliationId : null })
    .eq('id', bankLineId);

  if (error) return { success: false, error: error.message };

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  getReconciliationSummary                                           */
/* ------------------------------------------------------------------ */

export async function getReconciliationSummary(params: {
  reconciliationId: string;
  bankAccountId: string;
  statementDate: string;
}): Promise<{ data: ReconciliationSummary | null; error: string | null }> {
  const { reconciliationId, bankAccountId, statementDate } = params;
  const supabase = await createClient();

  // Fetch the reconciliation record for opening + statement balance
  const { data: rec } = await supabase
    .from('reconciliations')
    .select('opening_balance_pence, statement_closing_balance_pence')
    .eq('id', reconciliationId)
    .single();

  if (!rec) return { data: null, error: 'Reconciliation not found.' };

  const openingBalancePence = Number(rec.opening_balance_pence);
  const statementBalancePence = Number(rec.statement_closing_balance_pence);

  // Sum cleared lines
  const { data: clearedLines, error } = await supabase
    .from('bank_lines')
    .select('amount_pence')
    .eq('reconciliation_id', reconciliationId);

  if (error) return { data: null, error: error.message };

  const clearedTotalPence = (clearedLines ?? []).reduce(
    (sum, l) => sum + Number(l.amount_pence),
    0,
  );

  // Total clearable lines
  const { count } = await supabase
    .from('bank_lines')
    .select('id', { count: 'exact', head: true })
    .eq('bank_account_id', bankAccountId)
    .lte('txn_date', statementDate)
    .or(`reconciliation_id.is.null,reconciliation_id.eq.${reconciliationId}`);

  const clearedBalance = openingBalancePence + clearedTotalPence;
  const differencePence = statementBalancePence - clearedBalance;

  return {
    data: {
      openingBalancePence,
      clearedTotalPence,
      statementBalancePence,
      differencePence,
      clearedCount: clearedLines?.length ?? 0,
      totalLines: count ?? 0,
      isBalanced: differencePence === 0,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  finalizeReconciliation                                             */
/* ------------------------------------------------------------------ */

export async function finalizeReconciliation(
  reconciliationId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { user, role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'reconciliation');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();

  // Fetch the reconciliation
  const { data: rec } = await supabase
    .from('reconciliations')
    .select('*')
    .eq('id', reconciliationId)
    .single();

  if (!rec) return { success: false, error: 'Reconciliation not found.' };
  if (rec.locked) return { success: false, error: 'Already finalized.' };

  // Compute cleared balance
  const { data: clearedLines } = await supabase
    .from('bank_lines')
    .select('amount_pence')
    .eq('reconciliation_id', reconciliationId);

  const clearedTotal = (clearedLines ?? []).reduce(
    (sum, l) => sum + Number(l.amount_pence),
    0,
  );

  const openingBalance = Number(rec.opening_balance_pence);
  const statementBalance = Number(rec.statement_closing_balance_pence);
  const clearedBalance = openingBalance + clearedTotal;
  const difference = statementBalance - clearedBalance;

  if (difference !== 0) {
    return {
      success: false,
      error: `Cannot finalize: difference is £${(Math.abs(difference) / 100).toFixed(2)}. Must be zero.`,
    };
  }

  // Lock it
  const { error: updateErr } = await supabase
    .from('reconciliations')
    .update({
      locked: true,
      reconciled_at: new Date().toISOString(),
      reconciled_by: user.id,
      cleared_balance_pence: clearedBalance,
      lines_cleared: clearedLines?.length ?? 0,
    })
    .eq('id', reconciliationId);

  if (updateErr) return { success: false, error: updateErr.message };

  // Mark all cleared bank lines as reconciled
  await supabase
    .from('bank_lines')
    .update({ reconciled: true, reconciled_at: new Date().toISOString(), reconciled_by: user.id, status: 'reconciled' })
    .eq('reconciliation_id', reconciliationId);

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  undoReconciliation (admin only)                                    */
/* ------------------------------------------------------------------ */

export async function undoReconciliation(
  reconciliationId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  if (role !== 'admin') {
    return { success: false, error: 'Only admins can undo reconciliations.' };
  }

  const supabase = await createClient();

  // Unlink bank lines
  await supabase
    .from('bank_lines')
    .update({ reconciliation_id: null, reconciled: false, reconciled_at: null, reconciled_by: null, status: 'unmatched' })
    .eq('reconciliation_id', reconciliationId);

  // Delete the reconciliation record
  const { error } = await supabase
    .from('reconciliations')
    .delete()
    .eq('id', reconciliationId);

  if (error) return { success: false, error: error.message };

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  getReconciliationHistory                                           */
/* ------------------------------------------------------------------ */

export async function getReconciliationHistory(
  bankAccountId: string,
): Promise<{ data: ReconciliationWithMeta[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reconciliations')
    .select('*')
    .eq('bank_account_id', bankAccountId)
    .order('statement_date', { ascending: false });

  if (error) return { data: [], error: error.message };

  // Fetch user names
  const userIds = [...new Set((data ?? []).map((r) => r.reconciled_by).filter(Boolean))];
  const nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);
    for (const p of profiles ?? []) {
      nameMap.set(p.id, p.full_name ?? '');
    }
  }

  // Fetch bank account name
  const { data: ba } = await supabase
    .from('bank_accounts')
    .select('name')
    .eq('id', bankAccountId)
    .single();

  const rows: ReconciliationWithMeta[] = (data ?? []).map((r) => ({
    id: r.id,
    organisation_id: r.organisation_id,
    bank_account_id: r.bank_account_id,
    statement_date: r.statement_date,
    statement_closing_balance_pence: Number(r.statement_closing_balance_pence),
    opening_balance_pence: Number(r.opening_balance_pence),
    cleared_balance_pence: r.cleared_balance_pence != null ? Number(r.cleared_balance_pence) : null,
    lines_cleared: r.lines_cleared,
    reconciled_by: r.reconciled_by,
    reconciled_at: r.reconciled_at,
    locked: r.locked,
    created_at: r.created_at,
    reconciled_by_name: r.reconciled_by ? (nameMap.get(r.reconciled_by) ?? null) : null,
    bank_account_name: ba?.name ?? 'Unknown',
  }));

  return { data: rows, error: null };
}

/* ------------------------------------------------------------------ */
/*  getClearingReconciliation                                          */
/* ------------------------------------------------------------------ */

export async function getClearingReconciliation(
  orgId: string
): Promise<{ data: ClearingProviderRow[]; error: string | null }> {
  const supabase = await createClient();

  // 1. Fetch giving_platforms to get clearing account mappings
  const { data: platforms, error: platErr } = await supabase
    .from('giving_platforms')
    .select('provider, clearing_account_id')
    .eq('organisation_id', orgId);

  if (platErr) return { data: [], error: platErr.message };

  if (!platforms || platforms.length === 0) {
    return { data: [], error: null };
  }

  // Fetch account names
  const clearingIds = platforms.map((p) => p.clearing_account_id);
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .in('id', clearingIds);

  const accountNameMap = new Map(
    (accounts ?? []).map((a) => [a.id, a.name as string])
  );

  const providerMap: ProviderClearingMap[] = platforms.map((p) => ({
    provider: p.provider,
    clearingAccountId: p.clearing_account_id,
    clearingAccountName: accountNameMap.get(p.clearing_account_id) ?? 'Unknown',
  }));

  // 2. Fetch all journal lines touching any clearing account (posted journals only)
  const { data: journalLines, error: jlErr } = await supabase
    .from('journal_lines')
    .select('journal_id, account_id, debit_pence, credit_pence')
    .in('account_id', clearingIds);

  if (jlErr) return { data: [], error: jlErr.message };

  // Fetch the corresponding journal metadata for memo/date/status filtering
  const journalIds = [...new Set((journalLines ?? []).map((jl) => jl.journal_id))];
  const journalMetaMap = new Map<string, { memo: string | null; journal_date: string; status: string }>();
  if (journalIds.length > 0) {
    const { data: journals } = await supabase
      .from('journals')
      .select('id, memo, journal_date, status')
      .in('id', journalIds);

    for (const j of journals ?? []) {
      journalMetaMap.set(j.id, { memo: j.memo, journal_date: j.journal_date, status: j.status });
    }
  }

  // Filter to only posted journals
  const filteredLines: JournalLineInput[] = (journalLines ?? [])
    .filter((jl) => {
      const meta = journalMetaMap.get(jl.journal_id);
      return meta && meta.status === 'posted';
    })
    .map((jl) => {
      const meta = journalMetaMap.get(jl.journal_id)!;
      return {
        journal_id: jl.journal_id,
        journal_date: meta.journal_date,
        journal_memo: meta.memo,
        account_id: jl.account_id,
        debit_pence: Number(jl.debit_pence),
        credit_pence: Number(jl.credit_pence),
      };
    });

  // 3. Fetch matched journal IDs
  const { data: matchRows } = await supabase
    .from('bank_reconciliation_matches')
    .select('journal_id')
    .eq('organisation_id', orgId);

  const matchedJournalIds = new Set(
    (matchRows ?? []).map((m) => m.journal_id)
  );

  // 4. Compute clearing balances
  const rows = computeClearingBalances({
    journalLines: filteredLines,
    matchedJournalIds,
    providerMap,
  });

  return { data: rows, error: null };
}

/* ================================================================== */
/*  GL-BASED RECONCILIATION                                            */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  getBankGLBalance — compute bank balance from journal_lines          */
/* ------------------------------------------------------------------ */

export async function getBankGLBalance(
  bankAccountId: string,
): Promise<{ data: GLReconciliationData | null; error: string | null }> {
  const supabase = await createClient();
  const { orgId } = await getActiveOrg();

  const ledgerLink = await validateBankLedgerLink(bankAccountId, orgId);
  if (ledgerLink.status !== 'linked' || !ledgerLink.linkedAccountId) {
    return { data: null, error: ledgerLink.code };
  }

  // Sum all posted journal_lines touching this account
  // Asset accounts: balance = debit - credit
  const { data: postedJournals } = await supabase
    .from('journals')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('status', 'posted');

  if (!postedJournals || postedJournals.length === 0) {
    return {
      data: {
        glBalancePence: 0,
        statementBalancePence: null,
        differencePence: 0,
        isReconciled: true,
      },
      error: null,
    };
  }

  const journalIds = postedJournals.map((j) => j.id);

  const { data: lines } = await supabase
    .from('journal_lines')
    .select('debit_pence, credit_pence')
    .eq('account_id', ledgerLink.linkedAccountId)
    .in('journal_id', journalIds);

  let glBalance = 0;
  for (const l of lines ?? []) {
    glBalance += Number(l.debit_pence) - Number(l.credit_pence);
  }

  // Get latest bank statement balance
  const { data: latestLine } = await supabase
    .from('bank_lines')
    .select('balance_pence')
    .eq('bank_account_id', bankAccountId)
    .not('balance_pence', 'is', null)
    .order('txn_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const statementBalance = latestLine ? Number(latestLine.balance_pence) : null;
  const difference = statementBalance !== null ? statementBalance - glBalance : 0;

  return {
    data: {
      glBalancePence: glBalance,
      statementBalancePence: statementBalance,
      differencePence: difference,
      isReconciled: difference === 0,
    },
    error: null,
  };
}
