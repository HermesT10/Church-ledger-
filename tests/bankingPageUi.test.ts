import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bankingPage = readFileSync(
  new URL('../src/app/(app)/banking/page.tsx', import.meta.url),
  'utf8'
);
const bankingHubClient = readFileSync(
  new URL('../src/app/(app)/banking/banking-hub-client.tsx', import.meta.url),
  'utf8'
);
const accountPage = readFileSync(
  new URL('../src/app/(app)/banking/[bankAccountId]/page.tsx', import.meta.url),
  'utf8'
);
const bankingActions = readFileSync(
  new URL('../src/lib/banking/actions.ts', import.meta.url),
  'utf8'
);
const bankRuleForm = readFileSync(
  new URL('../src/app/(app)/banking/bank-rule-form.tsx', import.meta.url),
  'utf8'
);
const exportRoute = readFileSync(
  new URL('../src/app/api/banking/export/route.ts', import.meta.url),
  'utf8'
);

describe('Banking cash-control UI', () => {
  it('renders the banking hub title, actions and redesigned summary labels', () => {
    expect(bankingPage).toContain('BankingHubClient');
    expect(bankingHubClient).toContain('Banking Dashboard');
    expect(bankingHubClient).toContain('Upload Statement');
    expect(bankRuleForm).toContain('Create Bank Rule');
    expect(bankingHubClient).toContain('Export');
    expect(bankingHubClient).toContain('Bank Balance');
    expect(bankingHubClient).toContain('Book Balance');
    expect(bankingHubClient).toContain('Difference');
    expect(bankingHubClient).toContain('Unreconciled');
  });

  it('uses premium banking dashboard UI sections', () => {
    expect(bankingHubClient).toContain('MetricOverview');
    expect(bankingHubClient).toContain('primaryMetrics');
    expect(bankingHubClient).toContain('statusMetrics');
    expect(bankingHubClient).toContain('min-h-[112px]');
    expect(bankingHubClient).not.toContain('CashFlowMix');
    expect(bankingHubClient).toContain(
      'rounded-3xl border border-border/70 bg-card'
    );
  });

  it('shows bank-card account panels while preserving account links and upload actions', () => {
    expect(bankingHubClient).toContain('href={`/banking/${account.id}`}');
    expect(bankingHubClient).toContain(
      'href={`/banking/${account.id}/import`}'
    );
    expect(bankingHubClient).toContain('Church Ledger');
    expect(bankingHubClient).toContain(
      'data-bank-card-theme={cardAppearance.theme}'
    );
    expect(bankingHubClient).toContain('resolveBankCardAppearance(account)');
    expect(bankingHubClient).toContain(
      'rounded-r-full border-r-2 border-current'
    );
    expect(bankingHubClient).toContain('bg-warning/90');
    expect(bankingHubClient).toContain('bg-danger/90');
    expect(bankingHubClient).toContain('Balance');
    expect(bankingHubClient).toContain('Book balance');
    expect(bankingHubClient).toContain('Difference');
    expect(bankingHubClient).toContain('Unreconciled');
  });

  it('uses a light analytics-style cash-flow chart', () => {
    expect(bankingHubClient).toContain('Cash flow over time');
    expect(bankingHubClient).toContain('CartesianGrid');
    expect(bankingHubClient).toContain('Series 1');
    expect(bankingHubClient).toContain('Series 2');
    expect(bankingHubClient).toContain('Series 3');
    expect(bankingHubClient).not.toContain('bg-background/60');
    expect(bankingHubClient).toContain('hsl(var(--primary) / 0.68)');
  });

  it('defines account detail tabs and transaction filters', () => {
    for (const label of [
      'Overview',
      'Transactions',
      'Statements',
      'Reconciliation',
      'Rules',
      'Documents',
      'Audit History',
    ]) {
      expect(accountPage).toContain(label);
    }
    expect(accountPage).toContain('name="dateFrom"');
    expect(accountPage).toContain('name="status"');
    expect(accountPage).toContain('name="direction"');
    expect(accountPage).toContain('name="amountMin"');
    expect(accountPage).toContain('Search description/reference');
  });

  it('supports statement history and empty states', () => {
    expect(accountPage).toContain('Rows detected');
    expect(accountPage).toContain('Rows imported');
    expect(accountPage).toContain('Duplicates skipped');
    expect(accountPage).toContain('No statements imported yet.');
    expect(accountPage).toContain('No transactions match these filters.');
  });

  it('polishes the bank account detail hero and cash-control overview without changing tabs', () => {
    expect(accountPage).toContain('Back to Banking');
    expect(accountPage).toContain('Ledger account linked');
    expect(accountPage).toContain('No ledger account');
    expect(accountPage).toContain('Cash-control status');
    expect(accountPage).toContain(
      'Reconciliation confidence for this account.'
    );
    expect(accountPage).toContain('detail.reconciliation.progress_percent');
    expect(accountPage).toContain('detailMetrics');
    expect(accountPage).toContain('min-h-[112px]');
  });

  it('uses server-side filtering and export helpers', () => {
    expect(bankingActions).toContain('status?: BankingTransactionStatusFilter');
    expect(bankingActions).toContain("status === 'needs_matching'");
    expect(bankingActions).toContain("direction === 'in'");
    expect(bankingActions).toContain("from('bank_rules')");
    expect(exportRoute).toContain('content-disposition');
    expect(exportRoute).toContain('bank-transactions-');
  });
});
