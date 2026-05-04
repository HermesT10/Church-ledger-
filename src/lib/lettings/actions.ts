'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import { invalidateOrgReportCache } from '@/lib/cache';
import { getActiveOrg } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isDateInLockedPeriod } from '@/lib/periods/actions';
import { monthDueDate } from './status';
import type {
  LettingsChargeStatus,
  LettingsChargeRow,
  LettingsHirerRow,
  LettingsRegisterHirer,
  LettingsYearData,
} from './types';
import { lettingsChargeInputSchema } from './schema';
import type { LettingsPostingOverrides } from './actions.types';

type ActionResult<T = null> = { data: T | null; error: string | null };

const hirerSchema = z.object({
  name: z.string().trim().min(1, 'Hirer name is required.').max(200),
  contactName: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email().optional().or(z.literal('')).nullable(),
  phone: z.string().trim().max(80).optional().nullable(),
  defaultRoomName: z.string().trim().max(160).optional().nullable(),
  defaultRatePence: z.number().int().nonnegative().nullable().optional(),
  defaultFundId: z.string().uuid().nullable().optional(),
  defaultIncomeAccountId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const chargeSchema = lettingsChargeInputSchema;

function clean(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function penceFromForm(value: FormDataEntryValue | null): number {
  const raw = String(value ?? '0').replace(/[£,]/g, '').trim();
  return Math.round((Number.parseFloat(raw || '0') || 0) * 100);
}

async function assertLettingsWrite() {
  await assertWriteAllowed();
  const ctx = await getActiveOrg();
  if (ctx.role !== 'admin' && ctx.role !== 'treasurer') {
    throw new Error('Permission denied.');
  }
  return ctx;
}

/** Reconciliation: resolve hirer by case-insensitive name or insert (active hirers only). */
export async function findOrCreateLettingsHirerForReconciliation(name: string): Promise<ActionResult<{ id: string; created: boolean }>> {
  let ctx;
  try {
    ctx = await assertLettingsWrite();
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Permission denied.' };
  }

  const trimmed = name.trim();
  if (!trimmed) return { data: null, error: 'Hirer name is required.' };

  const supabase = await createClient();
  const { data: candidates } = await supabase
    .from('lettings_hirers')
    .select('id, name')
    .eq('organisation_id', ctx.orgId)
    .neq('status', 'archived');

  const lower = trimmed.toLowerCase();
  const found = (candidates ?? []).find((row) => String(row.name).trim().toLowerCase() === lower);
  if (found) return { data: { id: found.id, created: false }, error: null };

  const { data: inserted, error } = await supabase
    .from('lettings_hirers')
    .insert({
      organisation_id: ctx.orgId,
      name: trimmed,
      created_by: ctx.user.id,
    })
    .select('id')
    .single();

  if (error || !inserted) return { data: null, error: error?.message ?? 'Unable to create lettings hirer.' };

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'lettings_hirer_create',
    entityType: 'lettings_hirer',
    entityId: inserted.id,
    metadata: { name: trimmed, source: 'reconciliation' },
  });

  revalidatePath('/lettings');
  return { data: { id: inserted.id, created: true }, error: null };
}

function mergeLettingsPosting(
  defaults: {
    bankAccountId: string | null;
    incomeAccountId: string | null;
    fundId: string | null;
    incomeStreamId: string | null;
  },
  overrides: LettingsPostingOverrides | null | undefined,
) {
  if (!overrides) return defaults;
  const fundId = overrides.fundId?.trim() ? overrides.fundId : defaults.fundId;
  const incomeAccountId = overrides.incomeAccountId?.trim() ? overrides.incomeAccountId : defaults.incomeAccountId;
  const incomeStreamId = overrides.incomeStreamId?.trim() ? overrides.incomeStreamId : defaults.incomeStreamId;
  return {
    bankAccountId: defaults.bankAccountId,
    incomeAccountId,
    fundId,
    incomeStreamId,
  };
}

export async function getLettingsYearData(year = new Date().getFullYear()): Promise<{
  data: LettingsYearData | null;
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const [{ data: hirers, error: hirerError }, { data: charges, error: chargeError }] = await Promise.all([
    supabase
      .from('lettings_hirers')
      .select('*')
      .eq('organisation_id', orgId)
      .neq('status', 'archived')
      .order('name'),
    supabase
      .from('lettings_charges')
      .select('*')
      .eq('organisation_id', orgId)
      .eq('period_year', year)
      .order('period_month'),
  ]);

  if (hirerError || chargeError) {
    return { data: null, error: hirerError?.message ?? chargeError?.message ?? 'Unable to load lettings.' };
  }

  const chargeMap = new Map<string, LettingsChargeRow>();
  for (const charge of (charges ?? []) as LettingsChargeRow[]) {
    chargeMap.set(`${charge.hirer_id}:${charge.period_month}`, charge);
  }

  const monthlyTotals = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    expectedPence: 0,
    paidPence: 0,
    outstandingPence: 0,
  }));

  const rows: LettingsRegisterHirer[] = ((hirers ?? []) as LettingsHirerRow[]).map((hirer) => {
    const months = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const charge = chargeMap.get(`${hirer.id}:${month}`);
      const expectedPence = Number(charge?.expected_amount_pence ?? 0);
      const paidPence = Number(charge?.paid_amount_pence ?? 0);
      const outstandingPence = Number(charge?.outstanding_amount_pence ?? 0);
      monthlyTotals[index].expectedPence += expectedPence;
      monthlyTotals[index].paidPence += paidPence;
      monthlyTotals[index].outstandingPence += outstandingPence;
      return {
        month,
        chargeId: charge?.id ?? null,
        expectedPence,
        paidPence,
        outstandingPence,
        status: (charge?.status ?? 'not_set') as LettingsChargeStatus | 'not_set',
      };
    });

    const totalExpectedPence = months.reduce((sum, month) => sum + month.expectedPence, 0);
    const totalPaidPence = months.reduce((sum, month) => sum + month.paidPence, 0);
    const totalOutstandingPence = months.reduce((sum, month) => sum + month.outstandingPence, 0);

    return {
      hirer,
      months,
      totalExpectedPence,
      totalPaidPence,
      totalOutstandingPence,
      status: hirer.status !== 'active' ? 'inactive' : totalOutstandingPence > 0 ? 'outstanding' : 'clear',
    };
  });

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const allCharges = (charges ?? []) as LettingsChargeRow[];
  const summary = {
    incomeThisYearPence: allCharges.reduce((sum, charge) => sum + Number(charge.paid_amount_pence ?? 0), 0),
    incomeThisMonthPence:
      year === currentYear
        ? allCharges
            .filter((charge) => charge.period_month === currentMonth)
            .reduce((sum, charge) => sum + Number(charge.paid_amount_pence ?? 0), 0)
        : 0,
    outstandingPence: allCharges.reduce((sum, charge) => sum + Number(charge.outstanding_amount_pence ?? 0), 0),
    overdueCount: allCharges.filter((charge) => charge.status === 'overdue').length,
    activeHirerCount: rows.filter((row) => row.hirer.status === 'active').length,
    expectedThisYearPence: allCharges.reduce((sum, charge) => sum + Number(charge.expected_amount_pence ?? 0), 0),
  };

  return {
    data: { year, summary, hirers: rows, monthlyTotals },
    error: null,
  };
}

