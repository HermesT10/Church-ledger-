'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { invalidateOrgReportCache } from '@/lib/cache';
import { logAuditEvent } from '@/lib/audit';
import { getAppEnv } from '@/lib/env';
import { logServerFailure } from '@/lib/monitoring';
import { isDateInLockedPeriod } from '@/lib/periods/actions';
import {
  validatePayrollInputs,
  computeGross,
  computePayrollGross,
  type PayrollSplit,
} from './validation';
import type { PayrollRunSummary, PayrollRunDetail } from './types';
import type { PayrollLineWithEmployee } from '@/lib/employees/types';

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

  return data.map((r) => {
    const row = r as Record<string, unknown>;
    return {
    id: row.id as string,
    payrollMonth: row.payroll_month as string,
    status: row.status as string,
    totalGrossPence: Number(row.total_gross_pence),
    totalNetPence: Number(row.total_net_pence),
    totalPayePence: Number(row.total_paye_pence),
    totalNicPence: Number(row.total_nic_pence),
    totalPensionPence: Number(row.total_pension_pence),
    totalEmployeeNicPence: Number(row.total_employee_nic_pence ?? 0),
    totalEmployerNicPence: Number(row.total_employer_nic_pence ?? row.total_nic_pence ?? 0),
    totalEmployeePensionPence: Number(row.total_employee_pension_pence ?? 0),
    totalEmployerPensionPence: Number(row.total_employer_pension_pence ?? row.total_pension_pence ?? 0),
    totalOtherDeductionsPence: Number(row.total_other_deductions_pence ?? 0),
    totalEmployerCostPence: Number(
      row.total_employer_cost_pence ??
        Number(row.total_gross_pence) + Number(row.total_nic_pence) + Number(row.total_pension_pence),
    ),
    journalId: (row.journal_id as string | null) ?? null,
    createdAt: row.created_at as string,
    attachmentUrl: (row.attachment_url as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
    approvedBy: (row.approved_by as string | null) ?? null,
    };
  });
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
  const runRow = run as Record<string, unknown>;

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
    employee_nic_pence: Number((row as Record<string, unknown>).employee_nic_pence ?? 0),
    employer_nic_pence: Number((row as Record<string, unknown>).employer_nic_pence ?? row.employer_ni_pence ?? 0),
    employee_pension_pence: Number((row as Record<string, unknown>).employee_pension_pence ?? 0),
    employer_pension_pence: Number((row as Record<string, unknown>).employer_pension_pence ?? row.pension_pence ?? 0),
    other_deductions_pence: Number((row as Record<string, unknown>).other_deductions_pence ?? 0),
    fund_id: ((row as Record<string, unknown>).fund_id as string | null) ?? null,
    account_id: ((row as Record<string, unknown>).account_id as string | null) ?? null,
    department_ministry: ((row as Record<string, unknown>).department_ministry as string | null) ?? null,
    notes: ((row as Record<string, unknown>).notes as string | null) ?? null,
    net_pence: Number(row.net_pence),
    created_at: row.created_at,
    employee_name: (row.employees as { full_name: string } | null)?.full_name ?? 'Unknown',
  }));

  return {
    id: runRow.id as string,
    organisationId: runRow.organisation_id as string,
    payrollMonth: runRow.payroll_month as string,
    periodStart: (runRow.period_start as string | null) ?? null,
    periodEnd: (runRow.period_end as string | null) ?? null,
    paymentDate: (runRow.payment_date as string | null) ?? null,
    status: runRow.status as string,
    totalGrossPence: Number(runRow.total_gross_pence),
    totalNetPence: Number(runRow.total_net_pence),
    totalPayePence: Number(runRow.total_paye_pence),
    totalNicPence: Number(runRow.total_nic_pence),
    totalPensionPence: Number(runRow.total_pension_pence),
    totalEmployeeNicPence: Number(runRow.total_employee_nic_pence ?? 0),
    totalEmployerNicPence: Number(runRow.total_employer_nic_pence ?? runRow.total_nic_pence ?? 0),
    totalEmployeePensionPence: Number(runRow.total_employee_pension_pence ?? 0),
    totalEmployerPensionPence: Number(runRow.total_employer_pension_pence ?? runRow.total_pension_pence ?? 0),
    totalOtherDeductionsPence: Number(runRow.total_other_deductions_pence ?? 0),
    totalEmployerCostPence: Number(
      runRow.total_employer_cost_pence ??
        Number(runRow.total_gross_pence) + Number(runRow.total_nic_pence) + Number(runRow.total_pension_pence),
    ),
    journalId: (runRow.journal_id as string | null) ?? null,
    createdBy: (runRow.created_by as string | null) ?? null,
    createdAt: runRow.created_at as string,
    attachmentUrl: (runRow.attachment_url as string | null) ?? null,
    approvedAt: (runRow.approved_at as string | null) ?? null,
    approvedBy: (runRow.approved_by as string | null) ?? null,
    reviewedAt: (runRow.reviewed_at as string | null) ?? null,
    reviewedBy: (runRow.reviewed_by as string | null) ?? null,
    paidAt: (runRow.paid_at as string | null) ?? null,
    paidBy: (runRow.paid_by as string | null) ?? null,
    reconciledAt: (runRow.reconciled_at as string | null) ?? null,
    reconciledBy: (runRow.reconciled_by as string | null) ?? null,
    reversedAt: (runRow.reversed_at as string | null) ?? null,
    reversedBy: (runRow.reversed_by as string | null) ?? null,
    paymentReference: (runRow.payment_reference as string | null) ?? null,
    splits: mappedSplits,
    payrollLines,
  };
}

