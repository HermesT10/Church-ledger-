import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCharityAccountsAnnualReturnDataPack,
  buildCharityAccountsAssistantSnapshot,
  buildCharityAccountsChecklist,
  buildCharityAccountsFinalPackDocuments,
  calculateCharityAccountsReadiness,
} from '../src/lib/charity-accounts-assistant/logic';
import type { AnnualAccountsPack } from '../src/lib/annual-accounts/types';

const root = existsSync(join(process.cwd(), 'Church-ledger-'))
  ? join(process.cwd(), 'Church-ledger-')
  : process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

function pack(overrides: Partial<AnnualAccountsPack> = {}): AnnualAccountsPack {
  return {
    financialYear: 2026,
    basis: 'accruals',
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    generatedAt: '2026-12-31T00:00:00.000Z',
    generatedBy: 'treasurer@example.com',
    charityDetails: {
      charityName: 'Example Church',
      legalName: 'Example Church',
      charityNumber: '123456',
      principalAddress: '1 High Street',
      governingDocument: 'Trust deed',
      charityObjects: 'Christian worship and community support',
      publicBenefitStatement: 'The church serves the public benefit through worship and community support.',
      treasurerName: 'Treasurer',
      bankAccountNames: ['Current account'],
    },
    trusteesAndOfficers: [{ id: 'trustee-1', name: 'Jane Trustee', role: 'trustee' }],
    examinerDetails: {
      name: 'Examiner',
      firm: 'Examiner LLP',
      address: '2 Audit Road',
      qualification: 'ACCA',
      reportText: 'Independent examiner report.',
    },
    narrativeSections: {
      objectivesActivities: 'Objectives and activities narrative.',
      publicBenefit: 'Public benefit narrative.',
      achievementsPerformance: 'Achievements narrative.',
      financialReview: 'Financial review narrative.',
      reservesPolicy: 'Reserves policy narrative.',
      principalRisks: 'Risk narrative.',
      futurePlans: 'Future plans narrative.',
      structureGovernance: 'Governance narrative.',
      referenceAdminDetails: 'Reference details.',
      reviewed: true,
    },
    sofaRows: [
      { id: 'income', section: 'income', label: 'Income', unrestrictedPence: 1000000, restrictedPence: 250000, designatedPence: 0, totalCurrentYearPence: 1250000, totalPriorYearPence: 1000000 },
      { id: 'expenditure', section: 'expenditure', label: 'Expenditure', unrestrictedPence: -700000, restrictedPence: -100000, designatedPence: 0, totalCurrentYearPence: -800000, totalPriorYearPence: -750000 },
      { id: 'closing-fund-balances', section: 'fund-movement', label: 'Closing funds', unrestrictedPence: 450000, restrictedPence: 0, designatedPence: 0, totalCurrentYearPence: 450000, totalPriorYearPence: 0 },
    ],
    balanceSheetRows: [
      { id: 'current-assets', section: 'current-assets', label: 'Current assets', currentYearPence: 450000, priorYearPence: 0 },
      { id: 'net-assets', section: 'net-assets', label: 'Net assets', currentYearPence: 450000, priorYearPence: 0 },
      { id: 'total-charity-funds', section: 'funds', label: 'Total charity funds', currentYearPence: 450000, priorYearPence: 0 },
    ],
    cashflow: null,
    notes: [{ id: 'note-1', title: 'Accounting policies', category: 'accounting-policy', required: true, recommended: true, text: 'Policy note.', sourceRefs: ['ledger'] }],
    evidenceIndex: [{ id: 'evidence-1', title: 'Bank statement', source: 'bank', reference: 'stmt-1', date: '2026-12-31', amountPence: null }],
    validationResults: [],
    approval: {
      approvedByName: 'Jane Trustee',
      approvedByUserId: 'user-1',
      approvedAt: '2026-12-31T00:00:00.000Z',
      trusteeMeetingDate: '2026-12-20',
      signatureName: 'Jane Trustee',
      final: true,
    },
    exports: [],
    sourceReports: {
      trialBalance: { isBalanced: true },
      bankReconciliation: { totals: { differencePence: 0, unreconciledLines: 0 } },
      giftAid: { dashboard: { recentBatchCount: 1, eligibleDonationsCount: 5, unclaimedAmountPence: 0 } },
      fundMovements: { funds: [{ fundType: 'restricted', closingBalancePence: 100000 }] },
      payrollRunCount: 0,
    },
    ...overrides,
  };
}

