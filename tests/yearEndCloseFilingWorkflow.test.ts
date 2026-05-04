import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildAnnualReturnAssistantSummary } from '../src/lib/year-end-close/annual-return';
import { YEAR_END_CLOSE_STEPS } from '../src/lib/year-end-close/steps';
import { YEAR_END_CLOSE_STEP_KEYS, type YearEndCloseRun, type AnnualReturnAssistantSummary } from '../src/lib/year-end-close/types';
import type { AnnualAccountsPack } from '../src/lib/annual-accounts/types';

const audit = readFileSync(new URL('../docs/audits/year-end-close-filing-workflow-audit.md', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260430223000_year_end_close_filing_workflow.sql', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../src/lib/year-end-close/actions.ts', import.meta.url), 'utf8');
const validation = readFileSync(new URL('../src/lib/year-end-close/validation.ts', import.meta.url), 'utf8');
const filingPack = readFileSync(new URL('../src/lib/year-end-close/filing-pack.ts', import.meta.url), 'utf8');
const annualReturn = readFileSync(new URL('../src/lib/year-end-close/annual-return.ts', import.meta.url), 'utf8');
const periodActions = readFileSync(new URL('../src/lib/periods/actions.ts', import.meta.url), 'utf8');
const listPage = readFileSync(new URL('../src/app/(app)/year-end-close/page.tsx', import.meta.url), 'utf8');
const runPage = readFileSync(new URL('../src/app/(app)/year-end-close/[runId]/page.tsx', import.meta.url), 'utf8');
const runClient = readFileSync(new URL('../src/app/(app)/year-end-close/[runId]/year-end-close-client.tsx', import.meta.url), 'utf8');
const reportsCommandCentre = readFileSync(new URL('../src/app/(app)/reports/reports-command-centre.tsx', import.meta.url), 'utf8');
const monthEndPage = readFileSync(new URL('../src/app/(app)/month-end/page.tsx', import.meta.url), 'utf8');
const periodsPage = readFileSync(new URL('../src/app/(app)/settings/periods/page.tsx', import.meta.url), 'utf8');
const implementationSummary = readFileSync(new URL('../docs/implementation/year-end-close-filing-workflow-summary.md', import.meta.url), 'utf8');

const pack: AnnualAccountsPack = {
  financialYear: 2026,
  basis: 'accruals',
  periodStart: '2026-01-01',
  periodEnd: '2026-12-31',
  generatedAt: '2026-12-31T00:00:00.000Z',
  charityDetails: {
    charityName: 'Church',
    legalName: 'Church',
    charityNumber: '123',
    principalAddress: '1 High Street',
    governingDocument: 'Trust deed',
    charityObjects: 'Objects',
    publicBenefitStatement: 'Public benefit',
    treasurerName: 'Treasurer',
    bankAccountNames: ['Bank'],
  },
  trusteesAndOfficers: [{ id: 't1', name: 'A Trustee', role: 'trustee', email: null }],
  examinerDetails: { name: '', firm: '', address: '', qualification: '', reportText: '' },
  narrativeSections: {
    objectivesActivities: 'Activities',
    publicBenefit: 'Public benefit statement',
    achievementsPerformance: 'Achievements',
    financialReview: 'Financial review',
    reservesPolicy: 'Reserves policy',
    principalRisks: 'Risk register reviewed',
    futurePlans: '',
    structureGovernance: '',
    referenceAdminDetails: '',
    reviewed: true,
  },
  sofaRows: [
    { id: 'income', section: 'income', label: 'Income', unrestrictedPence: 100000, restrictedPence: 20000, designatedPence: 0, totalCurrentYearPence: 120000, totalPriorYearPence: 100000 },
    { id: 'expense', section: 'expenditure', label: 'Expenditure', unrestrictedPence: 50000, restrictedPence: 10000, designatedPence: 0, totalCurrentYearPence: 60000, totalPriorYearPence: 55000 },
  ],
  balanceSheetRows: [],
  cashflow: null,
  notes: [],
  evidenceIndex: [{ id: 'e1', title: 'Bank rec', source: 'bank', reference: 'BR-1' }],
  validationResults: [],
  approval: { approvedByName: '', approvedByUserId: null, approvedAt: null, trusteeMeetingDate: null, signatureName: '', final: false },
  exports: [],
  sourceReports: {
    payrollRunCount: 1,
    giftAid: { dashboard: { recentBatchCount: 1, unclaimedAmountPence: 0 } },
  },
};