export async function updatePayrollRunAttachment(
  runId: string,
  attachmentUrl: string | null,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'payroll');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('status')
    .eq('id', runId)
    .single();

  if (!run) return { success: false, error: 'Payroll run not found.' };
  if (run.status === 'posted') {
    return { success: false, error: 'Cannot change evidence on a posted payroll run.' };
  }

  const { error } = await admin
    .from('payroll_runs')
    .update({ attachment_url: attachmentUrl })
    .eq('id', runId);

  return { success: !error, error: error?.message ?? null };
}

export async function approvePayrollRun(
  runId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'approve', 'payroll');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();
  const { data: run, error: runErr } = await supabase
    .from('payroll_runs')
    .select('id, payroll_month, status')
    .eq('id', runId)
    .single();

  if (runErr || !run) {
    await logServerFailure({
      area: 'payroll',
      event: 'approve_payroll_run_load_failed',
      error: runErr ?? new Error('Payroll run not found.'),
      metadata: { runId, orgId, userId: user.id },
      capture: Boolean(runErr),
    });
    return { success: false, error: runErr?.message ?? 'Payroll run not found.' };
  }

  if (run.status !== 'reviewed') {
    return { success: false, error: 'Payroll runs must be reviewed before approval.' };
  }

  const locked = await isDateInLockedPeriod(run.payroll_month);
  if (locked) {
    return { success: false, error: 'Cannot approve: payroll month falls in a locked financial period.' };
  }

  const { error } = await supabase
    .from('payroll_runs')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) {
    await logServerFailure({
      area: 'payroll',
      event: 'approve_payroll_run_failed',
      error,
      metadata: { runId, orgId, userId: user.id },
    });
    return { success: false, error: error.message };
  }

  const { error: approvalErr } = await supabase.from('approval_events').insert({
    organisation_id: orgId,
    entity_type: 'payroll_run',
    entity_id: runId,
    action: 'approved',
    performed_by: user.id,
  });

  if (approvalErr) {
    await logServerFailure({
      area: 'payroll',
      event: 'approve_payroll_run_approval_event_failed',
      error: approvalErr,
      metadata: { runId, orgId, userId: user.id },
    });
    return { success: false, error: approvalErr.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'approve_payroll_run',
    entityType: 'payroll_run',
    entityId: runId,
  });

  return { success: true, error: null };
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

  const admin = createAdminClient();
  const { error } = await admin.rpc('post_payroll_run_atomic', {
    p_org_id: orgId,
    p_run_id: runId,
    p_user_id: user.id,
    p_environment: getAppEnv(),
  });

  if (error) {
    await logServerFailure({
      area: 'payroll',
      event: 'post_payroll_run_failed',
      error,
      metadata: { runId, orgId, userId: user.id },
    });
    return { error: error.message };
  }

  invalidateOrgReportCache(orgId);
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
  const { role } = await getActiveOrg();

  try { assertCanPerform(role, 'delete', 'payroll'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  // Verify it's draft before deleting
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('status')
    .eq('id', runId)
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

  return {};
}

type PayrollActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error: string | null }
  : { success: boolean; error: string | null; data: T | null };

