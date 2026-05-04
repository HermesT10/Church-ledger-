import 'server-only';

import { getActiveOrg } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit';
import {
  getAGMReport,
  getAnnualReport,
  getBalanceSheetReport,
  getBudgetVsActualReport,
  getCashFlowReport,
  getDashboardData,
  getForecastReport,
  getFundMovementsReport,
  getIncomeExpenditureReport,
  getQuarterlyReport,
  getTrusteeSnapshot,
} from '@/lib/reports/actions';
import {
  getCashPositionReport,
  getSOFAReport,
  getSupplierSpendReport,
  getTrialBalance,
} from '@/lib/reports/glReports';
import { exportSnapshot } from './exports';
import { generateStoredReportDocumentExport } from '@/lib/document-production/actions';
import { getReportDefinition } from './registry';
import { emptyTraceability } from './traceability';
import type {
  ProfessionalReportMetadata,
  ReportExportFormat,
  ReportExportResult,
  ReportFilters,
  ReportSnapshot,
  ReportStatus,
  ReportTypeKey,
  ReportValidationResult,
} from './types';
import {
  buildOperationalValidationWarnings,
  hasBlockingValidations,
  validateReportPayload,
} from './validation';
import { buildTrusteeReportingPack } from '@/lib/reports/trustee-packs/data';
import type { TrusteePackType } from '@/lib/reports/trustee-packs/types';
import {
  getPayrollEmployerCosts,
  getPayrollLiabilityReport,
  getPayrollOverview,
  getPayrollPensionReport,
  getPayrollByFundMinistry,
  getPayrollVsBudget,
} from '@/lib/payroll/actions';

