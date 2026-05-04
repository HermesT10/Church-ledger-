'use server';

import { revalidatePath } from 'next/cache';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import { invalidateOrgReportCache } from '@/lib/cache';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { executePostedJournalReversal } from '@/lib/journals/execute-posted-reversal';
import { isDateInLockedPeriod } from '@/lib/periods/actions';
import type { BankReconciliationSourceType } from '@/lib/banking/reconciliation-matching';
import type { UnreconcileBankTransactionResult } from './unreconcile-bank-transaction.types';

const GIFT_AID_UNRECONCILE_GUARD_STATUSES = new Set([
  'submitted',
  'paid',
  'included_in_claim',
  'included_in_draft_claim',
  'exported',
  'already_claimed',
]);

function permissionMessage(e: unknown): string {
  return e instanceof PermissionError ? e.message : 'Permission denied.';
}

function isTreasurerOrAdmin(role: string): boolean {
  return role === 'admin' || role === 'treasurer';
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function deleteDraftJournalSimple(
  admin: AdminClient,
  orgId: string,
  journalId: string,
): Promise<{ ok: true } | { error: string }> {
  const { data: journal, error: loadErr } = await admin
    .from('journals')
    .select('id, status')
    .eq('id', journalId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (loadErr || !journal) {
    return { error: loadErr?.message ?? 'Journal not found.' };
  }
  if (journal.status !== 'draft') {
    return { error: 'Expected a draft journal for this step.' };
  }

  const { error: lineErr } = await admin.from('journal_lines').delete().eq('journal_id', journalId);
  if (lineErr) return { error: lineErr.message };

  const { error: delErr } = await admin.from('journals').delete().eq('id', journalId).eq('organisation_id', orgId);
  if (delErr) return { error: delErr.message };

  return { ok: true };
}

async function resetBankLineForQueue(
  admin: AdminClient,
  orgId: string,
  bankTransactionId: string,
): Promise<{ error: string | null }> {
  const { error } = await admin
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
    .eq('id', bankTransactionId)
    .eq('organisation_id', orgId);

  return { error: error?.message ?? null };
}

async function rejectWorkspaceMatches(
  admin: AdminClient,
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

export async function unreconcileBankTransaction(params: {
  bankTransactionId: string;
  reason: string;
  /** Required when reversing a posted journal (YYYY-MM-DD). Defaults to bank line date when omitted and reversal runs. */
  reversalDate?: string;
  /** Must be true for treasurer/admin when Gift Aid status is claim-locked. */
  giftAidUnreconcileOverride?: boolean;
}): Promise<UnreconcileBankTransactionResult> {
  await assertWriteAllowed();
  let ctx;
  try {
    ctx = await getActiveOrg();
    assertCanPerform(ctx.role, 'update', 'reconciliation');
    assertCanPerform(ctx.role, 'create', 'journals');
  } catch (e) {
    return { ok: false, error: permissionMessage(e) };
  }

  const reason = params.reason.trim();
  if (reason.length < 3) {
    return { ok: false, error: 'Please enter a reason (at least 3 characters).' };
  }

  const admin = createAdminClient();
  const { orgId, user } = ctx;

  const { data: bankLine, error: lineErr } = await admin
    .from('bank_lines')
    .select(
      'id, organisation_id, txn_date, reconciled, allocated, status, posted_journal_id, matched_source_type, matched_source_id',
    )
    .eq('id', params.bankTransactionId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (lineErr || !bankLine) {
    return { ok: false, error: lineErr?.message ?? 'Bank transaction not found.' };
  }

  const status = String(bankLine.status ?? '');
  const isExcluded = status === 'excluded' || bankLine.matched_source_type === 'excluded';

  /* --- Un-exclude: no journal ------------------------------------------------ */
  if (isExcluded) {
    const { error: rawUpdateErr } = await admin
      .from('bank_lines')
      .update({
        status: 'unmatched',
        matched_source_type: null,
        matched_source_id: null,
        reconciled: false,
        reconciled_at: null,
        reconciled_by: null,
        posted_journal_id: null,
        allocated: false,
      })
      .eq('id', params.bankTransactionId)
      .eq('organisation_id', orgId);
    if (rawUpdateErr) return { ok: false, error: rawUpdateErr.message };

    await rejectWorkspaceMatches(admin, orgId, params.bankTransactionId);

    const { data: correction, error: corrErr } = await admin
      .from('reconciliation_corrections')
      .insert({
        workspace_id: orgId,
        organisation_id: orgId,
        bank_line_id: params.bankTransactionId,
        bank_reconciliation_match_id: null,
        original_source_type: 'excluded',
        original_source_id: params.bankTransactionId,
        original_journal_id: null,
        reversal_journal_id: null,
        correction_type: 'unreconcile',
        journal_action: null,
        reason,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (corrErr || !correction) {
      return { ok: false, error: corrErr?.message ?? 'Failed to record unreconcile history.' };
    }

    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'bank_transaction_unreconciled',
      entityType: 'bank_line',
      entityId: params.bankTransactionId,
      metadata: { correctionId: correction.id, mode: 'unexclude' },
    });

    revalidatePath('/reconciliation');
    invalidateOrgReportCache(orgId);
    return { ok: true, correctionId: correction.id, reversalJournalId: null };
  }

  const { data: donationByBank } = await admin
    .from('donations')
    .select(
      'id, journal_id, gift_aid_status, status, bank_transaction_id',
    )
    .eq('organisation_id', orgId)
    .eq('bank_transaction_id', params.bankTransactionId)
    .maybeSingle();

  const reconciled = Boolean(bankLine.reconciled) || Boolean(bankLine.posted_journal_id) || status === 'reconciled';
  const legacyReconciledDonation = Boolean(donationByBank) && (Boolean(bankLine.allocated) || reconciled);

  if (!reconciled && !legacyReconciledDonation) {
    return { ok: false, error: 'This bank line is not reconciled.' };
  }

  const { data: brm } = await admin
    .from('bank_reconciliation_matches')
    .select('id, status, matched_source_type, matched_source_id, journal_id')
    .eq('workspace_id', orgId)
    .eq('bank_transaction_id', params.bankTransactionId)
    .eq('status', 'confirmed')
    .maybeSingle();

  let sourceType =
    (bankLine.matched_source_type as BankReconciliationSourceType | null) ??
    (brm?.matched_source_type as BankReconciliationSourceType | null) ??
    null;
  let sourceId =
    (bankLine.matched_source_id as string | null) ?? (brm?.matched_source_id as string | null) ?? null;

  if (donationByBank && !bankLine.matched_source_type) {
    sourceType = 'donation';
    sourceId = donationByBank.id;
  } else if (!sourceType && donationByBank) {
    sourceType = 'donation';
    sourceId = donationByBank.id;
  }

  if (!sourceType || !sourceId) {
    return {
      ok: false,
      error:
        'Could not determine what this bank line was matched to. If this was created by an older flow, contact support.',
    };
  }

  let journalId =
    (bankLine.posted_journal_id as string | null) ??
    (brm?.journal_id as string | null) ??
    null;

  if (!journalId && donationByBank?.journal_id) {
    journalId = donationByBank.journal_id as string;
  }
  if (!journalId && sourceType === 'journal') {
    journalId = sourceId;
  }

  const unsupportedTypes: BankReconciliationSourceType[] = [
    'invoice_payment',
    'supplier_payment',
    'payroll_payment',
    'cash_deposit',
    'fund_transfer',
    'adjustment',
    'bank_rule',
    'lettings_charge',
  ];

  if (unsupportedTypes.includes(sourceType)) {
    return { ok: false, error: `Unreconcile is not supported yet for source type "${sourceType.replaceAll('_', ' ')}".` };
  }

  /* --- Gift Aid claim receipt (no journal on bank line) ---------------------- */
  if (sourceType === 'gift_aid_claim_payment') {
    const { error: batchErr } = await admin
      .from('gift_aid_claim_batches')
      .update({
        received_bank_transaction_id: null,
        received_payment_total_pence: null,
        gift_aid_payment_status: 'pending',
        payment_reconciled_at: null,
      })
      .eq('id', sourceId)
      .eq('workspace_id', orgId);

    if (batchErr) return { ok: false, error: batchErr.message };

    const resetBank = await resetBankLineForQueue(admin, orgId, params.bankTransactionId);
    if (resetBank.error) return { ok: false, error: resetBank.error };

    await rejectWorkspaceMatches(admin, orgId, params.bankTransactionId);

    const { data: correction, error: corrErr } = await admin
      .from('reconciliation_corrections')
      .insert({
        workspace_id: orgId,
        organisation_id: orgId,
        bank_line_id: params.bankTransactionId,
        bank_reconciliation_match_id: brm?.id ?? null,
        original_source_type: sourceType,
        original_source_id: sourceId,
        original_journal_id: null,
        reversal_journal_id: null,
        correction_type: 'unreconcile',
        journal_action: null,
        reason,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (corrErr || !correction) {
      return { ok: false, error: corrErr?.message ?? 'Failed to record unreconcile history.' };
    }

    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'bank_transaction_unreconciled',
      entityType: 'bank_line',
      entityId: params.bankTransactionId,
      metadata: { correctionId: correction.id, sourceType, sourceId, mode: 'gift_aid_claim_payment' },
    });

    revalidatePath('/reconciliation');
    revalidatePath('/gift-aid');
    invalidateOrgReportCache(orgId);
    return { ok: true, correctionId: correction.id, reversalJournalId: null };
  }

  /* --- Donation / Gift Aid donor paths: guard ------------------------------- */
  if (sourceType === 'donation' || sourceType === 'gift_aid_donor_donation') {
    const { data: donation } = await admin
      .from('donations')
      .select('id, gift_aid_status')
      .eq('id', sourceId)
      .eq('organisation_id', orgId)
      .maybeSingle();

    const gaStatus = String(donation?.gift_aid_status ?? '');
    if (donation && GIFT_AID_UNRECONCILE_GUARD_STATUSES.has(gaStatus)) {
      const elevated = isTreasurerOrAdmin(ctx.role);
      if (!elevated || !params.giftAidUnreconcileOverride) {
        return {
          ok: false,
          error:
            'This donation is tied to a Gift Aid claim that has progressed too far to unreconcile without treasurer/admin confirmation. Enable the override and try again.',
        };
      }
    }
  }

  if (!journalId) {
    return { ok: false, error: 'No linked journal was found for this reconciliation.' };
  }

  const { data: journal, error: jErr } = await admin
    .from('journals')
    .select('id, status')
    .eq('id', journalId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (jErr || !journal) {
    return { ok: false, error: jErr?.message ?? 'Linked journal not found.' };
  }

  const journalStatus = String(journal.status);
  let reversalJournalId: string | null = null;
  let journalAction: 'reversed' | 'voided' | 'deleted_draft' | null = null;

  const reversalDate =
    params.reversalDate ??
    String(bankLine.txn_date);

  if (journalStatus === 'posted') {
    const reversal = await executePostedJournalReversal({
      admin,
      orgId,
      userId: user.id,
      journalId,
      reason,
      reversalDate,
    });
    if ('error' in reversal) {
      return { ok: false, error: reversal.error };
    }
    reversalJournalId = reversal.reversalId;
    journalAction = 'reversed';
  } else if (journalStatus === 'draft') {
    const locked = await isDateInLockedPeriod(String(bankLine.txn_date));
    if (locked) {
      return { ok: false, error: 'Cannot remove a draft journal in a locked financial period.' };
    }
    const del = await deleteDraftJournalSimple(admin, orgId, journalId);
    if ('error' in del) {
      return { ok: false, error: del.error };
    }
    journalAction = 'deleted_draft';
  } else {
    return {
      ok: false,
      error: `Cannot unreconcile while the linked journal is in status "${journalStatus}".`,
    };
  }

  /* --- Source rows ----------------------------------------------------------- */
  if (sourceType === 'manual_transaction') {
    const { error: uErr } = await admin
      .from('manual_transactions')
      .update({
        posted_journal_id: null,
        matched_bank_transaction_id: null,
        reconciled_at: null,
        posted_at: null,
        status: 'awaiting_bank_match',
      })
      .eq('id', sourceId)
      .eq('organisation_id', orgId);
    if (uErr) return { ok: false, error: uErr.message };
  } else if (sourceType === 'donation' || sourceType === 'gift_aid_donor_donation') {
    const { error: uErr } = await admin
      .from('donations')
      .update({
        status: 'corrected',
        bank_transaction_id: null,
        gift_aid_status: 'not_assessed',
        gift_aid_claim_id: null,
        gift_aid_claim_batch_id: null,
        included_in_claim_at: null,
        gift_aid_claimed_at: null,
        corrected_at: new Date().toISOString(),
        corrected_by: user.id,
        correction_reason: reason,
        reversal_journal_id: reversalJournalId,
        updated_by: user.id,
      })
      .eq('id', sourceId)
      .eq('organisation_id', orgId);
    if (uErr) return { ok: false, error: uErr.message };
  } else if (sourceType === 'lettings_payment') {
    const voidReason = `Unreconciled from bank: ${reason}`;
    const { error: uErr } = await admin
      .from('lettings_payments')
      .update({
        status: 'voided',
        void_reason: voidReason,
        voided_at: new Date().toISOString(),
        bank_transaction_id: null,
        posted_journal_id: null,
      })
      .eq('id', sourceId)
      .eq('organisation_id', orgId);
    if (uErr) return { ok: false, error: uErr.message };
  } else if (sourceType === 'journal') {
    /* journal-only match: reversal already updated the posted journal */
  } else {
    return { ok: false, error: `Unreconcile handler missing for source type "${sourceType}".` };
  }

  const resetBank = await resetBankLineForQueue(admin, orgId, params.bankTransactionId);
  if (resetBank.error) return { ok: false, error: resetBank.error };

  await rejectWorkspaceMatches(admin, orgId, params.bankTransactionId);

  const { data: correction, error: corrErr } = await admin
    .from('reconciliation_corrections')
    .insert({
      workspace_id: orgId,
      organisation_id: orgId,
      bank_line_id: params.bankTransactionId,
      bank_reconciliation_match_id: brm?.id ?? null,
      original_source_type: sourceType,
      original_source_id: sourceId,
      original_journal_id: journalId,
      reversal_journal_id: reversalJournalId,
      correction_type: 'unreconcile',
      journal_action: journalAction,
      reason,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (corrErr || !correction) {
    return { ok: false, error: corrErr?.message ?? 'Failed to record unreconcile history.' };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'bank_transaction_unreconciled',
    entityType: 'bank_line',
    entityId: params.bankTransactionId,
    metadata: {
      correctionId: correction.id,
      sourceType,
      sourceId,
      originalJournalId: journalId,
      reversalJournalId,
      journalAction,
    },
  });

  invalidateOrgReportCache(orgId);
  revalidatePath('/reconciliation');
  revalidatePath('/donations');
  revalidatePath('/gift-aid');
  revalidatePath('/lettings');
  revalidatePath('/banking');
  revalidatePath('/journals');

  return { ok: true, correctionId: correction.id, reversalJournalId };
}