type LooseDbError = { message: string } | null;
type LooseDbResult<T = unknown> = { data: T | null; error: LooseDbError; count?: number | null };
type LooseDbQuery<T = unknown> = PromiseLike<LooseDbResult<T>> & {
  select(columns?: string, options?: unknown): LooseDbQuery<T>;
  insert(values: unknown): LooseDbQuery<T>;
  update(values: unknown): LooseDbQuery<T>;
  eq(column: string, value: unknown): LooseDbQuery<T>;
  in(column: string, values: unknown[]): LooseDbQuery<T>;
  order(column: string, options?: unknown): LooseDbQuery<T>;
  single(): Promise<LooseDbResult<T>>;
};
type LooseDbClient = {
  from(table: string): LooseDbQuery;
};

type PayrollImportMappedRow = {
  employeeId?: string | null;
  employeeName?: string | null;
  grossPence?: number;
  netPence?: number;
  payePence?: number;
  employeeNicPence?: number;
  employerNicPence?: number;
  employeePensionPence?: number;
  employerPensionPence?: number;
  otherDeductionsPence?: number;
  fundId?: string | null;
  accountId?: string | null;
  departmentMinistry?: string | null;
  notes?: string | null;
};

type PayrollImportPreviewRow = PayrollImportMappedRow & {
  rowNumber: number;
  validationStatus: 'valid' | 'warning' | 'error';
  validationErrors: string[];
};

type PayrollImportPreview = {
  rows: PayrollImportPreviewRow[];
  totals: {
    grossPence: number;
    netPence: number;
    payePence: number;
    employeeNicPence: number;
    employerNicPence: number;
    employeePensionPence: number;
    employerPensionPence: number;
    otherDeductionsPence: number;
    totalEmployerCostPence: number;
  };
  canCommit: boolean;
};

async function assertPayrollLifecyclePermission(
  action: 'create' | 'update' | 'approve' | 'post' | 'delete',
): Promise<{ orgId: string; userId: string; role: string } | { error: string }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, action, 'payroll');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  return { orgId, userId: user.id, role };
}

function toPence(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return 0;
  const normalised = value.replace(/[£,\s]/g, '');
  if (!normalised) return 0;
  const parsed = Number(normalised);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * (normalised.includes('.') ? 100 : 1));
}

