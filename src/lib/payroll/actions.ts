'use server';

import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { invalidateOrgReportCache } from '@/lib/cache';
import { logAuditEvent } from '@/lib/audit';
import {
  getFinancialPeriodIdForDate,
  isDateInLockedPeriod,
} from '@/lib/periods/actions';
import {
  validatePayrollInputs,
  buildPayrollJournalLines,
  computeGross,
} from './validation';
import type { PayrollSplit } from './validation';
import type { PayrollRunSummary, PayrollRunDetail } from './types';
import type { PayrollLineWithEmployee } from '@/lib/employees/types';

async function logApprovalEvent(params: {
  orgId: string;
  entityId: string;
  action: string;
  performedBy: string;
  notes?: string;
}) {
  const supabase = await createClient();
  await supabase.from('approval_events').insert({
    organisation_id: params.orgId,
    entity_type: 'payroll_run',
    entity_id: params.entityId,
    action: params.action,
    performed_by: params.performedBy,
    notes: params.notes ?? null,
  });
}

/* ------------------------------------------------------------------ */
/*  listPayrollRuns                                                    */
/* ------------------------------------------------------------------ */

export async function listPayrollRuns(
  orgId: string,
): Promise<PayrollRunSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('organisation_id', orgId)
    .order('payroll_month', { ascending: false });

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    payrollMonth: r.payroll_month,
    status: r.status,
    totalGrossPence: Number(r.total_gross_pence),
    totalNetPence: Number(r.total_net_pence),
    totalPayePence: Number(r.total_paye_pence),
    totalNicPence: Number(r.total_nic_pence),
    totalPensionPence: Number(r.total_pension_pence),
    journalId: r.journal_id,
    createdAt: r.created_at,
  }));
}

/* ------------------------------------------------------------------ */
/*  getPayrollRun                                                      */
/* ------------------------------------------------------------------ */

export async function getPayrollRun(
  runId: string,
): Promise<PayrollRunDetail | null> {
  const supabase = await createClient();

  const { data: run, error } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error || !run) return null;

  // Fetch splits with fund names
  const { data: splits } = await supabase
    .from('payroll_run_splits')
    .select('id, fund_id, amount_pence, funds(name)')
    .eq('payroll_run_id', runId);

  const mappedSplits = (splits ?? []).map((s: Record<string, unknown>) => {
    const fund = s.funds as { name: string } | null;
    return {
      id: s.id as string,
      fundId: (s.fund_id as string) ?? null,
      fundName: fund?.name ?? null,
      amountPence: Number(s.amount_pence),
    };
  });

  // Fetch payroll lines (per-employee breakdown)
  const { data: plData } = await supabase
    .from('payroll_lines')
    .select('*, employees(full_name)')
    .eq('payroll_run_id', runId)
    .order('created_at');

  const payrollLines: PayrollLineWithEmployee[] = (plData ?? []).map((row) => ({
    id: row.id,
    payroll_run_id: row.payroll_run_id,
    employee_id: row.employee_id,
    gross_pence: Number(row.gross_pence),
    tax_pence: Number(row.tax_pence),
    pension_pence: Number(row.pension_pence),
    employer_ni_pence: Number(row.employer_ni_pence),
    net_pence: Number(row.net_pence),
    created_at: row.created_at,
    employee_name: (row.employees as { full_name: string } | null)?.full_name ?? 'Unknown',
  }));

  return {
    id: run.id,
    organisationId: run.organisation_id,
    payrollMonth: run.payroll_month,
    periodStart: run.period_start ?? null,
    periodEnd: run.period_end ?? null,
    status: run.status,
    totalGrossPence: Number(run.total_gross_pence),
    totalNetPence: Number(run.total_net_pence),
    totalPayePence: Number(run.total_paye_pence),
    totalNicPence: Number(run.total_nic_pence),
    totalPensionPence: Number(run.total_pension_pence),
    journalId: run.journal_id,
    createdBy: run.created_by,
    createdAt: run.created_at,
    splits: mappedSplits,
    payrollLines,
  };
}