function isReportManager(role: string | null | undefined) {
  return role === 'admin' || role === 'treasurer';
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function periodFromFilters(filters: ReportFilters) {
  const year = filters.year ?? new Date().getFullYear();
  if (filters.asOfDate) {
    return { start: `${year}-01-01`, end: filters.asOfDate, year };
  }
  if (filters.startDate && filters.endDate) {
    return { start: filters.startDate, end: filters.endDate, year };
  }
  if (filters.month) {
    const start = new Date(Date.UTC(year, filters.month - 1, 1));
    const end = new Date(Date.UTC(year, filters.month, 0));
    return { start: dateOnly(start), end: dateOnly(end), year };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31`, year };
}

function normalizeFilters(filters: ReportFilters): ReportFilters {
  return {
    basis: filters.basis ?? 'accruals',
    ...filters,
  };
}

function isTrusteePackType(reportType: ReportTypeKey): reportType is TrusteePackType {
  return ['monthly_dashboard', 'trustee_snapshot', 'leadership_snapshot', 'quarterly', 'agm'].includes(reportType);
}

function buildMetadata(params: {
  reportType: ReportTypeKey;
  workspaceId: string;
  userId: string;
  filters: ReportFilters;
  version: number;
  status?: ReportStatus;
}): ProfessionalReportMetadata {
  const definition = getReportDefinition(params.reportType);
  const period = periodFromFilters(params.filters);
  return {
    report_id: crypto.randomUUID(),
    workspace_id: params.workspaceId,
    report_type: params.reportType,
    report_title: definition.title,
    period_start: period.start,
    period_end: period.end,
    financial_year: period.year,
    basis: params.filters.basis ?? 'accruals',
    funds_included: params.filters.fundId ? [params.filters.fundId] : [],
    filters_applied: normalizeFilters(params.filters),
    generated_by: params.userId,
    generated_at: new Date().toISOString(),
    prepared_by: params.userId,
    reviewed_by: null,
    approved_by: null,
    status: params.status ?? 'draft',
    version: params.version,
  };
}

async function getNextVersion(workspaceId: string, reportType: ReportTypeKey) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('report_versions')
    .select('version')
    .eq('workspace_id', workspaceId)
    .eq('report_type', reportType)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.version ?? 0) + 1;
}

export async function getReportData(
  reportType: ReportTypeKey,
  filters: ReportFilters,
): Promise<{ data: unknown; error: string | null }> {
  const ctx = await getActiveOrg();
  const year = filters.year ?? new Date().getFullYear();
  const asOfDate = filters.asOfDate ?? new Date().toISOString().slice(0, 10);

  switch (reportType) {
    case 'monthly_dashboard':
      return getDashboardData({ orgId: ctx.orgId, year });
    case 'income_statement':
    case 'income_expense_summary':
      return getIncomeExpenditureReport({ organisationId: ctx.orgId, year, month: filters.month, fundId: filters.fundId });
    case 'balance_sheet':
      return getBalanceSheetReport({ organisationId: ctx.orgId, asOfDate, fundId: filters.fundId });
    case 'sofa':
      return getSOFAReport({ year });
    case 'cash_flow':
      return getCashFlowReport({ organisationId: ctx.orgId, year, month: filters.month });
    case 'trial_balance':
      return getTrialBalance({ asOfDate, fundId: filters.fundId });
    case 'budget_vs_actual':
      return getBudgetVsActualReport({ orgId: ctx.orgId, year, budgetId: filters.budgetId ?? undefined, fundId: filters.fundId });
    case 'fund_movements':
      return getFundMovementsReport({ organisationId: ctx.orgId, year, month: filters.month, mode: filters.month ? 'MONTH' : 'YTD' });
    case 'forecast':
      return getForecastReport({ organisationId: ctx.orgId, year, fundId: filters.fundId });
    case 'cash_position':
      return getCashPositionReport();
    case 'supplier_spend':
      return getSupplierSpendReport({ year });
    case 'payroll_summary':
      return getPayrollOverview();
    case 'payroll_employer_costs':
      return getPayrollEmployerCosts();
    case 'payroll_by_fund_ministry':
      return getPayrollByFundMinistry();
    case 'payroll_pension_contributions':
      return getPayrollPensionReport();
    case 'payroll_paye_nic_liability':
      return getPayrollLiabilityReport();
    case 'payroll_vs_budget':
      return getPayrollVsBudget();
    case 'trustee_snapshot':
    case 'leadership_snapshot':
      return getTrusteeSnapshot({ organisationId: ctx.orgId });
    case 'quarterly':
      return getQuarterlyReport({ organisationId: ctx.orgId, year });
    case 'annual':
      return getAnnualReport({ organisationId: ctx.orgId, year });
    case 'agm':
      return getAGMReport({ organisationId: ctx.orgId, year });
    default:
      return {
        data: {
          message: `${getReportDefinition(reportType).title} is registered but not yet wired to a professional loader.`,
        },
        error: null,
      };
  }
}

async function loadOperationalValidationSignals(workspaceId: string) {
  const admin = createAdminClient();
  const [drafts, unreconciled, missingFundMappings] = await Promise.all([
    admin
      .from('journals')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', workspaceId)
      .neq('status', 'posted'),
    admin
      .from('bank_lines')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('reconciled', false),
    admin
      .from('journal_lines')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', workspaceId)
      .is('fund_id', null),
  ]);
  return buildOperationalValidationWarnings({
    draftJournalCount: drafts.count ?? 0,
    unreconciledBankLineCount: unreconciled.count ?? 0,
    missingFundMappingCount: missingFundMappings.count ?? 0,
  });
}

export async function validateReportData(
  reportType: ReportTypeKey,
  data: unknown,
  filters: ReportFilters,
): Promise<ReportValidationResult[]> {
  const ctx = await getActiveOrg();
  const definition = getReportDefinition(reportType);
  const metadata = buildMetadata({
    reportType,
    workspaceId: ctx.orgId,
    userId: ctx.user.id,
    filters,
    version: 1,
  });
  const base = validateReportPayload({
    metadata,
    definition,
    data,
    traceability: emptyTraceability(),
  });
  const operational = await loadOperationalValidationSignals(ctx.orgId);
  const relevantOperational = operational.filter((item) => definition.validationRules.includes(item.rule));
  return [...base, ...relevantOperational];
}

export async function generateReportSnapshot(
  reportType: ReportTypeKey,
  filters: ReportFilters,
): Promise<{ data: ReportSnapshot | null; error: string | null }> {
  const ctx = await getActiveOrg();
  const definition = getReportDefinition(reportType);
  const report = await getReportData(reportType, filters);
  if (report.error) return { data: null, error: report.error };
  const trusteePack = isTrusteePackType(reportType)
    ? await buildTrusteeReportingPack({
        type: reportType,
        year: filters.year,
        period: filters.period === 'last_month' || filters.period === 'ytd' ? filters.period : 'this_month',
      })
    : { data: null, error: null };

  const version = await getNextVersion(ctx.orgId, reportType);
  const metadata = buildMetadata({
    reportType,
    workspaceId: ctx.orgId,
    userId: ctx.user.id,
    filters,
    version,
  });
  const traceability = emptyTraceability();
  const snapshotShell = {
    metadata,
    definition,
    data: trusteePack.data ?? report.data,
    validation: [],
    traceability,
    commentary: trusteePack.data
      ? trusteePack.data.commentary.map((item) => item.adminOverrideText ?? item.editableText)
      : [
          definition.trusteeExplanation,
          'Professional commentary can be expanded from this versioned report snapshot.',
        ],
    generated_at: metadata.generated_at,
  } satisfies ReportSnapshot;
  const validation = await validateReportData(reportType, trusteePack.data ?? report.data, filters);

  return {
    data: { ...snapshotShell, validation },
    error: null,
  };
}

export async function saveReportVersion(
  snapshot: ReportSnapshot,
): Promise<{ data: { id: string } | null; error: string | null }> {
  const ctx = await getActiveOrg();
  if (!isReportManager(ctx.role)) return { data: null, error: 'Only admins and treasurers can save report versions.' };
  if (snapshot.metadata.workspace_id !== ctx.orgId) return { data: null, error: 'Report workspace mismatch.' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('report_versions')
    .insert({
      id: snapshot.metadata.report_id,
      workspace_id: snapshot.metadata.workspace_id,
      report_type: snapshot.metadata.report_type,
      report_title: snapshot.metadata.report_title,
      period_start: snapshot.metadata.period_start,
      period_end: snapshot.metadata.period_end,
      financial_year: snapshot.metadata.financial_year,
      basis: snapshot.metadata.basis,
      funds_included: snapshot.metadata.funds_included,
      filters_applied: snapshot.metadata.filters_applied,
      validation_summary: snapshot.validation,
      traceability_summary: snapshot.traceability,
      snapshot_payload: { data: snapshot.data, commentary: snapshot.commentary, definition: snapshot.definition },
      generated_by: ctx.user.id,
      prepared_by: ctx.user.id,
      status: snapshot.metadata.status,
      version: snapshot.metadata.version,
    })
    .select('id')
    .single();
  if (error) return { data: null, error: error.message };

  await logReportEvent('report_version_created', snapshot.metadata.report_id, { reportType: snapshot.metadata.report_type });
  return { data: { id: data.id as string }, error: null };
}

async function logReportEvent(action: string, reportId: string, metadata: Record<string, unknown>) {
  const ctx = await getActiveOrg();
  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action,
    entityType: 'report_version',
    entityId: reportId,
    metadata,
  });
}

async function updateReportStatus(params: {
  reportId: string;
  from: ReportStatus[];
  to: ReportStatus;
  action: string;
  extra?: Record<string, unknown>;
}) {
  const ctx = await getActiveOrg();
  if (!isReportManager(ctx.role)) return { data: null, error: 'Only admins and treasurers can manage report approvals.' };
  const admin = createAdminClient();
  const { data: current, error: fetchError } = await admin
    .from('report_versions')
    .select('id, workspace_id, status, validation_summary')
    .eq('workspace_id', ctx.orgId)
    .eq('id', params.reportId)
    .single();
  if (fetchError || !current) return { data: null, error: fetchError?.message ?? 'Report version not found.' };
  if (!params.from.includes(current.status as ReportStatus)) {
    return { data: null, error: `Report must be ${params.from.join(' or ')} before this action.` };
  }
  if (params.to === 'approved' && hasBlockingValidations((current.validation_summary ?? []) as ReportValidationResult[])) {
    return { data: null, error: 'Resolve blocker validations before approving this report.' };
  }

  const update: Record<string, unknown> = { status: params.to };
  if (params.to === 'review') update.reviewed_by = ctx.user.id;
  if (params.to === 'review') update.reviewed_at = new Date().toISOString();
  if (params.to === 'approved') update.approved_by = ctx.user.id;
  if (params.to === 'approved') update.approved_at = new Date().toISOString();
  if (params.to === 'archived') update.archived_by = ctx.user.id;
  if (params.to === 'archived') update.archived_at = new Date().toISOString();

  const { error } = await admin
    .from('report_versions')
    .update(update)
    .eq('workspace_id', ctx.orgId)
    .eq('id', params.reportId);
  if (error) return { data: null, error: error.message };

  await admin.from('report_approval_events').insert({
    workspace_id: ctx.orgId,
    report_version_id: params.reportId,
    action: params.action,
    actor_id: ctx.user.id,
    from_status: current.status,
    to_status: params.to,
    metadata: params.extra ?? {},
  });
  await logReportEvent(params.action, params.reportId, { from: current.status, to: params.to, ...(params.extra ?? {}) });
  return { data: { id: params.reportId, status: params.to }, error: null };
}

export async function submitReportVersionForReview(reportId: string) {
  return updateReportStatus({
    reportId,
    from: ['draft'],
    to: 'review',
    action: 'report_submitted_for_review',
  });
}

export async function approveReportVersion(reportId: string) {
  return updateReportStatus({
    reportId,
    from: ['review'],
    to: 'approved',
    action: 'report_approved',
  });
}

export async function archiveReportVersion(reportId: string) {
  return updateReportStatus({
    reportId,
    from: ['draft', 'review', 'approved', 'exported'],
    to: 'archived',
    action: 'report_archived',
  });
}

export async function addReportReviewComment(params: {
  reportId: string;
  body: string;
  visibility: 'internal' | 'trustee';
}) {
  const ctx = await getActiveOrg();
  if (!isReportManager(ctx.role)) return { data: null, error: 'Only admins and treasurers can add report review comments.' };
  const body = params.body.trim();
  if (!body) return { data: null, error: 'Comment body is required.' };
  const admin = createAdminClient();
  const { data: report, error: reportError } = await admin
    .from('report_versions')
    .select('id, workspace_id')
    .eq('workspace_id', ctx.orgId)
    .eq('id', params.reportId)
    .single();
  if (reportError || !report) return { data: null, error: reportError?.message ?? 'Report version not found.' };

  const { data, error } = await admin
    .from('report_review_comments')
    .insert({
      workspace_id: ctx.orgId,
      report_version_id: params.reportId,
      author_id: ctx.user.id,
      visibility: params.visibility,
      body,
    })
    .select('id')
    .single();
  if (error) return { data: null, error: error.message };

  await logReportEvent('report_review_comment_added', params.reportId, { visibility: params.visibility });
  return { data: { id: data.id as string }, error: null };
}

export async function listReportReviewComments(reportId: string) {
  const ctx = await getActiveOrg();
  const admin = createAdminClient();
  const reportQuery = await admin
    .from('report_versions')
    .select('id, status')
    .eq('workspace_id', ctx.orgId)
    .eq('id', reportId)
    .single();
  if (reportQuery.error || !reportQuery.data) {
    return { data: [], error: reportQuery.error?.message ?? 'Report version not found.' };
  }
  const canSeeInternal = isReportManager(ctx.role);
  if (!canSeeInternal && !['approved', 'exported'].includes(reportQuery.data.status as string)) {
    return { data: [], error: 'Report comments are only visible after approval.' };
  }

  let query = admin
    .from('report_review_comments')
    .select('id, visibility, body, author_id, resolved_at, created_at')
    .eq('workspace_id', ctx.orgId)
    .eq('report_version_id', reportId)
    .order('created_at', { ascending: false });
  if (!canSeeInternal) query = query.eq('visibility', 'trustee');
  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

export async function resolveReportReviewComment(commentId: string) {
  const ctx = await getActiveOrg();
  if (!isReportManager(ctx.role)) return { data: null, error: 'Only admins and treasurers can resolve report review comments.' };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('report_review_comments')
    .update({ resolved_at: new Date().toISOString() })
    .eq('workspace_id', ctx.orgId)
    .eq('id', commentId)
    .select('id, report_version_id')
    .single();
  if (error) return { data: null, error: error.message };
  await logReportEvent('report_review_comment_resolved', data.report_version_id as string, { commentId });
  return { data: { id: data.id as string }, error: null };
}

export async function exportReport(
  reportId: string,
  format: ReportExportFormat,
): Promise<{ data: ReportExportResult | null; error: string | null }> {
  const ctx = await getActiveOrg();
  if (!isReportManager(ctx.role)) return { data: null, error: 'Only admins and treasurers can export report versions.' };
  const admin = createAdminClient();
  const { data: row, error: fetchError } = await admin
    .from('report_versions')
    .select('*')
    .eq('workspace_id', ctx.orgId)
    .eq('id', reportId)
    .single();
  if (fetchError || !row) return { data: null, error: fetchError?.message ?? 'Report version not found.' };
  if (!['approved', 'exported'].includes(row.status as string)) {
    return { data: null, error: 'Only approved reports can be exported.' };
  }

  if (format !== 'csv') {
    const stored = await generateStoredReportDocumentExport({ reportId, format });
    if (!stored.data) return { data: null, error: stored.error };
    const payload = `/api/document-exports/${stored.data.id}`;
    return {
      data: {
        reportId,
        format,
        fileName: stored.data.fileName,
        contentType: stored.data.contentType,
        payload,
        checksumSha256: stored.data.checksumSha256,
      },
      error: null,
    };
  }

  const snapshotPayload = row.snapshot_payload as { data?: unknown; commentary?: string[]; definition?: unknown } | null;
  const snapshot: ReportSnapshot = {
    metadata: {
      report_id: row.id as string,
      workspace_id: row.workspace_id as string,
      report_type: row.report_type as ReportTypeKey,
      report_title: row.report_title as string,
      period_start: row.period_start as string,
      period_end: row.period_end as string,
      financial_year: row.financial_year as number | null,
      basis: row.basis as 'cash' | 'accruals',
      funds_included: row.funds_included as string[],
      filters_applied: row.filters_applied as ReportFilters,
      generated_by: row.generated_by as string,
      generated_at: row.generated_at as string,
      prepared_by: row.prepared_by as string,
      reviewed_by: row.reviewed_by as string | null,
      approved_by: row.approved_by as string | null,
      status: row.status as ReportStatus,
      version: row.version as number,
    },
    definition: getReportDefinition(row.report_type as ReportTypeKey),
    data: snapshotPayload?.data ?? {},
    validation: (row.validation_summary ?? []) as ReportValidationResult[],
    traceability: [],
    commentary: snapshotPayload?.commentary ?? [],
    generated_at: row.generated_at as string,
  };
  const exported = exportSnapshot(snapshot, format);

  const { error: exportError } = await admin.from('report_exports').insert({
    workspace_id: ctx.orgId,
    report_version_id: reportId,
    report_type: row.report_type,
    format,
    file_name: exported.fileName,
    checksum_sha256: exported.checksumSha256,
    export_payload: { contentType: exported.contentType, bytes: exported.payload.length },
    generated_by: ctx.user.id,
  });
  if (exportError) return { data: null, error: exportError.message };

  await admin
    .from('report_versions')
    .update({ status: 'exported', exported_by: ctx.user.id, exported_at: new Date().toISOString() })
    .eq('workspace_id', ctx.orgId)
    .eq('id', reportId);
  await logReportEvent('report_exported', reportId, { format, fileName: exported.fileName });
  return { data: exported, error: null };
}