function buildPayrollImportPreview(rows: PayrollImportMappedRow[]): PayrollImportPreview {
  const seenEmployees = new Set<string>();
  const previewRows = rows.map((row, index) => {
    const employeeId = row.employeeId ?? null;
    const grossPence = toPence(row.grossPence);
    const netPence = toPence(row.netPence);
    const payePence = toPence(row.payePence);
    const employeeNicPence = toPence(row.employeeNicPence);
    const employerNicPence = toPence(row.employerNicPence);
    const employeePensionPence = toPence(row.employeePensionPence);
    const employerPensionPence = toPence(row.employerPensionPence);
    const otherDeductionsPence = toPence(row.otherDeductionsPence);
    const expectedGross = computePayrollGross({
      netPence,
      payePence,
      employeeNicPence,
      employeePensionPence,
      otherDeductionsPence,
    });
    const errors: string[] = [];

    if (!employeeId && !row.employeeName) errors.push('Employee is required.');
    if (employeeId && seenEmployees.has(employeeId)) errors.push('Duplicate employee in import.');
    if (grossPence <= 0) errors.push('Gross pay must be greater than zero.');
    if (netPence <= 0) errors.push('Net pay must be greater than zero.');
    if (grossPence !== expectedGross) {
      errors.push(`Gross pay must equal net pay plus employee deductions (${expectedGross}).`);
    }

    if (employeeId) seenEmployees.add(employeeId);

    return {
      ...row,
      rowNumber: index + 1,
      employeeId,
      grossPence,
      netPence,
      payePence,
      employeeNicPence,
      employerNicPence,
      employeePensionPence,
      employerPensionPence,
      otherDeductionsPence,
      validationStatus: errors.length > 0 ? 'error' : 'valid',
      validationErrors: errors,
    } satisfies PayrollImportPreviewRow;
  });

  const totals = previewRows.reduce(
    (acc, row) => {
      acc.grossPence += row.grossPence ?? 0;
      acc.netPence += row.netPence ?? 0;
      acc.payePence += row.payePence ?? 0;
      acc.employeeNicPence += row.employeeNicPence ?? 0;
      acc.employerNicPence += row.employerNicPence ?? 0;
      acc.employeePensionPence += row.employeePensionPence ?? 0;
      acc.employerPensionPence += row.employerPensionPence ?? 0;
      acc.otherDeductionsPence += row.otherDeductionsPence ?? 0;
      acc.totalEmployerCostPence +=
        (row.grossPence ?? 0) + (row.employerNicPence ?? 0) + (row.employerPensionPence ?? 0);
      return acc;
    },
    {
      grossPence: 0,
      netPence: 0,
      payePence: 0,
      employeeNicPence: 0,
      employerNicPence: 0,
      employeePensionPence: 0,
      employerPensionPence: 0,
      otherDeductionsPence: 0,
      totalEmployerCostPence: 0,
    },
  );

  return {
    rows: previewRows,
    totals,
    canCommit: previewRows.length > 0 && previewRows.every((row) => row.validationStatus !== 'error'),
  };
}

export async function reviewPayrollRun(runId: string): Promise<PayrollActionResult> {
  const auth = await assertPayrollLifecyclePermission('approve');
  if ('error' in auth) return { success: false, error: auth.error };

  const db = createAdminClient() as unknown as LooseDbClient;
  const { data: run, error: runErr } = await db
    .from('payroll_runs')
    .select('id, organisation_id, status, payroll_month, period_end, payment_date')
    .eq('id', runId)
    .eq('organisation_id', auth.orgId)
    .single();

  if (runErr || !run) return { success: false, error: runErr?.message ?? 'Payroll run not found.' };
  const runRow = run as Record<string, unknown>;
  if (runRow.status !== 'draft') return { success: false, error: 'Only draft payroll runs can be reviewed.' };
  if (await isDateInLockedPeriod((runRow.payment_date ?? runRow.period_end ?? runRow.payroll_month) as string)) {
    return { success: false, error: 'Cannot review: payroll date falls in a locked financial period.' };
  }

  const { error } = await db
    .from('payroll_runs')
    .update({ status: 'reviewed', reviewed_by: auth.userId, reviewed_at: new Date().toISOString() })
    .eq('id', runId);

  if (error) return { success: false, error: error.message };

  await logAuditEvent({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'review_payroll_run',
    entityType: 'payroll_run',
    entityId: runId,
  });

  return { success: true, error: null };
}

export async function markPayrollPaid(
  runId: string,
  paymentReference?: string,
): Promise<PayrollActionResult> {
  const auth = await assertPayrollLifecyclePermission('post');
  if ('error' in auth) return { success: false, error: auth.error };

  const db = createAdminClient() as unknown as LooseDbClient;
  const paidAt = new Date().toISOString();
  const { error } = await db
    .from('payroll_runs')
    .update({
      status: 'paid',
      paid_by: auth.userId,
      paid_at: paidAt,
      payment_reference: paymentReference ?? null,
    })
    .eq('id', runId)
    .eq('organisation_id', auth.orgId)
    .in('status', ['posted', 'paid']);

  if (error) return { success: false, error: error.message };

  await db
    .from('payroll_liability_payments')
    .update({ status: 'paid', payment_reference: paymentReference ?? null, updated_at: paidAt })
    .eq('workspace_id', auth.orgId)
    .eq('payroll_run_id', runId)
    .eq('status', 'pending');

  await logAuditEvent({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'mark_payroll_paid',
    entityType: 'payroll_run',
    entityId: runId,
    metadata: { paymentReference },
  });

  return { success: true, error: null };
}

