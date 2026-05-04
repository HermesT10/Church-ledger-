import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = existsSync(join(process.cwd(), 'Church-ledger-'))
  ? join(process.cwd(), 'Church-ledger-')
  : process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

const reportsPage = read('src/app/(app)/reports/page.tsx');
const commandCentre = read('src/app/(app)/reports/reports-command-centre.tsx');

describe('reports page UI redesign', () => {
  it('documents the reports audit and implementation summary', () => {
    const auditPath = 'docs/audits/reports-page-ui-redesign-audit.md';
    const summaryPath = 'docs/implementation/reports-page-ui-redesign-summary.md';

    expect(existsSync(join(root, auditPath))).toBe(true);
    expect(existsSync(join(root, summaryPath))).toBe(true);

    expect(read(auditPath)).toContain('Current UI Structure');
    expect(read(auditPath)).toContain('Current Report List');
    expect(read(summaryPath)).toContain('Routes Preserved');
    expect(read(summaryPath)).toContain('Report Grouping');
  });

  it('uses the reports command centre instead of the old flat report card grid', () => {
    expect(reportsPage).toContain('ReportsCommandCentre');
    expect(reportsPage).not.toContain('REPORT_CARDS');
    expect(commandCentre).toContain('Reporting command centre');
    expect(commandCentre).toContain('Featured Reports');
  });

  it('keeps all previous reports accessible', () => {
    [
      '/reports/monthly-dashboard',
      '/reports/income-statement',
      '/reports/income-expense-summary',
      '/reports/balance-sheet',
      '/reports/sofa',
      '/reports/cash-flow',
      '/reports/trial-balance',
      '/reports/budget-vs-actual',
      '/reports/fund-movements',
      '/reports/bank-reconciliation-summary',
      '/reports/gift-aid-summary',
      '/reports/lettings',
      '/reports/forecast',
      '/reports/cash-position',
      '/reports/supplier-spend',
      '/reports/trustee-snapshot',
      '/reports/leadership-snapshot',
      '/reports/quarterly',
      '/reports/annual',
      '/reports/charity-accounts-assistant',
      '/year-end-close',
      '/reports/agm',
      '/reports/export-pack',
    ].forEach((href) => {
      expect(commandCentre).toContain(href);
    });
  });

  it('renders featured reports and grouped sections without duplicate grouped placement', () => {
    expect(commandCentre).toContain("featured: true");
    expect(commandCentre).toContain('Monthly Dashboard');
    expect(commandCentre).toContain('Trustee Snapshot');
    expect(commandCentre).toContain('Annual Report');
    expect(commandCentre).toContain('AGM Pack');
    expect(commandCentre).toContain('Financial Statements');
    expect(commandCentre).toContain('Management & Analysis');
    expect(commandCentre).toContain('Compliance & Controls');
    expect(commandCentre).toContain('Church Operations');
    expect(commandCentre).toContain('Packs & Snapshots');
    expect(commandCentre).toContain('if (report.featured) return false');
  });

  it('adds mini previews, filters, right panel workflow, and empty generated state', () => {
    expect(commandCentre).toContain('MiniPreview');
    expect(commandCentre).toContain('Search reports');
    expect(commandCentre).toContain('All categories');
    expect(commandCentre).toContain('All outputs');
    expect(commandCentre).toContain('All audiences');
    expect(commandCentre).toContain('Recommended Report Flow');
    expect(commandCentre).toContain('Report Health');
    expect(commandCentre).toContain('Recently Generated');
    expect(commandCentre).toContain('No report exports generated yet');
  });
});