export async function createLettingsHirer(input: z.infer<typeof hirerSchema>): Promise<ActionResult<{ id: string }>> {
  let ctx;
  try {
    ctx = await assertLettingsWrite();
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Permission denied.' };
  }

  const parsed = hirerSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? 'Invalid hirer.' };

  const supabase = await createClient();
  const v = parsed.data;
  const { data, error } = await supabase
    .from('lettings_hirers')
    .insert({
      organisation_id: ctx.orgId,
      name: v.name,
      contact_name: v.contactName ?? null,
      email: v.email || null,
      phone: v.phone ?? null,
      default_room_name: v.defaultRoomName ?? null,
      default_rate_pence: v.defaultRatePence ?? null,
      default_fund_id: v.defaultFundId ?? null,
      default_income_account_id: v.defaultIncomeAccountId ?? null,
      notes: v.notes ?? null,
      created_by: ctx.user.id,
    })
    .select('id')
    .single();

  if (error || !data) return { data: null, error: error?.message ?? 'Unable to create hirer.' };

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'lettings_hirer_create',
    entityType: 'lettings_hirer',
    entityId: data.id,
    metadata: { name: v.name },
  });

  revalidatePath('/lettings');
  return { data: { id: data.id }, error: null };
}

export async function createLettingsHirerAction(formData: FormData) {
  const result = await createLettingsHirer({
    name: String(formData.get('name') ?? ''),
    contactName: clean(formData.get('contact_name')),
    email: clean(formData.get('email')),
    phone: clean(formData.get('phone')),
    defaultRoomName: clean(formData.get('default_room_name')),
    defaultRatePence: formData.get('default_rate') ? penceFromForm(formData.get('default_rate')) : null,
    defaultFundId: clean(formData.get('default_fund_id')),
    defaultIncomeAccountId: clean(formData.get('default_income_account_id')),
    notes: clean(formData.get('notes')),
  });
  if (result.error) redirect('/lettings?error=' + encodeURIComponent(result.error));
  redirect('/lettings');
}

