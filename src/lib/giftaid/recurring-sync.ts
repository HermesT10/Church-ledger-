import { createAdminClient } from '@/lib/supabase/admin';
import {
  detectRecurringDonorPatterns,
  type DonationForRecurringDetection,
  type DetectedRecurringPattern,
} from './recurring-donor-detection';

const DONATION_LOOKBACK_DAYS = 730;

/**
 * Loads posted donations with optional bank reference, detects recurring slices, replaces active/paused rows.
 */
export async function runRecurringDonorPatternSync(
  organisationId: string
): Promise<{ error: string | null; insertedCount: number }> {
  const admin = createAdminClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - DONATION_LOOKBACK_DAYS);

  const { data: raw, error: loadError } = await admin
    .from('donations')
    .select('id, donor_id, donation_date, amount_pence, provider_reference, bank_transaction_id')
    .eq('organisation_id', organisationId)
    .eq('status', 'posted')
    .not('donor_id', 'is', null)
    .gte('donation_date', since.toISOString().slice(0, 10))
    .limit(6000);

  if (loadError) {
    return { error: loadError.message, insertedCount: 0 };
  }

  const bankIds = [...new Set((raw ?? []).map((row) => row.bank_transaction_id).filter(Boolean))] as string[];

  const bankLinesById = new Map<
    string,
    { reference: string | null; description: string | null }
  >();
  if (bankIds.length > 0) {
    const { data: banks } = await admin
      .from('bank_lines')
      .select('id, reference, description')
      .eq('organisation_id', organisationId)
      .in('id', bankIds);
    for (const bl of banks ?? []) {
      bankLinesById.set(bl.id as string, {
        reference: bl.reference ?? null,
        description: bl.description ?? null,
      });
    }
  }

  const mapped: DonationForRecurringDetection[] = (raw ?? []).map((row) => {
    const bankPk = row.bank_transaction_id as string | null;
    const bl = bankPk ? bankLinesById.get(bankPk) : undefined;
    const ref = bl?.reference?.trim() || bl?.description?.trim() || null;
    const amount = Number(row.amount_pence ?? 0);
    return {
      id: row.id as string,
      donor_id: row.donor_id as string,
      donation_date: String(row.donation_date ?? '').slice(0, 10),
      amount_pence: amount,
      provider_reference: (row.provider_reference as string | null) ?? null,
      bank_reference: ref,
    };
  });

  const detected = detectRecurringDonorPatterns(mapped);

  const { data: dismissedRows } = await admin
    .from('recurring_donor_patterns')
    .select('donor_id, pattern_signature')
    .eq('workspace_id', organisationId)
    .eq('status', 'dismissed');

  const dismissed = new Set(
    (dismissedRows ?? []).map((row) => `${row.donor_id}|${row.pattern_signature}`)
  );

  const { error: deleteError } = await admin
    .from('recurring_donor_patterns')
    .delete()
    .eq('workspace_id', organisationId)
    .in('status', ['active', 'paused']);

  if (deleteError) {
    return { error: deleteError.message, insertedCount: 0 };
  }

  const toInsert = detected.filter((row) => !dismissed.has(`${row.donor_id}|${row.pattern_signature}`));

  if (toInsert.length === 0) {
    return { error: null, insertedCount: 0 };
  }

  const payloads = toInsert.map((p) => insertRowPayload(organisationId, p));
  const { error: insertError } = await admin.from('recurring_donor_patterns').insert(payloads);

  if (insertError) {
    return { error: insertError.message, insertedCount: 0 };
  }

  return { error: null, insertedCount: payloads.length };
}

function insertRowPayload(organisationId: string, p: DetectedRecurringPattern) {
  return {
    workspace_id: organisationId,
    donor_id: p.donor_id,
    pattern_signature: p.pattern_signature,
    pattern_type: p.pattern_type,
    expected_amount_pence: p.expected_amount_pence,
    amount_tolerance_pence: p.amount_tolerance_pence,
    expected_day_of_month: p.expected_day_of_month,
    bank_reference_alias: p.bank_reference_alias,
    normalized_bank_reference: p.normalized_bank_reference,
    confidence_score: p.confidence_score,
    status: 'active' as const,
    grace_days: 7,
    last_detected_at: p.last_detected_at,
    last_occurrence_at: p.last_occurrence_at,
    next_expected_date: p.next_expected_date,
    occurrence_count: p.occurrence_count,
  };
}
