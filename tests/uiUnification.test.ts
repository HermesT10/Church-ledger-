import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const statCard = readFileSync(new URL('../src/components/stat-card.tsx', import.meta.url), 'utf8');
const accountsPage = readFileSync(new URL('../src/app/(app)/accounts/page.tsx', import.meta.url), 'utf8');
const donationsPage = readFileSync(new URL('../src/app/(app)/donations/page.tsx', import.meta.url), 'utf8');
const suppliersPage = readFileSync(new URL('../src/app/(app)/suppliers/page.tsx', import.meta.url), 'utf8');
const reportShell = readFileSync(new URL('../src/components/reports/report-shell.tsx', import.meta.url), 'utf8');
const reportFilterBar = readFileSync(new URL('../src/components/reports/report-filter-bar.tsx', import.meta.url), 'utf8');
const bvaClient = readFileSync(new URL('../src/app/(app)/reports/budget-vs-actual/bva-report-client.tsx', import.meta.url), 'utf8');
const fundMovementsClient = readFileSync(new URL('../src/app/(app)/reports/fund-movements/fund-movements-client.tsx', import.meta.url), 'utf8');
const fundsClient = readFileSync(new URL('../src/app/(app)/funds/funds-client.tsx', import.meta.url), 'utf8');
const fundDetailClient = readFileSync(new URL('../src/app/(app)/funds/[id]/fund-detail-client.tsx', import.meta.url), 'utf8');
const registerPage = readFileSync(new URL('../src/components/registers/register-page.tsx', import.meta.url), 'utf8');
const cashLayout = readFileSync(new URL('../src/app/(app)/cash/layout.tsx', import.meta.url), 'utf8');
const bankingHub = readFileSync(new URL('../src/app/(app)/banking/banking-hub-client.tsx', import.meta.url), 'utf8');
const givingImportsPage = readFileSync(new URL('../src/app/(app)/giving-imports/page.tsx', import.meta.url), 'utf8');
const givingImportsClient = readFileSync(new URL('../src/app/(app)/giving-imports/giving-imports-client.tsx', import.meta.url), 'utf8');

describe('premium UI unification', () => {
  it('uses compact shared metric cards', () => {
    expect(statCard).toContain('min-h-[128px]');
    expect(statCard).toContain('sm:text-2xl');
    expect(accountsPage).toContain('sm:grid-cols-2 xl:grid-cols-5');
    expect(donationsPage).toContain('sm:grid-cols-2 lg:grid-cols-4');
    expect(suppliersPage).toContain('sm:grid-cols-2 lg:grid-cols-4');
  });

  it('uses neutral premium data cards instead of strong tinted page cards', () => {
    expect(donationsPage).not.toContain('bg-emerald-100/40');
    expect(suppliersPage).not.toContain('bg-indigo-100/45');
    expect(accountsPage).toContain('rounded-3xl border-border/70');
    expect(donationsPage).toContain('rounded-3xl border-border/70');
    expect(suppliersPage).toContain('rounded-3xl border-border/70');
  });

  it('reduces reports navigation and filter clutter', () => {
    expect(reportShell).toContain('Switch report');
    expect(reportFilterBar).toContain('repeat(auto-fit,minmax(170px,1fr))');
    expect(bvaClient).toContain('rounded-xl border border-input bg-card');
    expect(fundMovementsClient).toContain('rounded-xl border border-input bg-card');
  });

  it('uses labelled dropdown filter cards for funds and registers', () => {
    expect(fundsClient).toContain('<select');
    expect(fundsClient).toContain('Period');
    expect(fundsClient).toContain('Activity');
    expect(fundsClient).not.toContain('Period:</span>');
    expect(fundDetailClient).toContain('Choose the range for this fund detail view');
    expect(registerPage).toContain('name="year"');
    expect(registerPage).toContain('name="fundId"');
    expect(registerPage).toContain('name="groupBy"');
    expect(registerPage).toContain('Apply filters');
  });

  it('aligns cash, banking, and giving imports with the same app chrome', () => {
    expect(cashLayout).toContain('rounded-2xl border border-border/70 bg-card');
    expect(bankingHub).toContain('bg-card p-3 shadow-card');
    expect(givingImportsPage).toContain('PageShell');
    expect(givingImportsPage).toContain('PageHeader');
    expect(givingImportsClient).not.toContain('gradient=');
    expect(givingImportsClient).toContain('rounded-3xl border-border/70 bg-card');
  });
});
