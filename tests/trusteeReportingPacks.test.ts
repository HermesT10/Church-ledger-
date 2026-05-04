import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateFinancialCommentary } from '../src/lib/reports/trustee-packs/commentary';
import { TRUSTEE_PACK_GLOSSARY } from '../src/lib/reports/trustee-packs/glossary';
import { buildTrusteePackDocxExport, buildTrusteePackExcelExport, buildTrusteePackPdfExport } from '../src/lib/reports/trustee-packs/exports';
import { TRUSTEE_PACK_SECTION_KEYS, type TrusteePack } from '../src/lib/reports/trustee-packs/types';

const audit = readFileSync(new URL('../docs/audits/trustee-reporting-packs-audit.md', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260430174500_report_review_comments.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/lib/reports/engine/service.ts', import.meta.url), 'utf8');
const components = readFileSync(new URL('../src/components/reports/trustee-packs/index.tsx', import.meta.url), 'utf8');
const charts = readFileSync(new URL('../src/components/reports/trustee-packs/charts.tsx', import.meta.url), 'utf8');
const monthlyPage = readFileSync(new URL('../src/app/(app)/reports/monthly-dashboard/page.tsx', import.meta.url), 'utf8');
const trusteePage = readFileSync(new URL('../src/app/(app)/reports/trustee-snapshot/page.tsx', import.meta.url), 'utf8');
const leadershipPage = readFileSync(new URL('../src/app/(app)/reports/leadership-snapshot/page.tsx', import.meta.url), 'utf8');
const quarterlyPage = readFileSync(new URL('../src/app/(app)/reports/quarterly/page.tsx', import.meta.url), 'utf8');
const agmPage = readFileSync(new URL('../src/app/(app)/reports/agm/page.tsx', import.meta.url), 'utf8');

const pack: TrusteePack = {
  id: 'pack-1',
  type: 'leadership_snapshot',
  reportType: 'leadership_snapshot',
  title: 'Leadership Pack',
  periodLabel: 'April 2026',
  periodStart: '2026-04-01',
  periodEnd: '2026-04-30',
  generatedAt: '2026-04-30T00:00:00.000Z',
  sections: TRUSTEE_PACK_SECTION_KEYS.map((key) => ({
    key,
    title: key,
    description: key,
    status: 'populated',
    metrics: [],
    narrative: ['Ready'],
    charts: [],
    sourceRefs: ['test'],
  })),
  kpis: [{ label: 'Income', value: '£1.00', source: 'test' }],
  commentary: generateFinancialCommentary({
    periodLabel: 'April 2026',
    currentIncomePence: 11200,
    currentExpensePence: 9000,
    priorIncomePence: 10000,
    priorExpensePence: 8000,
    budgetVariancePence: 1200,
    topBudgetVarianceLabel: 'Utilities',
    restrictedFundsRemainingPence: 5000,
    unreconciledBankTransactions: 3,
    giftAidOutstandingPence: 2500,
    supplierSpendPence: 4000,
    topSupplierName: 'Utility Co',
    payrollCostPence: 3000,
    lettingsIncomePence: 2000,
  }),
  definitions: TRUSTEE_PACK_GLOSSARY,
  actions: [{ id: 'a1', title: 'Action', body: 'Review bank items', priority: 'high', source: 'test' }],
  approval: {
    status: 'draft',
    preparedBy: 'user-1',
    reviewedBy: null,
    approvedBy: null,
    approvedByName: null,
    approvedAt: null,
    trusteeReviewNotes: [],
    internalComments: [],
  },
  exports: [
    { format: 'pdf', label: 'PDF', description: 'PDF', requiresApproval: true },
    { format: 'docx', label: 'DOCX', description: 'DOCX', requiresApproval: false },
    { format: 'excel', label: 'Excel', description: 'Excel', requiresApproval: false },
  ],
  sourceReports: {},
};

describe('trustee reporting packs', () => {
  it('documents current pack implementation and gaps', () => {
    expect(audit).toContain('Files Found');
    expect(audit).toContain('Gap Matrix');
    expect(audit).toContain('Commentary Sources');
    expect(audit).toContain('Workflow And Export State');
    expect(audit).toContain('Implementation Sequence');
  });

  it('defines the required 15 pack sections', () => {
    expect(TRUSTEE_PACK_SECTION_KEYS).toEqual([
      'cover',
      'executive_summary',
      'key_financial_kpis',
      'income_expenditure',
      'budget_vs_actual',
      'restricted_funds',
      'cash_position',
      'bank_reconciliation',
      'gift_aid',
      'lettings_income',
      'supplier_spend',
      'payroll_summary',
      'risks_alerts',
      'recommended_actions',
      'appendices',
    ]);
    expect(pack.sections.map((section) => section.key)).toEqual(TRUSTEE_PACK_SECTION_KEYS);
  });

  it('generates deterministic explainable commentary including prior-period comparison', () => {
    const first = generateFinancialCommentary({
      periodLabel: 'April 2026',
      currentIncomePence: 11200,
      currentExpensePence: 9000,
      priorIncomePence: 10000,
      priorExpensePence: 8000,
      budgetVariancePence: 1200,
      restrictedFundsRemainingPence: 5000,
      unreconciledBankTransactions: 3,
    });
    const second = generateFinancialCommentary({
      periodLabel: 'April 2026',
      currentIncomePence: 11200,
      currentExpensePence: 9000,
      priorIncomePence: 10000,
      priorExpensePence: 8000,
      budgetVariancePence: 1200,
      restrictedFundsRemainingPence: 5000,
      unreconciledBankTransactions: 3,
    });
    expect(first).toEqual(second);
    expect(first.find((item) => item.id === 'income-prior-period')?.body).toContain('12.0%');
    expect(first.every((item) => item.calculation.length > 0 && item.editableText.length > 0)).toBe(true);
  });

  it('contains trustee-friendly glossary definitions', () => {
    expect(TRUSTEE_PACK_GLOSSARY.map((item) => item.term)).toEqual(expect.arrayContaining([
      'Restricted funds',
      'Unrestricted funds',
      'Net position',
      'Creditors',
      'Debtors',
      'SOFA',
      'Reconciliation',
    ]));
  });

  it('wires pack panels into all target report pages', () => {
    for (const file of [monthlyPage, trusteePage, leadershipPage, quarterlyPage, agmPage]) {
      expect(file).toContain('buildTrusteeReportingPack');
      expect(file).toContain('initialPack');
    }
    expect(components).toContain('TrusteePackPanel');
  });

  it('wires required chart types with empty data states', () => {
    for (const chartType of [
      'income_vs_expenses',
      'budget_variance',
      'restricted_funds_remaining',
      'cash_trend',
      'top_expense_categories',
      'supplier_spend',
    ]) {
      expect(readFileSync(new URL('../src/lib/reports/trustee-packs/types.ts', import.meta.url), 'utf8')).toContain(chartType);
    }
    expect(charts).toContain('No chart data available');
    expect(charts).toContain('ResponsiveContainer');
  });

  it('supports review comments and approval lifecycle with RLS', () => {
    expect(service).toContain('archiveReportVersion');
    expect(service).toContain('addReportReviewComment');
    expect(service).toContain('listReportReviewComments');
    expect(service).toContain('resolveReportReviewComment');
    expect(service).toContain('report_approval_events');
    expect(migration).toContain('create table if not exists public.report_review_comments');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('public.is_org_treasurer_or_admin(workspace_id)');
    expect(migration).toContain("visibility in ('internal', 'trustee')");
  });

  it('provides PDF, Word, and Excel appendix export foundations', () => {
    expect(buildTrusteePackPdfExport(pack).mimeType).toBe('application/pdf');
    expect(buildTrusteePackDocxExport(pack).filename).toContain('.docx');
    expect(buildTrusteePackExcelExport(pack).filename).toContain('.xlsx');
    expect(buildTrusteePackExcelExport(pack).content).toContain('sections');
  });

  it('models empty or not-applicable data states explicitly', () => {
    expect(pack.sections.every((section) => ['populated', 'empty', 'not_applicable', 'needs_review'].includes(section.status))).toBe(true);
    expect(components).toContain('No rows available for this section');
  });
});
