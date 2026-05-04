import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildPayrollJournalLines, computePayrollGross } from '../src/lib/payroll/validation';

const root = existsSync(join(process.cwd(), 'Church-ledger-'))
  ? join(process.cwd(), 'Church-ledger-')
  : process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

describe('payroll completeness upgrade', () => {
  it('creates the audit with current gaps and target controls', () => {
    const path = 'docs/audits/payroll-completeness-audit.md';
    expect(existsSync(join(root, path))).toBe(true);
    const audit = read(path);

    expect(audit).toContain('Payroll Journal Logic');
    expect(audit).toContain('PAYE/NIC liability');
    expect(audit).toContain('import preview/commit workflow');
    expect(audit).toContain('reversal/correction workflow');
    expect(audit).toContain('payment reconciliation');
  });

  it('adds payroll schema fields, imports, liabilities, reversals, settings, RLS, and immutability', () => {
    const migration = read('supabase/migrations/20260501090500_payroll_completeness_upgrade.sql');

    for (const expected of [
      'department_ministry',
      'payroll_status',
      'default_fund_id',
      'pension_scheme_participation',
      'payment_date',
      'reviewed_by',
      'paid_by',
      'reconciled_by',
      'total_employee_nic_pence',
      'total_employer_cost_pence',
      'payroll_import_batches',
      'payroll_import_rows',
      'payroll_liability_payments',
      'payroll_reversals',
      'payroll_settings',
      'enable row level security',
      'payroll_lines_insert_draft_runs',
      'payroll_lines_delete_draft_runs',
    ]) {
      expect(migration).toContain(expected);
    }
  });

  it('aligns SQL posting with the TypeScript payroll journal model', () => {
    const migration = read('supabase/migrations/20260501090500_payroll_completeness_upgrade.sql');

    expect(migration).toContain('v_paye_nic_liability_pence := coalesce(v_run.total_paye_pence, 0) + v_employee_nic_pence + v_employer_nic_pence');
    expect(migration).toContain('v_pension_liability_pence := v_employee_pension_pence + v_employer_pension_pence');
    expect(migration).toContain('payroll_liability_payments');

    const lines = buildPayrollJournalLines({
      grossPence: 260000,
      netPence: 200000,
      payePence: 40000,
      employeeNicPence: 10000,
      employerNicPence: 30000,
      employeePensionPence: 10000,
      employerPensionPence: 20000,
      otherDeductionsPence: 0,
      nicPence: 30000,
      pensionPence: 20000,
      accountIds: {
        salariesAccountId: 'salary',
        erNicAccountId: 'er-nic',
        pensionAccountId: 'er-pension',
        payeNicLiabilityId: 'hmrc',
        pensionLiabilityId: 'pension-payable',
        netPayLiabilityId: 'net-pay',
      },
    });

    expect(computePayrollGross({
      netPence: 200000,
      payePence: 40000,
      employeeNicPence: 10000,
      employeePensionPence: 10000,
    })).toBe(260000);
    expect(lines.reduce((sum, line) => sum + line.debitPence, 0)).toBe(310000);
    expect(lines.reduce((sum, line) => sum + line.creditPence, 0)).toBe(310000);
    expect(lines.find((line) => line.accountId === 'hmrc')?.creditPence).toBe(80000);
    expect(lines.find((line) => line.accountId === 'pension-payable')?.creditPence).toBe(30000);
  });

  it('implements lifecycle, imports, reports, reconciliation, and UI wiring', () => {
    const actions = read('src/lib/payroll/actions.ts');
    const reconciliation = read('src/lib/payroll/reconciliation.ts');
    const page = read('src/app/(app)/payroll/page.tsx');
    const detail = read('src/app/(app)/payroll/[id]/payroll-detail-client.tsx');
    const registry = read('src/lib/reports/engine/registry.ts');
    const service = read('src/lib/reports/engine/service.ts');

    for (const expected of [
      'reviewPayrollRun',
      'markPayrollPaid',
      'markPayrollReconciled',
      'reversePayrollRun',
      'createPayrollImportBatch',
      'previewPayrollImport',
      'commitPayrollImport',
      'getPayrollEmployerCosts',
      'getPayrollPensionReport',
      'getPayrollLiabilityReport',
      'getPayrollByFundMinistry',
      'getPayrollVsBudget',
    ]) {
      expect(actions).toContain(expected);
    }

    expect(reconciliation).toContain('suggestPayrollBankMatches');
    expect(detail).toContain('Review Payroll');
    expect(detail).toContain('Mark Paid');
    expect(detail).toContain('Mark Reconciled');
    expect(detail).toContain('reversePayrollRun');

    for (const tab of ['Overview', 'Payroll Runs', 'Employees', 'Employer Costs', 'Pension', 'Liabilities', 'Imports', 'Reports', 'Settings']) {
      expect(page).toContain(tab);
    }

    for (const reportType of [
      'payroll_summary',
      'payroll_employer_costs',
      'payroll_by_fund_ministry',
      'payroll_pension_contributions',
      'payroll_paye_nic_liability',
      'payroll_vs_budget',
    ]) {
      expect(registry).toContain(reportType);
      expect(service).toContain(reportType);
    }
  });

  it('updates annual accounts and year-end filing with payroll amounts', () => {
    const annualData = read('src/lib/annual-accounts/data.ts');
    const annualNotes = read('src/lib/annual-accounts/notes.ts');
    const filingPack = read('src/lib/year-end-close/filing-pack.ts');

    expect(annualData).toContain('payrollSummary');
    expect(annualData).toContain('totalEmployerCostPence');
    expect(annualNotes).toContain('Staff costs total');
    expect(filingPack).toContain('runCount');
    expect(filingPack).toContain('payrollSummary');
  });

  it('documents the implementation and limitation around HMRC RTI filing', () => {
    const summary = read('docs/implementation/payroll-completeness-upgrade-summary.md');

    expect(summary).toContain('Employee Model');
    expect(summary).toContain('Payroll Run Lifecycle');
    expect(summary).toContain('Journal Posting Logic');
    expect(summary).toContain('Bank Reconciliation');
    expect(summary).toContain('does not add HMRC RTI filing');
  });
});