/* ------------------------------------------------------------------ */
/*  createPayrollRun                                                   */
/* ------------------------------------------------------------------ */

export interface PayrollLineInput {
  employeeId: string;
  grossPence: number;
  taxPence: number;
  pensionPence: number;
  employerNiPence: number;
  netPence: number;
}

export async function createPayrollRun(params: {
  payrollMonth: string; // 'YYYY-MM-DD' (first day of month)
  periodStart?: string;
  periodEnd?: string;
  netPence: number;
  payePence: number;
  nicPence: number;
  pensionPence: number;
  grossPence?: number;
  splits?: PayrollSplit[];
  payrollLines?: PayrollLineInput[];
}): Promise<{ id?: string; error?: string }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try { assertCanPerform(role, 'create', 'payroll'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const gross =
    params.grossPence && params.grossPence > 0
      ? params.grossPence
      : computeGross(params.netPence, params.payePence);

  const validation = validatePayrollInputs(
    {
      netPence: params.netPence,
      payePence: params.payePence,
      nicPence: params.nicPence,
      pensionPence: params.pensionPence,
      grossPence: gross,
    },
    params.splits,
  );

  if (!validation.valid) {
    return { error: validation.errors.join(' ') };
  }

  // Validate payroll lines if provided – totals must match header
  if (params.payrollLines && params.payrollLines.length > 0) {
    const linesGross = params.payrollLines.reduce((s, l) => s + l.grossPence, 0);
    const linesNet = params.payrollLines.reduce((s, l) => s + l.netPence, 0);
    const linesTax = params.payrollLines.reduce((s, l) => s + l.taxPence, 0);
    const linesNi = params.payrollLines.reduce((s, l) => s + l.employerNiPence, 0);
    const linesPension = params.payrollLines.reduce((s, l) => s + l.pensionPence, 0);

    if (linesGross !== gross) {
      return { error: `Payroll lines gross (${linesGross}) does not match total gross (${gross}).` };
    }
    if (linesNet !== params.netPence) {
      return { error: `Payroll lines net (${linesNet}) does not match total net (${params.netPence}).` };
    }
    if (linesTax !== params.payePence) {
      return { error: `Payroll lines PAYE (${linesTax}) does not match total PAYE (${params.payePence}).` };
    }
    if (linesNi !== params.nicPence) {
      return { error: `Payroll lines employer NI (${linesNi}) does not match total NI (${params.nicPence}).` };
    }
    if (linesPension !== params.pensionPence) {
      return { error: `Payroll lines pension (${linesPension}) does not match total pension (${params.pensionPence}).` };
    }
  }

  const supabase = await createClient();

  // Insert payroll run
  const { data: run, error: runErr } = await supabase
    .from('payroll_runs')
    .insert({
      organisation_id: orgId,
      payroll_month: params.payrollMonth,
      period_start: params.periodStart ?? null,
      period_end: params.periodEnd ?? null,
      status: 'draft',
      total_gross_pence: gross,
      total_net_pence: params.netPence,
      total_paye_pence: params.payePence,
      total_nic_pence: params.nicPence,
      total_pension_pence: params.pensionPence,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (runErr || !run) {
    return { error: runErr?.message ?? 'Failed to create payroll run.' };
  }

  // Insert payroll lines if provided
  if (params.payrollLines && params.payrollLines.length > 0) {
    const lineRows = params.payrollLines.map((l) => ({
      payroll_run_id: run.id,
      employee_id: l.employeeId,
      gross_pence: l.grossPence,
      tax_pence: l.taxPence,
      pension_pence: l.pensionPence,
      employer_ni_pence: l.employerNiPence,
      net_pence: l.netPence,
    }));

    const { error: linesErr } = await supabase
      .from('payroll_lines')
      .insert(lineRows);

    if (linesErr) {
      await supabase.from('payroll_runs').delete().eq('id', run.id);
      return { error: linesErr.message };
    }
  }

  // Insert splits if provided
  if (params.splits && params.splits.length > 0) {
    const splitRows = params.splits.map((s) => ({
      payroll_run_id: run.id,
      fund_id: s.fundId,
      amount_pence: s.amountPence,
    }));

    const { error: splitsErr } = await supabase
      .from('payroll_run_splits')
      .insert(splitRows);

    if (splitsErr) {
      await supabase.from('payroll_runs').delete().eq('id', run.id);
      return { error: splitsErr.message };
    }
  }

  await logApprovalEvent({
    orgId,
    entityId: run.id,
    action: 'created',
    performedBy: user.id,
  });

  return { id: run.id };
}

/* ------------------------------------------------------------------ */
/*  postPayrollRun                                                     */
/* ------------------------------------------------------------------ */

export async function postPayrollRun(
  runId: string,
): Promise<{ error?: string }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try { assertCanPerform(role, 'post', 'payroll'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const admin = createAdminClient();

  // 1. Fetch payroll run
  const { data: run, error: runErr } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('id', runId)
    .eq('organisation_id', orgId)
    .single();

  if (runErr || !run) {
    return { error: runErr?.message ?? 'Payroll run not found.' };
  }

  // Idempotency: if already posted, return success
  if (run.status === 'posted') {
    return {};
  }

  if (run.status !== 'draft') {
    return { error: 'Only draft payroll runs can be posted.' };
  }

  // Period lock check
  const locked = await isDateInLockedPeriod(run.payroll_month);
  if (locked) {
    return { error: 'Cannot post: payroll month falls in a locked financial period.' };
  }

  // 2. Fetch splits
  const { data: splits } = await supabase
    .from('payroll_run_splits')
    .select('*')
    .eq('payroll_run_id', runId);

  // 3. Fetch payroll account mappings
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select(
      'payroll_salaries_account_id, payroll_er_nic_account_id, payroll_pension_account_id, payroll_paye_nic_liability_id, payroll_pension_liability_id, payroll_net_pay_liability_id',
    )
    .eq('organisation_id', orgId)
    .single();

  if (!settings) {
    return { error: 'Organisation settings not found.' };
  }

  // Validate all 6 accounts are configured
  const {
    payroll_salaries_account_id,
    payroll_er_nic_account_id,
    payroll_pension_account_id,
    payroll_paye_nic_liability_id,
    payroll_pension_liability_id,
    payroll_net_pay_liability_id,
  } = settings;

  if (
    !payroll_salaries_account_id ||
    !payroll_er_nic_account_id ||
    !payroll_pension_account_id ||
    !payroll_paye_nic_liability_id ||
    !payroll_pension_liability_id ||
    !payroll_net_pay_liability_id
  ) {
    return {
      error:
        'All 6 payroll accounts must be configured in Settings → Payroll Accounts before posting.',
    };
  }

  const grossPence = Number(run.total_gross_pence);
  const netPence = Number(run.total_net_pence);
  const payePence = Number(run.total_paye_pence);
  const nicPence = Number(run.total_nic_pence);
  const pensionPence = Number(run.total_pension_pence);

  // 4. Build journal lines
  const payrollSplits: PayrollSplit[] | undefined =
    splits && splits.length > 0
      ? splits.map((s) => ({
          fundId: s.fund_id ?? null,
          amountPence: Number(s.amount_pence),
        }))
      : undefined;

  const journalLines = buildPayrollJournalLines({
    grossPence,
    netPence,
    payePence,
    nicPence,
    pensionPence,
    splits: payrollSplits,
    accountIds: {
      salariesAccountId: payroll_salaries_account_id,
      erNicAccountId: payroll_er_nic_account_id,
      pensionAccountId: payroll_pension_account_id,
      payeNicLiabilityId: payroll_paye_nic_liability_id,
      pensionLiabilityId: payroll_pension_liability_id,
      netPayLiabilityId: payroll_net_pay_liability_id,
    },
  });

  // 5. Verify balance
  const totalDebits = journalLines.reduce((sum, l) => sum + l.debitPence, 0);
  const totalCredits = journalLines.reduce((sum, l) => sum + l.creditPence, 0);

  if (totalDebits !== totalCredits) {
    return {
      error: `Journal is unbalanced: debits=${totalDebits}, credits=${totalCredits}.`,
    };
  }

  // 6. Create journal with source_type + source_id
  const monthLabel = run.payroll_month.slice(0, 7); // YYYY-MM
  const memo = `Payroll – ${monthLabel}`;
  const periodId = await getFinancialPeriodIdForDate(run.payroll_month);

  const { data: journal, error: journalErr } = await admin
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: run.payroll_month,
      memo,
      status: 'draft',
      period_id: periodId,
      source_type: 'payroll',
      source_id: runId,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (journalErr || !journal) {
    return {
      error: journalErr?.message ?? 'Failed to create journal.',
    };
  }

  // 7. Insert journal lines
  const jRows = journalLines.map((jl) => ({
    journal_id: journal.id,
    organisation_id: orgId,
    account_id: jl.accountId,
    fund_id: jl.fundId || null,
    description: jl.memo,
    debit_pence: jl.debitPence,
    credit_pence: jl.creditPence,
  }));

  const { error: jLinesErr } = await admin
    .from('journal_lines')
    .insert(jRows);

  if (jLinesErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    return { error: jLinesErr.message };
  }

  // 8. Post the journal
  const { error: postErr } = await admin
    .from('journals')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', journal.id);

  if (postErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    return { error: postErr.message };
  }

  // 9. Update payroll run: set posted + link journal
  const { error: updateErr } = await admin
    .from('payroll_runs')
    .update({ status: 'posted', journal_id: journal.id })
    .eq('id', runId);

  if (updateErr) {
    return { error: updateErr.message };
  }

  // Invalidate report caches since a payroll journal was posted
  invalidateOrgReportCache(orgId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'post_payroll_run',
    entityType: 'payroll_run',
    entityId: runId,
    metadata: { journalId: journal.id },
  });

  await logApprovalEvent({
    orgId,
    entityId: runId,
    action: 'posted',
    performedBy: user.id,
  });

  return {};
}

/* ------------------------------------------------------------------ */
/*  HMRC export-ready summary                                          */
/* ------------------------------------------------------------------ */

export interface HmrcSummary {
  period: string;
  totalGross: number;
  totalPaye: number;
  totalEmployerNic: number;
  totalPension: number;
  totalNet: number;
  employeeCount: number;
  lines: Array<{
    employeeName: string;
    niNumber: string | null;
    taxCode: string | null;
    gross: number;
    tax: number;
    pension: number;
    employerNi: number;
    net: number;
  }>;
}

export async function getHmrcSummary(
  runId: string,
): Promise<{ data: HmrcSummary | null; error: string | null }> {
  const supabase = await createClient();

  const { data: run } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (!run) return { data: null, error: 'Payroll run not found.' };

  const { data: plRows } = await supabase
    .from('payroll_lines')
    .select('*, employees(full_name, ni_number, tax_code)')
    .eq('payroll_run_id', runId)
    .order('created_at');

  const lines = (plRows ?? []).map((row) => {
    const emp = row.employees as { full_name: string; ni_number: string | null; tax_code: string | null } | null;
    return {
      employeeName: emp?.full_name ?? 'Unknown',
      niNumber: emp?.ni_number ?? null,
      taxCode: emp?.tax_code ?? null,
      gross: Number(row.gross_pence),
      tax: Number(row.tax_pence),
      pension: Number(row.pension_pence),
      employerNi: Number(row.employer_ni_pence),
      net: Number(row.net_pence),
    };
  });

  return {
    data: {
      period: run.payroll_month,
      totalGross: Number(run.total_gross_pence),
      totalPaye: Number(run.total_paye_pence),
      totalEmployerNic: Number(run.total_nic_pence),
      totalPension: Number(run.total_pension_pence),
      totalNet: Number(run.total_net_pence),
      employeeCount: lines.length,
      lines,
    },
    error: null,
  };
}

export async function exportHmrcSummaryCsv(
  runId: string,
): Promise<{ data: string | null; error: string | null }> {
  const { data: summary, error } = await getHmrcSummary(runId);
  if (error || !summary) return { data: null, error: error ?? 'No data.' };

  const fmt = (pence: number) => (pence / 100).toFixed(2);

  const header = 'Employee,NI Number,Tax Code,Gross (£),Tax (£),Pension (£),Employer NI (£),Net (£)';
  const rows = summary.lines.map(
    (l) => `"${l.employeeName}","${l.niNumber ?? ''}","${l.taxCode ?? ''}","${fmt(l.gross)}","${fmt(l.tax)}","${fmt(l.pension)}","${fmt(l.employerNi)}","${fmt(l.net)}"`,
  );
  const totalRow = `"TOTALS","","","${fmt(summary.totalGross)}","${fmt(summary.totalPaye)}","${fmt(summary.totalPension)}","${fmt(summary.totalEmployerNic)}","${fmt(summary.totalNet)}"`;

  return { data: [header, ...rows, totalRow].join('\n'), error: null };
}

/* ------------------------------------------------------------------ */
/*  Liability tracking dashboard                                       */
/* ------------------------------------------------------------------ */

export interface LiabilityDashboard {
  payeNicOwed: number;
  pensionOwed: number;
  netPayOwed: number;
}

export async function getPayrollLiabilities(): Promise<{ data: LiabilityDashboard | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  // Get the org settings to know which accounts are liabilities
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('payroll_paye_nic_liability_id, payroll_pension_liability_id, payroll_net_pay_liability_id')
    .eq('organisation_id', orgId)
    .single();

  if (!settings) {
    return { data: null, error: 'Payroll accounts not configured.' };
  }

  const { payroll_paye_nic_liability_id, payroll_pension_liability_id, payroll_net_pay_liability_id } = settings;

  if (!payroll_paye_nic_liability_id || !payroll_pension_liability_id || !payroll_net_pay_liability_id) {
    return { data: null, error: 'Payroll liability accounts not fully configured.' };
  }

  // Compute balance for each liability account from posted journal lines
  async function getAccountBalance(accountId: string): Promise<number> {
    const { data } = await supabase
      .from('journal_lines')
      .select('debit_pence, credit_pence, journals!inner(status)')
      .eq('account_id', accountId)
      .eq('journals.status', 'posted');

    let balance = 0;
    if (data) {
      for (const row of data) {
        balance += Number(row.credit_pence) - Number(row.debit_pence);
      }
    }
    return balance;
  }

  const [payeNicOwed, pensionOwed, netPayOwed] = await Promise.all([
    getAccountBalance(payroll_paye_nic_liability_id),
    getAccountBalance(payroll_pension_liability_id),
    getAccountBalance(payroll_net_pay_liability_id),
  ]);

  return {
    data: { payeNicOwed, pensionOwed, netPayOwed },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  deletePayrollRun (draft only)                                      */
/* ------------------------------------------------------------------ */

export async function deletePayrollRun(
  runId: string,
): Promise<{ error?: string }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try { assertCanPerform(role, 'delete', 'payroll'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  // Verify it's draft before deleting
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('status')
    .eq('id', runId)
    .eq('organisation_id', orgId)
    .single();

  if (!run) {
    return { error: 'Payroll run not found.' };
  }

  if (run.status !== 'draft') {
    return { error: 'Only draft payroll runs can be deleted.' };
  }

  // Cascade deletes splits
  const { error } = await supabase
    .from('payroll_runs')
    .delete()
    .eq('id', runId);

  if (error) {
    return { error: error.message };
  }

  await logApprovalEvent({
    orgId,
    entityId: runId,
    action: 'deleted',
    performedBy: user.id,
  });

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'delete_payroll_run',
    entityType: 'payroll_run',
    entityId: runId,
  });

  return {};
}