describe('year-end close filing workflow', () => {
  it('documents current period locks, reporting foundations, and gaps', () => {
    expect(audit).toContain('Period Locks');
    expect(audit).toContain('Month-End Close');
    expect(audit).toContain('Annual Accounts, Reporting, And Filing Foundations');
    expect(audit).toContain('Current Posting And Lock Enforcement Paths');
    expect(audit).toContain('No persisted `year_end_close_runs`');
  });

  it('creates the required tables with workspace RLS', () => {
    for (const table of ['year_end_close_runs', 'year_end_close_steps', 'filing_packs', 'report_approvals']) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain('public.is_org_treasurer_or_admin(workspace_id)');
    expect(migration).toContain("status in ('draft', 'in_progress', 'ready_for_review', 'approved', 'locked', 'exported', 'submitted', 'archived')");
  });

  it('defines and seeds all 23 workflow steps', () => {
    expect(YEAR_END_CLOSE_STEPS).toHaveLength(23);
    expect(YEAR_END_CLOSE_STEPS.map((step) => step.stepKey)).toEqual(YEAR_END_CLOSE_STEP_KEYS);
    expect(actions).toContain('YEAR_END_CLOSE_STEPS.map');
    expect(actions).toContain("upsert(stepRows, { onConflict: 'run_id,step_key' })");
  });

  it('models dependencies, validation sources, recommended actions, and waiver rules', () => {
    expect(YEAR_END_CLOSE_STEPS.every((step) => step.recommendedAction.length > 0)).toBe(true);
    expect(YEAR_END_CLOSE_STEPS.find((step) => step.stepKey === 'reconcile-bank-accounts')?.canWaive).toBe(false);
    expect(YEAR_END_CLOSE_STEPS.find((step) => step.stepKey === 'review-unreconciled-transactions')?.canWaive).toBe(true);
    expect(YEAR_END_CLOSE_STEPS.find((step) => step.stepKey === 'lock-financial-year')?.dependencies).toContain('final-approval');
  });

  it('implements validation blockers for reconciliation, drafts, trial balance, accounts, and approvals', () => {
    for (const source of [
      'bank_reconciliation_summary',
      'draft_registers',
      'annual_accounts_validation',
      'trial_balance',
      'report_approvals',
    ]) {
      expect(validation).toContain(source);
    }
    expect(validation).toContain('recommendedAction');
    expect(validation).toContain('waivable');
  });

  it('hardens period locking and defines admin overrides', () => {
    expect(periodActions).toContain('assertDateNotInLockedPeriod');
    expect(periodActions).toContain('requestLockedPeriodOverride');
    expect(periodActions).toContain('Post a reversal or adjustment in an open period');
    expect(migration).toContain('create or replace function public.assert_not_locked_financial_date');
    expect(migration).toContain('locked_period_overrides');
  });

  it('composes filing packs with required documents and schedules', () => {
    for (const required of [
      'Annual accounts PDF',
      'Trustee annual report DOCX',
      'Accounts schedules workbook',
      'Evidence index',
      'Annual Return Assistant summary',
      'trialBalance',
      'fundMovements',
      'bankReconciliation',
      'giftAid',
      'auditLogExtract',
      'examinerChecklist',
    ]) {
      expect(filingPack).toContain(required);
    }
  });

  it('generates Annual Return Assistant fields requiring review where appropriate', () => {
    const summary: AnnualReturnAssistantSummary = buildAnnualReturnAssistantSummary(pack);
    expect(summary.fields.map((field) => field.fieldKey)).toEqual(expect.arrayContaining([
      'income',
      'expenditure',
      'trustees',
      'staff_payroll',
      'gift_aid',
      'public_benefit',
      'activities_achievements',
      'reserves_policy',
      'risk_notes',
      'grants_fundraising',
    ]));
    expect(summary.fields.find((field) => field.fieldKey === 'income')?.suggestedValue).toBe(1200);
    expect(annualReturn).toContain('needsReview');
  });

  it('requires approval before final export and records submitted state', () => {
    expect(actions).toContain('Final approval is required before locking the financial year.');
    expect(actions).toContain('The financial year must be locked before exporting the filing pack.');
    expect(actions).toContain('submission_reference');
    expect(actions).toContain("approval_type: 'submission_signoff'");
    expect(actions).toContain("status: 'submitted'");
  });

  it('builds the guided routes and navigation entry points', () => {
    expect(listPage).toContain('Create close run');
    expect(runPage).toContain('YearEndCloseClient');
    expect(runClient).toContain('Validate readiness');
    expect(runClient).toContain('Mark submitted');
    expect(reportsCommandCentre).toContain('/year-end-close');
    expect(monthEndPage).toContain('/year-end-close');
    expect(periodsPage).toContain('/year-end-close');
  });

  it('documents implementation details and limitations', () => {
    expect(implementationSummary).toContain('Workflow Lifecycle');
    expect(implementationSummary).toContain('Database Tables And RLS');
    expect(implementationSummary).toContain('Annual Return Assistant');
    expect(implementationSummary).toContain('Remaining Limitations');
  });

  it('keeps the run contract explicit for submitted state metadata', () => {
    const run: YearEndCloseRun = {
      id: 'run-1',
      workspaceId: 'org-1',
      financialPeriodId: 'period-1',
      financialYear: 2026,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      basis: 'accruals',
      status: 'submitted',
      annualAccountsReportVersionId: 'rv-1',
      filingPackId: 'fp-1',
      approvedBy: 'u1',
      approvedAt: '2026-12-31T00:00:00.000Z',
      lockedBy: 'u1',
      lockedAt: '2026-12-31T00:00:00.000Z',
      submittedBy: 'u1',
      submittedAt: '2027-01-01T00:00:00.000Z',
      submissionReference: 'CC-123',
      createdAt: '2026-12-31T00:00:00.000Z',
      updatedAt: '2027-01-01T00:00:00.000Z',
      steps: [],
    };

    expect(run.status).toBe('submitted');
    expect(run.submissionReference).toBe('CC-123');
  });
});
