'use server';

import { revalidatePath } from 'next/cache';
import { getActiveOrg } from '@/lib/org';
import { logAuditEvent } from '@/lib/audit';
import { assertWriteAllowed } from '@/lib/demo';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { lockPeriod } from '@/lib/periods/actions';
import { loadAnnualAccountsPack } from '@/lib/annual-accounts/data';
import { composeYearEndFilingPack } from './filing-pack';
import { YEAR_END_CLOSE_STEPS } from './steps';
import { validateYearEndCloseReadiness } from './validation';
import type {
  FilingPackPayload,
  YearEndCloseBasis,
  YearEndCloseDocumentItem,
  YearEndCloseEvidenceItem,
  YearEndCloseRun,
  YearEndCloseRunStatus,
  YearEndCloseStep,
  YearEndCloseStepKey,
  YearEndCloseStepStatus,
} from './types';

type JsonRecord = Record<string, unknown>;

type RunRow = {
  id: string;
  workspace_id: string;
  financial_period_id: string | null;
  financial_year: number;
  period_start: string;
  period_end: string;
  basis: YearEndCloseBasis;
  status: YearEndCloseRunStatus;
  annual_accounts_report_version_id: string | null;
  filing_pack_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  locked_by: string | null;
  locked_at: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  submission_reference?: string | null;
  created_at: string;
  updated_at: string;
};

type StepRow = {
  id: string;
  workspace_id: string;
  run_id: string;
  step_key: YearEndCloseStepKey;
  step_number: number;
  title: string;
  description: string;
  status: YearEndCloseStepStatus;
  assigned_to: string | null;
  due_date: string | null;
  evidence: unknown;
  documents: unknown;
  notes: string | null;
  blockers: unknown;
  waiver_reason: string | null;
  completed_by: string | null;
  completed_at: string | null;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function mapStep(row: StepRow): YearEndCloseStep {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    runId: row.run_id,
    stepKey: row.step_key,
    stepNumber: row.step_number,
    title: row.title,
    description: row.description,
    status: row.status,
    assignedTo: row.assigned_to,
    dueDate: row.due_date,
    evidence: asArray<YearEndCloseEvidenceItem>(row.evidence),
    documents: asArray<YearEndCloseDocumentItem>(row.documents),
    notes: row.notes,
    blockers: asArray(row.blockers),
    waiverReason: row.waiver_reason,
    completedBy: row.completed_by,
    completedAt: row.completed_at,
  };
}

function mapRun(row: RunRow, steps: StepRow[] = []): YearEndCloseRun {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    financialPeriodId: row.financial_period_id,
    financialYear: row.financial_year,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    basis: row.basis,
    status: row.status,
    annualAccountsReportVersionId: row.annual_accounts_report_version_id,
    filingPackId: row.filing_pack_id,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    lockedBy: row.locked_by,
    lockedAt: row.locked_at,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    submissionReference: row.submission_reference ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    steps: steps.map(mapStep).sort((a, b) => a.stepNumber - b.stepNumber),
  };
}