export async function markPayrollReconciled(
  runId: string,
  paymentIds?: string[],
): Promise<PayrollActionResult> {
  const auth = await assertPayrollLifecyclePermission('post');
  if ('error' in auth) return { success: false, error: auth.error };

  const db = createAdminClient() as unknown as LooseDbClient;
  const reconciledAt = new Date().toISOString();
  const { error } = await db
    .from('payroll_runs')
    .update({ status: 'reconciled', reconciled_by: auth.userId, reconciled_at: reconciledAt })
    .eq('id', runId)
    .eq('organisation_id', auth.orgId)
    .in('status', ['paid', 'reconciled']);

  if (error) return { success: false, error: error.message };

  let liabilityQuery = db
    .from('payroll_liability_payments')
    .update({ status: 'reconciled', updated_at: reconciledAt })
    .eq('workspace_id', auth.orgId)
    .eq('payroll_run_id', runId);

  if (paymentIds && paymentIds.length > 0) {
    liabilityQuery = liabilityQuery.in('id', paymentIds);
  }

  await liabilityQuery;

  await logAuditEvent({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'mark_payroll_reconciled',
    entityType: 'payroll_run',
    entityId: runId,
    metadata: { paymentIds: paymentIds ?? [] },
  });

  return { success: true, error: null };
}

export async function reversePayrollRun(
  runId: string,
  reason: string,
): Promise<PayrollActionResult<{ reversalId: string }>> {
  const auth = await assertPayrollLifecyclePermission('post');
  if ('error' in auth) return { success: false, error: auth.error, data: null };
  if (reason.trim().length < 10) {
    return { success: false, error: 'A reversal reason of at least 10 characters is required.', data: null };
  }

  const db = createAdminClient() as unknown as LooseDbClient;
  const { data: run, error: runErr } = await db
    .from('payroll_runs')
    .select('id, organisation_id, status, journal_id')
    .eq('id', runId)
    .eq('organisation_id', auth.orgId)
    .single();

  if (runErr || !run) return { success: false, error: runErr?.message ?? 'Payroll run not found.', data: null };
  const runRow = run as Record<string, unknown>;
  if (!['posted', 'paid', 'reconciled'].includes(String(runRow.status))) {
    return { success: false, error: 'Only posted, paid, or reconciled payroll runs can be reversed.', data: null };
  }

  const { data: reversal, error } = await db
    .from('payroll_reversals')
    .insert({
      workspace_id: auth.orgId,
      original_run_id: runId,
      reversal_journal_id: runRow.journal_id ?? null,
      reason: reason.trim(),
      created_by: auth.userId,
    })
    .select('id')
    .single();

  if (error || !reversal) return { success: false, error: error?.message ?? 'Failed to create reversal.', data: null };

  await db
    .from('payroll_runs')
    .update({ status: 'reversed', reversed_by: auth.userId, reversed_at: new Date().toISOString() })
    .eq('id', runId);

  await logAuditEvent({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'reverse_payroll_run',
    entityType: 'payroll_run',
    entityId: runId,
    metadata: { reason: reason.trim(), reversalId: (reversal as Record<string, unknown>).id },
  });

  invalidateOrgReportCache(auth.orgId);
  return { success: true, error: null, data: { reversalId: String((reversal as Record<string, unknown>).id) } };
}