export async function createLettingsCharge(input: z.infer<typeof chargeSchema>): Promise<ActionResult<{ id: string }>> {
  let ctx;
  try {
    ctx = await assertLettingsWrite();
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Permission denied.' };
  }

  const parsed = chargeSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? 'Invalid charge.' };

  const supabase = await createClient();
  const v = parsed.data;
  const { data, error } = await supabase
    .from('lettings_charges')
    .insert({
      organisation_id: ctx.orgId,
      hirer_id: v.hirerId,
      period_year: v.periodYear,
      period_month: v.periodMonth,
      description: v.description ?? null,
      expected_amount_pence: v.expectedAmountPence,
      due_date: v.dueDate || monthDueDate(v.periodYear, v.periodMonth),
      default_fund_id: v.defaultFundId,
      default_income_account_id: v.defaultIncomeAccountId,
      created_by: ctx.user.id,
    })
    .select('id')
    .single();

  if (error || !data) return { data: null, error: error?.message ?? 'Unable to create monthly charge.' };

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'lettings_charge_create',
    entityType: 'lettings_charge',
    entityId: data.id,
    metadata: { hirerId: v.hirerId, year: v.periodYear, month: v.periodMonth, expected: v.expectedAmountPence },
  });

  revalidatePath('/lettings');
  return { data: { id: data.id }, error: null };
}

export async function createLettingsChargeAction(formData: FormData) {
  const year = Number.parseInt(String(formData.get('period_year') ?? new Date().getFullYear()), 10);
  const result = await createLettingsCharge({
    hirerId: String(formData.get('hirer_id') ?? ''),
    periodYear: year,
    periodMonth: Number.parseInt(String(formData.get('period_month') ?? '1'), 10),
    description: clean(formData.get('description')),
    expectedAmountPence: penceFromForm(formData.get('expected_amount')),
    dueDate: clean(formData.get('due_date')),
    defaultFundId: clean(formData.get('default_fund_id')) ?? '',
    defaultIncomeAccountId: clean(formData.get('default_income_account_id')) ?? '',
  });
  if (result.error) redirect(`/lettings?year=${year}&error=` + encodeURIComponent(result.error));
  redirect(`/lettings?year=${year}`);
}