describe('charity accounts annual return assistant', () => {
  it('creates the required audit and implementation route wiring', () => {
    const audit = read('docs/audits/charity-accounts-annual-return-assistant-audit.md');
    const reportsCommandCentre = read('src/app/(app)/reports/reports-command-centre.tsx');
    const assistantPage = read('src/app/(app)/reports/charity-accounts-assistant/page.tsx');

    expect(audit).toContain('Current Annual Accounts Workflow');
    expect(audit).toContain('Annual Return data');
    expect(reportsCommandCentre).toContain('/reports/charity-accounts-assistant');
    expect(assistantPage).toContain('saveTrusteeReportNarrativeAction');
  });

  it('calculates readiness and blocks final approval for accounting failures', () => {
    const checklist = buildCharityAccountsChecklist(pack({
      approval: {
        approvedByName: '',
        signatureName: '',
        final: false,
      },
      sourceReports: {
        trialBalance: { isBalanced: false },
        bankReconciliation: { totals: { differencePence: 500, unreconciledLines: 2 } },
        fundMovements: { funds: [{ fundType: 'restricted', closingBalancePence: -1000 }] },
        payrollRunCount: 0,
      },
    }));
    const readiness = calculateCharityAccountsReadiness(checklist);

    expect(readiness.status).toBe('blocked');
    expect(readiness.blockers.map((item) => item.id)).toEqual(expect.arrayContaining([
      'bank-reconciliations-clear',
      'trial-balance-balanced',
      'restricted-funds-reviewed',
      'annual-accounts-approved',
    ]));
  });

  it('shows missing evidence warnings for receipts and examiner pack preparation', () => {
    const checklist = buildCharityAccountsChecklist(pack({ evidenceIndex: [] }));
    const evidence = checklist.find((item) => item.id === 'supporting-evidence-index');

    expect(evidence?.status).toBe('missing');
    expect(evidence?.description).toContain('Receipts');
  });

  it('generates Annual Return data pack values from annual accounts data', () => {
    const dataPack = buildCharityAccountsAnnualReturnDataPack(pack());

    expect(dataPack.grossIncomePence).toBe(1250000);
    expect(dataPack.grossExpenditurePence).toBe(800000);
    expect(dataPack.trustees).toEqual(['Jane Trustee']);
    expect(dataPack.publicBenefitNarrative).toContain('Public benefit');
  });

  it('builds final pack export descriptors for accounts, trustee report, examiner pack, annual return, AGM, schedules, and evidence', () => {
    const documents = buildCharityAccountsFinalPackDocuments(pack());

    expect(documents.map((document) => document.id)).toEqual(expect.arrayContaining([
      'annual-accounts',
      'trustees-report',
      'examiner-pack',
      'annual-return-data-pack',
      'agm-pack',
      'supporting-schedules',
      'evidence-index',
    ]));
  });

  it('builds a full assistant snapshot with guided sections and readiness score', () => {
    const snapshot = buildCharityAccountsAssistantSnapshot({ pack: pack(), basis: 'accruals' });

    expect(snapshot.readiness.score).toBeGreaterThan(70);
    expect(snapshot.supportingSchedules.length).toBeGreaterThan(5);
    expect(snapshot.finalPackDocuments.length).toBeGreaterThan(5);
    expect(snapshot.annualReturnDataPack.assistantSummary.fields.length).toBeGreaterThan(5);
  });
});