export async function createPayrollImportBatch(params: {
  fileName?: string;
  provider?: string;
  periodStart: string;
  periodEnd: string;
  paymentDate?: string;
  rows: PayrollImportMappedRow[];
}): Promise<PayrollActionResult<{ batchId: string; preview: PayrollImportPreview }>> {
  const auth = await assertPayrollLifecyclePermission('create');
  if ('error' in auth) return { success: false, error: auth.error, data: null };

  const preview = buildPayrollImportPreview(params.rows);
  const db = createAdminClient() as unknown as LooseDbClient;
  const { data: batch, error } = await db
    .from('payroll_import_batches')
    .insert({
      workspace_id: auth.orgId,
      file_name: params.fileName ?? null,
      provider: params.provider ?? null,
      period_start: params.periodStart,
      period_end: params.periodEnd,
      payment_date: params.paymentDate ?? null,
      status: preview.canCommit ? 'validated' : 'draft',
      mapping: {},
      validation_results: preview.rows.map((row) => ({
        rowNumber: row.rowNumber,
        status: row.validationStatus,
        errors: row.validationErrors,
      })),
      imported_by: auth.userId,
      imported_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !batch) return { success: false, error: error?.message ?? 'Failed to create import batch.', data: null };
  const batchRow = batch as Record<string, unknown>;

  if (preview.rows.length > 0) {
    await db.from('payroll_import_rows').insert(
      preview.rows.map((row) => ({
        workspace_id: auth.orgId,
        batch_id: batchRow.id,
        row_number: row.rowNumber,
        raw_data: row,
        mapped_data: row,
        employee_id: row.employeeId ?? null,
        validation_status: row.validationStatus,
        validation_errors: row.validationErrors,
      })),
    );
  }

  await logAuditEvent({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'create_payroll_import_batch',
    entityType: 'payroll_import_batch',
    entityId: String(batchRow.id),
    metadata: { rowCount: preview.rows.length, canCommit: preview.canCommit },
  });

  return { success: true, error: null, data: { batchId: String(batchRow.id), preview } };
}

export async function previewPayrollImport(
  rows: PayrollImportMappedRow[],
): Promise<PayrollActionResult<PayrollImportPreview>> {
  const preview = buildPayrollImportPreview(rows);
  return { success: true, error: null, data: preview };
}

export async function commitPayrollImport(
  batchId: string,
): Promise<PayrollActionResult<{ runId: string }>> {
  const auth = await assertPayrollLifecyclePermission('create');
  if ('error' in auth) return { success: false, error: auth.error, data: null };

  const db = createAdminClient() as unknown as LooseDbClient;
  const { data: batch, error: batchErr } = await db
    .from('payroll_import_batches')
    .select('*')
    .eq('id', batchId)
    .eq('workspace_id', auth.orgId)
    .single();

  if (batchErr || !batch) return { success: false, error: batchErr?.message ?? 'Import batch not found.', data: null };
  const batchRow = batch as Record<string, unknown>;

  const { data: rows } = await db
    .from('payroll_import_rows')
    .select('*')
    .eq('batch_id', batchId)
    .eq('workspace_id', auth.orgId)
    .order('row_number');

  const mappedRows = ((rows ?? []) as Array<Record<string, unknown>>).map(
    (row) => row.mapped_data as PayrollImportMappedRow,
  );
  const preview = buildPayrollImportPreview(mappedRows);
  if (!preview.canCommit) return { success: false, error: 'Import has validation errors.', data: null };

  const payrollMonth = String(batchRow.period_start);
  const { data: run, error: runErr } = await db
    .from('payroll_runs')
    .insert({
      organisation_id: auth.orgId,
      payroll_month: payrollMonth,
      period_start: batchRow.period_start,
      period_end: batchRow.period_end,
      payment_date: batchRow.payment_date ?? null,
      status: 'draft',
      total_gross_pence: preview.totals.grossPence,
      total_net_pence: preview.totals.netPence,
      total_paye_pence: preview.totals.payePence,
      total_nic_pence: preview.totals.employerNicPence,
      total_pension_pence: preview.totals.employerPensionPence,
      total_employee_nic_pence: preview.totals.employeeNicPence,
      total_employer_nic_pence: preview.totals.employerNicPence,
      total_employee_pension_pence: preview.totals.employeePensionPence,
      total_employer_pension_pence: preview.totals.employerPensionPence,
      total_other_deductions_pence: preview.totals.otherDeductionsPence,
      total_employer_cost_pence: preview.totals.totalEmployerCostPence,
      created_by: auth.userId,
    })
    .select('id')
    .single();

  if (runErr || !run) return { success: false, error: runErr?.message ?? 'Failed to create payroll run.', data: null };
  const runRow = run as Record<string, unknown>;

  await db.from('payroll_lines').insert(
    preview.rows.map((row) => ({
      payroll_run_id: runRow.id,
      employee_id: row.employeeId ?? null,
      gross_pence: row.grossPence ?? 0,
      tax_pence: row.payePence ?? 0,
      employee_nic_pence: row.employeeNicPence ?? 0,
      employer_ni_pence: row.employerNicPence ?? 0,
      employer_nic_pence: row.employerNicPence ?? 0,
      pension_pence: row.employerPensionPence ?? 0,
      employee_pension_pence: row.employeePensionPence ?? 0,
      employer_pension_pence: row.employerPensionPence ?? 0,
      other_deductions_pence: row.otherDeductionsPence ?? 0,
      net_pence: row.netPence ?? 0,
      fund_id: row.fundId ?? null,
      account_id: row.accountId ?? null,
      department_ministry: row.departmentMinistry ?? null,
      notes: row.notes ?? null,
    })),
  );

  await db
    .from('payroll_import_batches')
    .update({ status: 'committed', committed_run_id: runRow.id })
    .eq('id', batchId);

  await logAuditEvent({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'commit_payroll_import',
    entityType: 'payroll_import_batch',
    entityId: batchId,
    metadata: { runId: runRow.id, rowCount: preview.rows.length },
  });

  return { success: true, error: null, data: { runId: String(runRow.id) } };
}

export async function getPayrollOverview(): Promise<PayrollActionResult<{
  currentRun: PayrollRunSummary | null;
  totalEmployerCostThisMonth: number;
  payrollLiabilitiesOutstanding: number;
  pensionPayable: number;
  payrollVsBudget: { actualPence: number; budgetPence: number; variancePence: number };
}>> {
  const { orgId } = await getActiveOrg();
  const runs = await listPayrollRuns(orgId);
  const liabilities = await getPayrollLiabilities();
  const currentRun = runs[0] ?? null;
  const totalEmployerCostThisMonth = currentRun
    ? currentRun.totalGrossPence + currentRun.totalNicPence + currentRun.totalPensionPence
    : 0;
  const payrollLiabilitiesOutstanding =
    (liabilities.data?.payeNicOwed ?? 0) + (liabilities.data?.pensionOwed ?? 0) + (liabilities.data?.netPayOwed ?? 0);

  return {
    success: true,
    error: null,
    data: {
      currentRun,
      totalEmployerCostThisMonth,
      payrollLiabilitiesOutstanding,
      pensionPayable: liabilities.data?.pensionOwed ?? 0,
      payrollVsBudget: {
        actualPence: totalEmployerCostThisMonth,
        budgetPence: 0,
        variancePence: totalEmployerCostThisMonth,
      },
    },
  };
}

export async function getPayrollEmployerCosts(): Promise<PayrollActionResult<Array<{
  runId: string;
  payrollMonth: string;
  grossPence: number;
  employerNicPence: number;
  employerPensionPence: number;
  totalEmployerCostPence: number;
}>>> {
  const { orgId } = await getActiveOrg();
  const runs = await listPayrollRuns(orgId);
  return {
    success: true,
    error: null,
    data: runs.map((run) => ({
      runId: run.id,
      payrollMonth: run.payrollMonth,
      grossPence: run.totalGrossPence,
      employerNicPence: run.totalNicPence,
      employerPensionPence: run.totalPensionPence,
      totalEmployerCostPence: run.totalGrossPence + run.totalNicPence + run.totalPensionPence,
    })),
  };
}

export async function getPayrollPensionReport(): Promise<PayrollActionResult<Array<{
  runId: string;
  payrollMonth: string;
  employeePensionPence: number;
  employerPensionPence: number;
  pensionPayablePence: number;
}>>> {
  const { orgId } = await getActiveOrg();
  const db = createAdminClient() as unknown as LooseDbClient;
  const { data, error } = await db
    .from('payroll_runs')
    .select('id, payroll_month, total_employee_pension_pence, total_employer_pension_pence, total_pension_pence')
    .eq('organisation_id', orgId)
    .order('payroll_month', { ascending: false });

  if (error) return { success: false, error: error.message, data: null };

  return {
    success: true,
    error: null,
    data: ((data ?? []) as Array<Record<string, unknown>>).map((run) => {
      const employee = Number(run.total_employee_pension_pence ?? 0);
      const employer = Number(run.total_employer_pension_pence ?? run.total_pension_pence ?? 0);
      return {
        runId: String(run.id),
        payrollMonth: String(run.payroll_month),
        employeePensionPence: employee,
        employerPensionPence: employer,
        pensionPayablePence: employee + employer,
      };
    }),
  };
}

export async function getPayrollLiabilityReport(): Promise<PayrollActionResult<Array<{
  runId: string | null;
  liabilityType: string;
  amountPence: number;
  status: string;
  paymentDate: string | null;
  paymentReference: string | null;
}>>> {
  const { orgId } = await getActiveOrg();
  const db = createAdminClient() as unknown as LooseDbClient;
  const { data, error } = await db
    .from('payroll_liability_payments')
    .select('payroll_run_id, liability_type, amount_pence, status, payment_date, payment_reference')
    .eq('workspace_id', orgId)
    .order('payment_date', { ascending: false });

  if (error) return { success: false, error: error.message, data: null };

  return {
    success: true,
    error: null,
    data: ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      runId: (row.payroll_run_id as string | null) ?? null,
      liabilityType: String(row.liability_type),
      amountPence: Number(row.amount_pence ?? 0),
      status: String(row.status),
      paymentDate: (row.payment_date as string | null) ?? null,
      paymentReference: (row.payment_reference as string | null) ?? null,
    })),
  };
}