async function assertWorkflowWrite() {
  await assertWriteAllowed();
  const active = await getActiveOrg();

  try {
    assertCanPerform(active.role, 'update', 'workflows');
  } catch (e) {
    return {
      active,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  return { active, error: null };
}

async function loadRun(runId: string): Promise<{ run: YearEndCloseRun | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const [{ data: run, error: runError }, { data: steps, error: stepsError }] = await Promise.all([
    supabase
      .from('year_end_close_runs')
      .select('*')
      .eq('workspace_id', orgId)
      .eq('id', runId)
      .maybeSingle(),
    supabase
      .from('year_end_close_steps')
      .select('*')
      .eq('workspace_id', orgId)
      .eq('run_id', runId)
      .order('step_number'),
  ]);

  if (runError) return { run: null, error: runError.message };
  if (stepsError) return { run: null, error: stepsError.message };
  if (!run) return { run: null, error: 'Year-end close run not found.' };

  return { run: mapRun(run as RunRow, (steps ?? []) as StepRow[]), error: null };
}

async function audit(action: string, entityId: string, metadata?: JsonRecord) {
  const { orgId, user } = await getActiveOrg();
  await logAuditEvent({
    orgId,
    userId: user.id,
    action,
    entityType: 'year_end_close_run',
    entityId,
    metadata,
  });
}

export async function createYearEndCloseRun(input: {
  financialYear: number;
  periodStart: string;
  periodEnd: string;
  basis: YearEndCloseBasis;
}): Promise<{ data: { runId: string } | null; error: string | null }> {
  const { active, error: permissionError } = await assertWorkflowWrite();
  if (permissionError) return { data: null, error: permissionError };

  if (input.periodEnd < input.periodStart) {
    return { data: null, error: 'Period end date must be after the start date.' };
  }

  const supabase = await createClient();
  const { data: existingPeriod } = await supabase
    .from('financial_periods')
    .select('id')
    .eq('organisation_id', active.orgId)
    .eq('start_date', input.periodStart)
    .eq('end_date', input.periodEnd)
    .maybeSingle();

  let periodId = existingPeriod?.id ?? null;
  if (!periodId) {
    const { data: period, error: periodError } = await supabase
      .from('financial_periods')
      .insert({
        organisation_id: active.orgId,
        name: `Financial year ${input.financialYear}`,
        start_date: input.periodStart,
        end_date: input.periodEnd,
        status: 'open',
      })
      .select('id')
      .single();
    if (periodError) return { data: null, error: periodError.message };
    periodId = period.id;
  }

  const { data: run, error } = await supabase
    .from('year_end_close_runs')
    .upsert({
      workspace_id: active.orgId,
      financial_period_id: periodId,
      financial_year: input.financialYear,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      basis: input.basis,
      status: 'in_progress',
      created_by: active.user.id,
      updated_by: active.user.id,
    }, { onConflict: 'workspace_id,financial_year,basis' })
    .select('id')
    .single();

  if (error) return { data: null, error: error.message };

  const stepRows = YEAR_END_CLOSE_STEPS.map((step) => ({
    workspace_id: active.orgId,
    run_id: run.id,
    step_key: step.stepKey,
    step_number: step.stepNumber,
    title: step.title,
    description: step.description,
    status: step.stepNumber <= 2 ? 'in_progress' : 'not_started',
    blockers: [],
    evidence: [],
    documents: [],
  }));

  const { error: stepsError } = await supabase
    .from('year_end_close_steps')
    .upsert(stepRows, { onConflict: 'run_id,step_key' });

  if (stepsError) return { data: null, error: stepsError.message };

  await audit('year_end_close_run_created', run.id, { financialYear: input.financialYear, basis: input.basis });
  revalidatePath('/year-end-close');
  return { data: { runId: run.id }, error: null };
}

export async function getYearEndCloseRun(runId: string): Promise<{ data: YearEndCloseRun | null; error: string | null }> {
  const { run, error } = await loadRun(runId);
  return { data: run, error };
}

export async function listYearEndCloseRuns(): Promise<{ data: YearEndCloseRun[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('year_end_close_runs')
    .select('*')
    .eq('workspace_id', orgId)
    .order('financial_year', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: ((data ?? []) as RunRow[]).map((row) => mapRun(row)), error: null };
}

export async function updateYearEndCloseStep(input: {
  stepId: string;
  status: YearEndCloseStepStatus;
  assignedTo?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  evidence?: YearEndCloseEvidenceItem[];
  documents?: YearEndCloseDocumentItem[];
  waiverReason?: string | null;
}): Promise<{ success: boolean; error: string | null }> {
  const { active, error: permissionError } = await assertWorkflowWrite();
  if (permissionError) return { success: false, error: permissionError };

  if (input.status === 'waived' && !input.waiverReason?.trim()) {
    return { success: false, error: 'A waiver reason is required.' };
  }

  const supabase = await createClient();
  const completed = input.status === 'complete' || input.status === 'waived';
  const { data, error } = await supabase
    .from('year_end_close_steps')
    .update({
      status: input.status,
      assigned_to: input.assignedTo ?? null,
      due_date: input.dueDate ?? null,
      notes: input.notes ?? null,
      evidence: input.evidence ?? [],
      documents: input.documents ?? [],
      waiver_reason: input.waiverReason ?? null,
      completed_by: completed ? active.user.id : null,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq('id', input.stepId)
    .eq('workspace_id', active.orgId)
    .select('run_id, step_key')
    .single();

  if (error) return { success: false, error: error.message };

  await audit('year_end_close_step_updated', data.run_id, { stepId: input.stepId, stepKey: data.step_key, status: input.status });
  revalidatePath(`/year-end-close/${data.run_id}`);
  return { success: true, error: null };
}

export async function runYearEndCloseValidation(runId: string) {
  const { active, error: permissionError } = await assertWorkflowWrite();
  if (permissionError) return { data: null, error: permissionError };

  const { run, error } = await loadRun(runId);
  if (!run) return { data: null, error };

  const supabase = await createClient();
  const validation = await validateYearEndCloseReadiness({ run, workspaceId: active.orgId, supabase });

  await Promise.all(Object.entries(validation.stepStatuses).map(([stepKey, status]) =>
    supabase
      .from('year_end_close_steps')
      .update({
        status,
        blockers: validation.blockers.filter((item) => item.stepKey === stepKey),
      })
      .eq('run_id', runId)
      .eq('workspace_id', active.orgId)
      .eq('step_key', stepKey),
  ));

  await audit('year_end_close_validation_run', runId, { status: validation.status, blockerCount: validation.blockers.length });
  revalidatePath(`/year-end-close/${runId}`);
  return { data: validation, error: null };
}

export async function generateYearEndAnnualAccounts(runId: string): Promise<{ data: { reportVersionId: string } | null; error: string | null }> {
  const { active, error: permissionError } = await assertWorkflowWrite();
  if (permissionError) return { data: null, error: permissionError };

  const { run, error: runError } = await loadRun(runId);
  if (!run) return { data: null, error: runError };

  const pack = await loadAnnualAccountsPack({ financialYear: run.financialYear, basis: run.basis });
  if (!pack.data) return { data: null, error: pack.error ?? 'Annual accounts could not be generated.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('report_versions')
    .insert({
      workspace_id: active.orgId,
      report_type: 'annual_accounts',
      report_title: `Year-end annual accounts ${run.financialYear}`,
      period_start: run.periodStart,
      period_end: run.periodEnd,
      financial_year: run.financialYear,
      basis: run.basis,
      filters_applied: { source: 'year_end_close', runId },
      validation_summary: pack.data.validationResults,
      traceability_summary: pack.data.evidenceIndex,
      snapshot_payload: pack.data,
      generated_by: active.user.id,
      prepared_by: active.user.id,
      status: 'review',
      version: 1,
    })
    .select('id')
    .single();

  if (error) return { data: null, error: error.message };

  await Promise.all([
    supabase
      .from('year_end_close_runs')
      .update({ annual_accounts_report_version_id: data.id, status: 'ready_for_review', updated_by: active.user.id })
      .eq('id', runId)
      .eq('workspace_id', active.orgId),
    supabase
      .from('year_end_close_steps')
      .update({ status: 'complete', completed_by: active.user.id, completed_at: new Date().toISOString() })
      .eq('run_id', runId)
      .eq('workspace_id', active.orgId)
      .eq('step_key', 'generate-annual-accounts'),
  ]);

  await audit('year_end_annual_accounts_generated', runId, { reportVersionId: data.id });
  revalidatePath(`/year-end-close/${runId}`);
  return { data: { reportVersionId: data.id }, error: null };
}

export async function submitYearEndForTrusteeReview(runId: string): Promise<{ success: boolean; error: string | null }> {
  const { active, error: permissionError } = await assertWorkflowWrite();
  if (permissionError) return { success: false, error: permissionError };

  const supabase = await createClient();
  const { data: run } = await supabase
    .from('year_end_close_runs')
    .select('annual_accounts_report_version_id')
    .eq('id', runId)
    .eq('workspace_id', active.orgId)
    .single();

  const { error } = await supabase.from('report_approvals').insert({
    workspace_id: active.orgId,
    run_id: runId,
    report_version_id: run?.annual_accounts_report_version_id ?? null,
    approval_type: 'trustee_review',
    status: 'pending',
  });
  if (error) return { success: false, error: error.message };

  await audit('year_end_submitted_for_trustee_review', runId);
  revalidatePath(`/year-end-close/${runId}`);
  return { success: true, error: null };
}

export async function approveYearEndClose(runId: string): Promise<{ success: boolean; error: string | null }> {
  const { active, error: permissionError } = await assertWorkflowWrite();
  if (permissionError) return { success: false, error: permissionError };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data: run } = await supabase
    .from('year_end_close_runs')
    .select('annual_accounts_report_version_id')
    .eq('id', runId)
    .eq('workspace_id', active.orgId)
    .single();

  const { error } = await supabase.from('report_approvals').insert({
    workspace_id: active.orgId,
    run_id: runId,
    report_version_id: run?.annual_accounts_report_version_id ?? null,
    approval_type: 'final_approval',
    status: 'approved',
    approved_by: active.user.id,
    approved_by_name: active.user.email ?? active.user.id,
    approved_at: now,
    notes: 'Final year-end close approval recorded.',
  });
  if (error) return { success: false, error: error.message };

  await Promise.all([
    supabase
      .from('year_end_close_runs')
      .update({ status: 'approved', approved_by: active.user.id, approved_at: now, updated_by: active.user.id })
      .eq('id', runId)
      .eq('workspace_id', active.orgId),
    supabase
      .from('year_end_close_steps')
      .update({ status: 'complete', completed_by: active.user.id, completed_at: now })
      .eq('run_id', runId)
      .eq('workspace_id', active.orgId)
      .in('step_key', ['trustee-review', 'final-approval']),
  ]);

  await audit('year_end_close_approved', runId);
  revalidatePath(`/year-end-close/${runId}`);
  return { success: true, error: null };
}

export async function lockYearEndFinancialPeriod(runId: string): Promise<{ success: boolean; error: string | null }> {
  const { active, error: permissionError } = await assertWorkflowWrite();
  if (permissionError) return { success: false, error: permissionError };

  const { run, error: runError } = await loadRun(runId);
  if (!run) return { success: false, error: runError };
  if (run.status !== 'approved' && !run.approvedAt) {
    return { success: false, error: 'Final approval is required before locking the financial year.' };
  }
  if (!run.financialPeriodId) {
    return { success: false, error: 'This close run is not linked to a financial period.' };
  }

  const locked = await lockPeriod(run.financialPeriodId);
  if (!locked.success) return locked;

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('year_end_close_runs')
    .update({ status: 'locked', locked_by: active.user.id, locked_at: now, updated_by: active.user.id })
    .eq('id', runId)
    .eq('workspace_id', active.orgId);
  if (error) return { success: false, error: error.message };

  await supabase
    .from('year_end_close_steps')
    .update({ status: 'complete', completed_by: active.user.id, completed_at: now })
    .eq('run_id', runId)
    .eq('workspace_id', active.orgId)
    .eq('step_key', 'lock-financial-year');

  await audit('year_end_financial_period_locked', runId, { financialPeriodId: run.financialPeriodId });
  revalidatePath(`/year-end-close/${runId}`);
  return { success: true, error: null };
}

export async function generateFilingPack(runId: string): Promise<{ data: { filingPackId: string } | null; error: string | null }> {
  const { active, error: permissionError } = await assertWorkflowWrite();
  if (permissionError) return { data: null, error: permissionError };

  const { run, error: runError } = await loadRun(runId);
  if (!run) return { data: null, error: runError };
  if (run.status !== 'locked' && !run.lockedAt) {
    return { data: null, error: 'The financial year must be locked before exporting the filing pack.' };
  }

  const composed = await composeYearEndFilingPack(run);
  if (!composed.data) return { data: null, error: composed.error };

  const payload: FilingPackPayload = composed.data;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('filing_packs')
    .upsert({
      workspace_id: active.orgId,
      run_id: runId,
      financial_year: run.financialYear,
      status: 'generated',
      annual_accounts_report_version_id: run.annualAccountsReportVersionId,
      annual_return_summary: payload.annualReturnSummary,
      pack_payload: payload,
      evidence_index: run.steps.flatMap((step) => step.evidence),
      export_manifest: payload.documents,
      generated_by: active.user.id,
      generated_at: now,
    }, { onConflict: 'run_id' })
    .select('id')
    .single();

  if (error) return { data: null, error: error.message };

  await Promise.all([
    supabase
      .from('year_end_close_runs')
      .update({ status: 'exported', filing_pack_id: data.id, updated_by: active.user.id })
      .eq('id', runId)
      .eq('workspace_id', active.orgId),
    supabase
      .from('year_end_close_steps')
      .update({ status: 'complete', completed_by: active.user.id, completed_at: now })
      .eq('run_id', runId)
      .eq('workspace_id', active.orgId)
      .eq('step_key', 'export-filing-pack'),
  ]);

  await audit('year_end_filing_pack_generated', runId, { filingPackId: data.id });
  revalidatePath(`/year-end-close/${runId}`);
  return { data: { filingPackId: data.id }, error: null };
}

export async function markFilingPackSubmitted(runId: string, submissionReference?: string): Promise<{ success: boolean; error: string | null }> {
  const { active, error: permissionError } = await assertWorkflowWrite();
  if (permissionError) return { success: false, error: permissionError };

  const { run, error: runError } = await loadRun(runId);
  if (!run) return { success: false, error: runError };
  if (!run.filingPackId) {
    return { success: false, error: 'Generate the filing pack before marking it submitted.' };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase.from('report_approvals').insert({
    workspace_id: active.orgId,
    run_id: runId,
    report_version_id: run.annualAccountsReportVersionId,
    approval_type: 'submission_signoff',
    status: 'approved',
    approved_by: active.user.id,
    approved_by_name: active.user.email ?? active.user.id,
    approved_at: now,
    notes: submissionReference ? `Submission reference: ${submissionReference}` : 'Submission confirmed.',
  });

  const [{ error: packError }, { error: runUpdateError }, { error: stepError }] = await Promise.all([
    supabase
      .from('filing_packs')
      .update({
        status: 'submitted',
        submitted_by: active.user.id,
        submitted_at: now,
        submission_reference: submissionReference ?? null,
      })
      .eq('id', run.filingPackId)
      .eq('workspace_id', active.orgId),
    supabase
      .from('year_end_close_runs')
      .update({
        status: 'submitted',
        submitted_by: active.user.id,
        submitted_at: now,
        submission_reference: submissionReference ?? null,
        updated_by: active.user.id,
      })
      .eq('id', runId)
      .eq('workspace_id', active.orgId),
    supabase
      .from('year_end_close_steps')
      .update({ status: 'complete', completed_by: active.user.id, completed_at: now })
      .eq('run_id', runId)
      .eq('workspace_id', active.orgId)
      .eq('step_key', 'mark-submitted'),
  ]);

  const error = packError ?? runUpdateError ?? stepError;
  if (error) return { success: false, error: error.message };

  await audit('year_end_filing_pack_submitted', runId, { submissionReference: submissionReference ?? null });
  revalidatePath(`/year-end-close/${runId}`);
  return { success: true, error: null };
}
