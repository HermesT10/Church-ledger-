/**
 * Posted Gift Aid HMRC reclaim journal — shared by legacy {@link recordGiftAidPayment}
 * and batched allocation confirmation.
 */

import { createAdminClient } from '@/lib/supabase/admin';

interface JournalLineInput {
  account_id: string;
  fund_id: string | null;
  description: string;
  debit_pence: number;
  credit_pence: number;
}

export async function createPostedGiftAidReclaimJournal(options: {
  orgId: string;
  claimOrBatchId: string;
  paymentDate: string;
  amountPence: number;
  userId: string;
}): Promise<{ journalId: string } | { error: string }> {
  const { orgId, claimOrBatchId, paymentDate, amountPence, userId } = options;

  const giftAidPence = amountPence;
  if (giftAidPence <= 0) {
    return { error: 'Gift Aid amount must be positive.' };
  }

  const admin = createAdminClient();

  const { data: settings } = await admin
    .from('organisation_settings')
    .select('gift_aid_income_account_id, gift_aid_bank_account_id, gift_aid_default_fund_id, gift_aid_use_proportional_funds')
    .eq('organisation_id', orgId)
    .single();

  if (!settings?.gift_aid_income_account_id) {
    return { error: 'Gift Aid Income account not configured. Set it in Settings.' };
  }

  if (!settings?.gift_aid_bank_account_id) {
    return { error: 'Gift Aid Bank account not configured. Set it in Settings.' };
  }

  const incomeAccountId = settings.gift_aid_income_account_id;
  const bankAccountId = settings.gift_aid_bank_account_id;
  const useProportionalFunds = settings.gift_aid_use_proportional_funds ?? true;
  const defaultFundId = settings.gift_aid_default_fund_id ?? null;

  const journalLines: JournalLineInput[] = [];

  if (useProportionalFunds) {
    const { data: claimDonations } = await admin
      .from('donations')
      .select('fund_id, amount_pence')
      .eq('organisation_id', orgId)
      .or(`gift_aid_claim_id.eq.${claimOrBatchId},gift_aid_claim_batch_id.eq.${claimOrBatchId}`);

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

        journalLines.push({
          account_id: incomeAccountId,
          fund_id: fundId,
          description: 'Gift Aid reclaim — HMRC payment',
          debit_pence: 0,
          credit_pence: portion,
        });

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
      },
    );
  }

  const memo = `Gift Aid HMRC Payment — Claim ${claimOrBatchId.slice(0, 8)}`;

  const { data: journal, error: journalErr } = await admin
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: paymentDate,
      memo,
      status: 'draft',
      source_type: 'gift_aid',
      source_id: claimOrBatchId,
      created_by: userId,
    })
    .select('id')
    .single();

  if (journalErr || !journal) {
    return { error: journalErr?.message ?? 'Failed to create journal.' };
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

  const { error: jLinesErr } = await admin.from('journal_lines').insert(jRows);

  if (jLinesErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    return { error: jLinesErr.message };
  }

  const { error: postErr } = await admin
    .from('journals')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', journal.id);

  if (postErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    return { error: postErr.message };
  }

  return { journalId: journal.id };
}