export async function getPayrollByFundMinistry(): Promise<PayrollActionResult<Array<{
  fundId: string | null;
  departmentMinistry: string | null;
  grossPence: number;
  employerNicPence: number;
  employerPensionPence: number;
  totalEmployerCostPence: number;
}>>> {
  const { orgId } = await getActiveOrg();
  const db = createAdminClient() as unknown as LooseDbClient;
  const { data, error } = await db
    .from('payroll_lines')
    .select('fund_id, department_ministry, gross_pence, employer_ni_pence, employer_nic_pence, pension_pence, employer_pension_pence, payroll_runs!inner(organisation_id)')
    .eq('payroll_runs.organisation_id', orgId);

  if (error) return { success: false, error: error.message, data: null };

  const grouped = new Map<string, {
    fundId: string | null;
    departmentMinistry: string | null;
    grossPence: number;
    employerNicPence: number;
    employerPensionPence: number;
    totalEmployerCostPence: number;
  }>();

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const fundId = (row.fund_id as string | null) ?? null;
    const departmentMinistry = (row.department_ministry as string | null) ?? null;
    const key = `${fundId ?? 'none'}:${departmentMinistry ?? 'none'}`;
    const existing = grouped.get(key) ?? {
      fundId,
      departmentMinistry,
      grossPence: 0,
      employerNicPence: 0,
      employerPensionPence: 0,
      totalEmployerCostPence: 0,
    };
    const gross = Number(row.gross_pence ?? 0);
    const nic = Number(row.employer_nic_pence ?? row.employer_ni_pence ?? 0);
    const pension = Number(row.employer_pension_pence ?? row.pension_pence ?? 0);
    existing.grossPence += gross;
    existing.employerNicPence += nic;
    existing.employerPensionPence += pension;
    existing.totalEmployerCostPence += gross + nic + pension;
    grouped.set(key, existing);
  }

  return { success: true, error: null, data: Array.from(grouped.values()) };
}

export async function getPayrollVsBudget(): Promise<PayrollActionResult<Array<{
  label: string;
  actualPence: number;
  budgetPence: number;
  variancePence: number;
}>>> {
  const costs = await getPayrollByFundMinistry();
  if (!costs.success || !costs.data) return { success: false, error: costs.error, data: null };

  return {
    success: true,
    error: null,
    data: costs.data.map((row) => ({
      label: row.departmentMinistry ?? row.fundId ?? 'Unallocated payroll',
      actualPence: row.totalEmployerCostPence,
      budgetPence: 0,
      variancePence: row.totalEmployerCostPence,
    })),
  };
}
