import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { REPORT_TYPE_KEYS, REPORT_DEFINITIONS } from '../src/lib/reports/engine/registry';
import { validateBalanceSheet, validateTrialBalance } from '../src/lib/reports/engine/validation';
import { summarizeJournalTraceability } from '../src/lib/reports/engine/traceability';

const migration = readFileSync(
  new URL('../supabase/migrations/20260430133100_professional_reporting_engine.sql', import.meta.url),
  'utf8',
);
const auditDoc = readFileSync(
  new URL('../docs/audits/professional-reporting-engine-audit.md', import.meta.url),
  'utf8',
);
const types = readFileSync(
  new URL('../src/lib/reports/engine/types.ts', import.meta.url),
  'utf8',
);
const service = readFileSync(
  new URL('../src/lib/reports/engine/service.ts', import.meta.url),
  'utf8',
);
const exportsFile = readFileSync(
  new URL('../src/lib/reports/engine/exports.ts', import.meta.url),
  'utf8',
);
const professionalComponents = readFileSync(
  new URL('../src/components/reports/professional/index.tsx', import.meta.url),
  'utf8',
);

describe('professional reporting engine', () => {
  it('documents the existing reporting estate and gaps', () => {
    expect(auditDoc).toContain('Report Inventory');
    expect(auditDoc).toContain('Current SOFA Logic');
    expect(auditDoc).toContain('Current Balance Sheet Logic');
    expect(auditDoc).toContain('Export Utilities Found');
    expect(auditDoc).toContain('Duplicated Calculation Logic');
    expect(auditDoc).toContain('Implementation Sequence');
  });

  it('registers all known report types with professional definitions', () => {
    expect(REPORT_TYPE_KEYS).toEqual([
      'monthly_dashboard',
      'income_statement',
      'income_expense_summary',
      'balance_sheet',
      'sofa',
      'cash_flow',
      'trial_balance',
      'budget_vs_actual',
      'fund_movements',
      'bank_reconciliation_summary',
      'gift_aid_summary',
      'lettings',
      'forecast',
      'cash_position',
      'supplier_spend',
      'payroll_summary',
      'payroll_employer_costs',
      'payroll_by_fund_ministry',
      'payroll_pension_contributions',
      'payroll_paye_nic_liability',
      'payroll_vs_budget',
      'trustee_snapshot',
      'leadership_snapshot',
      'quarterly',
      'annual',
      'agm',
      'export_pack',
    ]);
    for (const key of REPORT_TYPE_KEYS) {
      expect(REPORT_DEFINITIONS[key].title).toBeTruthy();
      expect(REPORT_DEFINITIONS[key].requiredDataSources.length).toBeGreaterThan(0);
      expect(REPORT_DEFINITIONS[key].supportedExportFormats.length).toBeGreaterThan(0);
      expect(REPORT_DEFINITIONS[key].trusteeExplanation).toBeTruthy();
    }
  });

  it('defines the required report metadata, snapshot, validation, and traceability contracts', () => {
    for (const field of [
      'report_id',
      'workspace_id',
      'report_type',
      'report_title',
      'period_start',
      'period_end',
      'financial_year',
      'basis',
      'funds_included',
      'filters_applied',
      'generated_by',
      'generated_at',
      'prepared_by',
      'reviewed_by',
      'approved_by',
      'status',
      'version',
    ]) {
      expect(types).toContain(field);
    }
    expect(types).toContain("ReportStatus = 'draft' | 'review' | 'approved' | 'exported' | 'archived'");
    expect(types).toContain("ReportExportFormat = 'pdf' | 'csv' | 'excel' | 'docx'");
    expect(types).toContain('ReportLineTraceability');
  });

  it('catches trial balance and balance sheet blocker validations', () => {
    expect(validateTrialBalance({ isBalanced: false, totalDebitPence: 100, totalCreditPence: 50 })[0]).toMatchObject({
      severity: 'blocker',
      rule: 'trial_balance_balances',
    });
    expect(validateBalanceSheet({ check: { balances: false, difference: 25 } })[0]).toMatchObject({
      severity: 'blocker',
      rule: 'balance_sheet_balances',
      amountPence: 25,
    });
  });

  it('standardizes traceability source fields', () => {
    const traceability = summarizeJournalTraceability({
      lineId: 'line-1',
      label: 'Offering income',
      amountPence: 12500,
      journalId: 'journal-1',
      accountId: 'account-1',
      fundId: 'fund-1',
      transactionDate: '2026-04-30',
    });
    expect(traceability.sources[0]).toEqual({
      source_type: 'journal_line',
      source_id: 'journal-1',
      amount: 12500,
      account_id: 'account-1',
      fund_id: 'fund-1',
      transaction_date: '2026-04-30',
      evidence_status: 'unknown',
      href: '/journals/journal-1',
    });
  });

  it('implements engine service hooks for snapshots, versioning, approval, and export routing', () => {
    for (const functionName of [
      'getReportData',
      'validateReportData',
      'generateReportSnapshot',
      'saveReportVersion',
      'submitReportVersionForReview',
      'approveReportVersion',
      'exportReport',
    ]) {
      expect(service).toContain(`export async function ${functionName}`);
    }
    expect(service).toContain('hasBlockingValidations');
    expect(service).toContain('report_version_created');
    expect(service).toContain('report_submitted_for_review');
    expect(service).toContain('report_approved');
    expect(service).toContain('report_exported');
    expect(exportsFile).toContain('exportSnapshotAsCsv');
    expect(exportsFile).toContain('exportSnapshotPlaceholder');
  });

  it('adds workspace-scoped RLS migration for report versions and exports', () => {
    expect(migration).toContain('create table if not exists public.report_versions');
    expect(migration).toContain('create table if not exists public.report_exports');
    expect(migration).toContain('create table if not exists public.report_approval_events');
    expect(migration).toContain('workspace_id uuid not null references public.organisations');
    expect(migration).toContain('alter table public.report_versions enable row level security');
    expect(migration).toContain('public.is_org_treasurer_or_admin(workspace_id)');
    expect(migration).toContain("status in ('approved', 'exported', 'archived')");
    expect(migration).toContain('idx_report_versions_workspace_type_generated');
  });

  it('provides professional report UI components and initial report page integration hooks', () => {
    for (const component of [
      'ReportCover',
      'ReportHeader',
      'ReportFooter',
      'ReportMetadataPanel',
      'ReportSection',
      'ReportTable',
      'ReportChart',
      'ReportNarrativeBlock',
      'ReportNotesBlock',
      'ReportApprovalBlock',
      'ReportAppendix',
      'ReportExportActions',
      'ProfessionalReportSnapshotPanel',
    ]) {
      expect(professionalComponents).toContain(`function ${component}`);
    }
    for (const page of [
      '../src/app/(app)/reports/trial-balance/page.tsx',
      '../src/app/(app)/reports/balance-sheet/page.tsx',
      '../src/app/(app)/reports/sofa/page.tsx',
      '../src/app/(app)/reports/annual/page.tsx',
      '../src/app/(app)/reports/agm/page.tsx',
    ]) {
      const source = readFileSync(new URL(page, import.meta.url), 'utf8');
      expect(source).toContain('generateReportSnapshot');
      expect(source).toContain('ProfessionalReportSnapshotPanel');
    }
  });
});
