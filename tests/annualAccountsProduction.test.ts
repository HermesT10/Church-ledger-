import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ANNUAL_ACCOUNTS_STEPS, type AnnualAccountsPack } from '../src/lib/annual-accounts/types';
import { buildAnnualAccountsSOFA } from '../src/lib/annual-accounts/sofa';
import { buildAnnualAccountsBalanceSheet, validateAnnualAccountsBalanceSheet } from '../src/lib/annual-accounts/balance-sheet';
import { buildAnnualAccountsNotes } from '../src/lib/annual-accounts/notes';
import { validateAnnualAccountsPack } from '../src/lib/annual-accounts/validation';
import {
  buildAnnualAccountsDocxExport,
  buildAnnualAccountsEvidenceIndexExport,
  buildAnnualAccountsExcelExport,
  buildAnnualAccountsPdfExport,
} from '../src/lib/annual-accounts/exports';

const audit = readFileSync(new URL('../docs/audits/annual-accounts-production-audit.md', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260430161500_annual_accounts_drafts.sql', import.meta.url), 'utf8');
const dataFile = readFileSync(new URL('../src/lib/annual-accounts/data.ts', import.meta.url), 'utf8');
const builderClient = readFileSync(
  new URL('../src/app/(app)/reports/annual/accounts-builder/annual-accounts-builder-client.tsx', import.meta.url),
  'utf8',
);

const sofa = buildAnnualAccountsSOFA({
  sofa: {
    year: 2026,
    incomeRows: [
      {
        accountId: 'income-1',
        accountCode: '4000',
        accountName: 'Offerings',
        accountType: 'income',
        unrestrictedPence: 1000,
        restrictedPence: 2000,
        designatedPence: 3000,
        totalPence: 6000,
      },
    ],
    expenditureRows: [],
    incomeTotals: { unrestrictedPence: 1000, restrictedPence: 2000, designatedPence: 3000, totalPence: 6000 },
    expenditureTotals: { unrestrictedPence: 0, restrictedPence: 0, designatedPence: 0, totalPence: 0 },
    netTotals: { unrestrictedPence: 1000, restrictedPence: 2000, designatedPence: 3000, totalPence: 6000 },
  },
  priorYearSOFA: null,
  fundMovements: {
    period: { year: 2026, startDate: '2026-01-01', endDate: '2026-12-31' },
    funds: [
      { fundId: 'f1', fundName: 'General', fundType: 'unrestricted', openingBalancePence: 4000, incomePence: 1000, expenditurePence: 0, netMovementPence: 1000, closingBalancePence: 5000 },
      { fundId: 'f2', fundName: 'Roof', fundType: 'restricted', openingBalancePence: 1000, incomePence: 2000, expenditurePence: 0, netMovementPence: 2000, closingBalancePence: 3000 },
    ],
    totals: { openingBalancePence: 5000, incomePence: 3000, expenditurePence: 0, netMovementPence: 3000, closingBalancePence: 8000 },
  },
});

const balanceSheetRows = buildAnnualAccountsBalanceSheet({
  balanceSheet: {
    asOfDate: '2026-12-31',
    sections: {
      assets: { total: 8000, rows: [{ accountId: 'bank', accountCode: '1000', accountName: 'Bank', balance: 8000 }] },
      liabilities: { total: 0, rows: [] },
      equity: { total: 8000, rows: [] },
    },
    netAssets: 8000,
    check: { balances: true, difference: 0 },
  },
  fundMovements: {
    period: { year: 2026, startDate: '2026-01-01', endDate: '2026-12-31' },
    funds: [
      { fundId: 'f1', fundName: 'General', fundType: 'unrestricted', openingBalancePence: 4000, incomePence: 1000, expenditurePence: 0, netMovementPence: 1000, closingBalancePence: 5000 },
      { fundId: 'f2', fundName: 'Roof', fundType: 'restricted', openingBalancePence: 1000, incomePence: 2000, expenditurePence: 0, netMovementPence: 2000, closingBalancePence: 3000 },
    ],
    totals: { openingBalancePence: 5000, incomePence: 3000, expenditurePence: 0, netMovementPence: 3000, closingBalancePence: 8000 },
  },
});

const notes = buildAnnualAccountsNotes({
  fundMovements: {
    period: { year: 2026, startDate: '2026-01-01', endDate: '2026-12-31' },
    funds: [{ fundId: 'f2', fundName: 'Roof', fundType: 'restricted', openingBalancePence: 1000, incomePence: 2000, expenditurePence: 0, netMovementPence: 2000, closingBalancePence: 3000 }],
    totals: { openingBalancePence: 1000, incomePence: 2000, expenditurePence: 0, netMovementPence: 2000, closingBalancePence: 3000 },
  },
  giftAid: {
    generatedAt: '2026-12-31',
    dashboard: {
      eligibleDonationsCount: 1,
      estimatedReclaimThisYearPence: 250,
      claimedAmountPence: 125,
      unclaimedAmountPence: 250,
      outstandingReclaimPence: 125,
      paidAmountPence: 0,
      missingDeclarationCount: 0,
      donationsExcluded: 0,
      recentBatchCount: 1,
      recentBatchDonationPence: 500,
      recentBatchGiftAidPence: 125,
    },
    recentClaims: [],
  },
  payrollRunCount: 1,
  hasPriorYearData: false,
});

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
  trusteesAndOfficers: [],
  examinerDetails: { name: '', firm: '', address: '', qualification: '', reportText: '' },
  narrativeSections: {
    objectivesActivities: '',
    publicBenefit: '',
    achievementsPerformance: '',
    financialReview: '',
    reservesPolicy: '',
    principalRisks: '',
    futurePlans: '',
    structureGovernance: '',
    referenceAdminDetails: '',
    reviewed: false,
  },
  sofaRows: sofa,
  balanceSheetRows,
  cashflow: null,
  notes,
  evidenceIndex: [{ id: 'e1', title: 'SOFA', source: 'sofa', reference: 'sofa' }],
  validationResults: [],
  approval: { approvedByName: '', approvedByUserId: null, approvedAt: null, trusteeMeetingDate: null, signatureName: '', final: false },
  exports: [],
  sourceReports: {
    priorYear: null,
    trialBalance: { isBalanced: true },
    bankReconciliation: { totals: { differencePence: 0 } },
    giftAid: { dashboard: { recentBatchCount: 1, eligibleDonationsCount: 1 } },
    payrollRunCount: 1,
    yearEndClose: { complete: true },
  },
};

describe('annual accounts production', () => {
  it('documents current annual accounts files, gaps, exports, and implementation sequence', () => {
    expect(audit).toContain('Files Found');
    expect(audit).toContain('Missing Sections');
    expect(audit).toContain('Data Sources');
    expect(audit).toContain('Export Formats');
    expect(audit).toContain('Implementation Plan');
  });

  it('defines the guided builder contract with all 11 steps', () => {
    expect(ANNUAL_ACCOUNTS_STEPS).toHaveLength(11);
    expect(ANNUAL_ACCOUNTS_STEPS).toEqual([
      'select-financial-year',
      'select-accounting-basis',
      'confirm-charity-details',
      'review-trustees-officers',
      'review-financial-statements',
      'review-notes',
      'add-trustee-narrative',
      'attach-examiner-details',
      'validate-pack',
      'trustee-approval',
      'export-final-pack',
    ]);
  });

  it('builds SOFA rows with fund columns and prior-year comparatives', () => {
    expect(sofa[0]).toMatchObject({
      unrestrictedPence: 1000,
      restrictedPence: 2000,
      designatedPence: 3000,
      totalCurrentYearPence: 6000,
      totalPriorYearPence: 0,
    });
    expect(sofa.some((row) => row.id === 'closing-fund-balances')).toBe(true);
  });

  it('validates balance sheet equality, trial balance, and bank agreement', () => {
    const results = validateAnnualAccountsBalanceSheet({
      balanceSheet: { asOfDate: '2026-12-31', sections: { assets: { rows: [], total: 0 }, liabilities: { rows: [], total: 0 }, equity: { rows: [], total: 0 } }, netAssets: 8000, check: { balances: true, difference: 0 } },
      rows: balanceSheetRows,
      trialBalanceIsBalanced: true,
      bankDifferencePence: 0,
    });
    expect(results.every((item) => item.status === 'passed')).toBe(true);
  });

  it('generates fund, missing-note, Gift Aid, payroll and comparative notes', () => {
    expect(notes.some((note) => note.id === 'restricted-fund-purposes' && note.missingReason)).toBe(true);
    expect(notes.some((note) => note.id === 'gift-aid')).toBe(true);
    expect(notes.some((note) => note.id === 'payroll-staff-costs' && note.required)).toBe(true);
    expect(notes.some((note) => note.id === 'comparatives' && note.required)).toBe(true);
  });

  it('runs annual accounts pack validation for approval, SOFA, funds, Gift Aid, and payroll', () => {
    const results = validateAnnualAccountsPack(pack);
    expect(results.map((item) => item.id)).toEqual(expect.arrayContaining([
      'sofa-agrees-to-ledger',
      'fund-balances-agree',
      'gift-aid-summary-included',
      'payroll-note-included',
      'trustee-approval-present',
    ]));
    expect(results.find((item) => item.id === 'trustee-approval-present')?.status).toBe('failed');
  });

  it('provides PDF, DOCX, Excel, and evidence index export hooks', () => {
    expect(buildAnnualAccountsPdfExport(pack).mimeType).toBe('application/pdf');
    expect(buildAnnualAccountsDocxExport(pack).filename).toContain('.docx');
    expect(buildAnnualAccountsExcelExport(pack).filename).toContain('.xlsx');
    expect(buildAnnualAccountsEvidenceIndexExport(pack).content).toContain('Title,Source,Reference');
  });

  it('uses professional report versions for approval and export lifecycle', () => {
    expect(dataFile).toContain("from('report_versions')");
    expect(dataFile).toContain("report_type: 'annual'");
    expect(dataFile).toContain('annual_accounts_approved');
    expect(builderClient).toContain('approveAnnualAccountsPack');
  });

  it('protects annual accounts drafts with workspace-scoped RLS', () => {
    expect(migration).toContain('create table if not exists public.annual_accounts_drafts');
    expect(migration).toContain('workspace_id uuid not null references public.organisations');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('public.is_org_treasurer_or_admin(workspace_id)');
    expect(migration).toContain('public.is_org_member(workspace_id)');
  });
});