async function resolveLettingsPostingDefaults(orgId: string, charge: LettingsChargeRow & { hirer: LettingsHirerRow }, bankAccountId: string) {
  const supabase = await createClient();
  const [{ data: bankAccount }, { data: fallbackAccount }, { data: fallbackFund }, { data: incomeStream }] = await Promise.all([
    supabase
      .from('bank_accounts')
      .select('linked_account_id')
      .eq('id', bankAccountId)
      .eq('organisation_id', orgId)
      .maybeSingle(),
    supabase
      .from('accounts')
      .select('id')
      .eq('organisation_id', orgId)
      .eq('type', 'income')
      .or('code.eq.INC-004,subtype.eq.Lettings,name.ilike.%Lettings%')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('funds')
      .select('id')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .eq('type', 'unrestricted')
      .order('name')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('income_streams')
      .select('id')
      .eq('organisation_id', orgId)
      .eq('code', 'LETTINGS')
      .eq('status', 'active')
      .maybeSingle(),
  ]);

  return {
    bankAccountId: bankAccount?.linked_account_id as string | null,
    incomeAccountId: charge.default_income_account_id ?? charge.hirer.default_income_account_id ?? fallbackAccount?.id ?? null,
    fundId: charge.default_fund_id ?? charge.hirer.default_fund_id ?? fallbackFund?.id ?? null,
    incomeStreamId: incomeStream?.id ?? null,
  };
}

export async function reconcileLettingsChargeFromBankLine(params: {
  bankTransactionId: string;
  chargeId: string;
  orgId: string;
  userId: string;
  /** User overrides for journal credit line (fund, income account, income stream). */
  postingOverrides?: LettingsPostingOverrides | null;
}): Promise<ActionResult<{ paymentId: string; journalId: string }>> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const [bankRes, chargeRes] = await Promise.all([
    supabase
      .from('bank_lines')
      .select('id, organisation_id, bank_account_id, txn_date, description, reference, amount_pence, reconciled, allocated, status')
      .eq('id', params.bankTransactionId)
      .eq('organisation_id', params.orgId)
      .maybeSingle(),
    supabase
      .from('lettings_charges')
      .select('*, hirer:lettings_hirers(*)')
      .eq('id', params.chargeId)
      .eq('organisation_id', params.orgId)
      .maybeSingle(),
  ]);

  if (!bankRes.data) return { data: null, error: 'Bank transaction not found.' };
  if (!chargeRes.data) return { data: null, error: 'Lettings charge not found.' };
  if (bankRes.data.reconciled || bankRes.data.allocated || bankRes.data.status === 'excluded') {
    return { data: null, error: 'This bank transaction is already reconciled, allocated, or excluded.' };
  }
  if (Number(bankRes.data.amount_pence) <= 0) {
    return { data: null, error: 'Lettings reconciliation requires a money-in bank transaction.' };
  }
  if (await isDateInLockedPeriod(bankRes.data.txn_date)) {
    return { data: null, error: 'Cannot post lettings income to a locked financial period.' };
  }

  const charge = chargeRes.data as LettingsChargeRow & { hirer: LettingsHirerRow };
  if (charge.status === 'cancelled' || charge.status === 'waived') {
    return { data: null, error: 'Cancelled or waived lettings charges cannot be reconciled.' };
  }

  const duplicate = await supabase
    .from('lettings_payments')
    .select('id')
    .eq('organisation_id', params.orgId)
    .eq('bank_transaction_id', params.bankTransactionId)
    .neq('status', 'voided')
    .maybeSingle();
  if (duplicate.data) return { data: null, error: 'This bank transaction is already linked to a Lettings payment.' };

  const defaultsRaw = await resolveLettingsPostingDefaults(params.orgId, charge, bankRes.data.bank_account_id);
  const defaults = mergeLettingsPosting(defaultsRaw, params.postingOverrides ?? null);
  if (!defaults.bankAccountId) return { data: null, error: 'The bank account is not linked to a ledger asset account.' };
  if (!defaults.incomeAccountId) return { data: null, error: 'No Lettings Income account could be found.' };
  if (!defaults.fundId) return { data: null, error: 'No default fund could be found for this Lettings payment.' };

  const amountPence = Math.abs(Number(bankRes.data.amount_pence));
  const { data: payment, error: paymentError } = await admin
    .from('lettings_payments')
    .insert({
      organisation_id: params.orgId,
      hirer_id: charge.hirer_id,
      lettings_charge_id: charge.id,
      bank_transaction_id: params.bankTransactionId,
      payment_date: bankRes.data.txn_date,
      amount_pence: amountPence,
      status: 'reconciled',
      created_by: params.userId,
    })
    .select('id')
    .single();

  if (paymentError || !payment) {
    return { data: null, error: paymentError?.message ?? 'Unable to create Lettings payment.' };
  }

  const { data: journal, error: journalError } = await admin
    .from('journals')
    .insert({
      organisation_id: params.orgId,
      journal_date: bankRes.data.txn_date,
      reference: bankRes.data.reference,
      memo: `Lettings payment: ${charge.hirer.name}`,
      status: 'draft',
      source_type: 'lettings_payment',
      source_id: payment.id,
      created_by: params.userId,
    })
    .select('id')
    .single();

  if (journalError || !journal) {
    await admin.from('lettings_payments').delete().eq('id', payment.id).eq('organisation_id', params.orgId);
    return { data: null, error: journalError?.message ?? 'Unable to post Lettings payment.' };
  }

  const { error: linesError } = await admin.from('journal_lines').insert([
    {
      journal_id: journal.id,
      organisation_id: params.orgId,
      account_id: defaults.bankAccountId,
      fund_id: null,
      description: `Bank receipt: ${bankRes.data.description ?? charge.hirer.name}`,
      debit_pence: amountPence,
      credit_pence: 0,
    },
    {
      journal_id: journal.id,
      organisation_id: params.orgId,
      account_id: defaults.incomeAccountId,
      fund_id: defaults.fundId,
      income_stream_id: defaults.incomeStreamId,
      description: charge.description ?? `Lettings income: ${charge.hirer.name}`,
      debit_pence: 0,
      credit_pence: amountPence,
    },
  ]);

  if (linesError) {
    await admin.from('journal_lines').delete().eq('journal_id', journal.id);
    await admin.from('journals').delete().eq('id', journal.id);
    await admin.from('lettings_payments').delete().eq('id', payment.id).eq('organisation_id', params.orgId);
    return { data: null, error: linesError.message };
  }

  const { error: postError } = await admin
    .from('journals')
    .update({
      status: 'posted',
      approved_by: params.userId,
      approved_at: now,
      posted_at: now,
    })
    .eq('id', journal.id)
    .eq('organisation_id', params.orgId);

  if (postError) {
    await admin.from('journal_lines').delete().eq('journal_id', journal.id);
    await admin.from('journals').delete().eq('id', journal.id);
    await admin.from('lettings_payments').delete().eq('id', payment.id).eq('organisation_id', params.orgId);
    return { data: null, error: postError.message };
  }

  await admin
    .from('lettings_payments')
    .update({ posted_journal_id: journal.id })
    .eq('id', payment.id)
    .eq('organisation_id', params.orgId);

  await logAuditEvent({
    orgId: params.orgId,
    userId: params.userId,
    action: 'lettings_payment_reconciled',
    entityType: 'lettings_payment',
    entityId: payment.id,
    metadata: {
      chargeId: charge.id,
      hirerId: charge.hirer_id,
      bankTransactionId: params.bankTransactionId,
      journalId: journal.id,
      amount: amountPence,
    },
  });

  revalidatePath('/lettings');
  revalidatePath('/reconciliation');
  invalidateOrgReportCache(params.orgId);
  return { data: { paymentId: payment.id, journalId: journal.id }, error: null };
}
