import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sidebarPath = new URL('../src/components/app-sidebar.tsx', import.meta.url);
const sidebar = readFileSync(sidebarPath, 'utf8');

describe('sidebar treasurer workflow', () => {
  it('orders sections Overview → Banking → Income → Expenses → Accounting → Planning → Reports → Admin', () => {
    const o = sidebar.indexOf("title: 'Overview'");
    const b = sidebar.indexOf("title: 'Banking'");
    const i = sidebar.indexOf("title: 'Income'");
    const e = sidebar.indexOf("title: 'Expenses'");
    const a = sidebar.indexOf("title: 'Accounting'");
    const p = sidebar.indexOf("title: 'Planning'");
    const r = sidebar.indexOf("title: 'Reports'");
    const ad = sidebar.indexOf("title: 'Admin'");
    expect(o).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(o);
    expect(i).toBeGreaterThan(b);
    expect(e).toBeGreaterThan(i);
    expect(a).toBeGreaterThan(e);
    expect(p).toBeGreaterThan(a);
    expect(r).toBeGreaterThan(p);
    expect(ad).toBeGreaterThan(r);
  });

  it('renames bank hub label to Bank Accounts and keeps /banking', () => {
    expect(sidebar).toContain("label: 'Bank Accounts'");
    expect(sidebar).toContain("href: '/banking'");
    expect(sidebar).not.toContain("label: 'Banking'");
  });

  it('orders Banking items: Bank Accounts, Reconciliation, Transactions, Cash', () => {
    const bank = sidebar.indexOf("title: 'Banking'");
    const inc = sidebar.indexOf("title: 'Income'");
    const slice = sidebar.slice(bank, inc);
    const ba = slice.indexOf("label: 'Bank Accounts'");
    const rec = slice.indexOf("label: 'Reconciliation'");
    const tx = slice.indexOf("label: 'Transactions'");
    const cash = slice.indexOf("label: 'Cash'");
    expect(ba).toBeLessThan(rec);
    expect(rec).toBeLessThan(tx);
    expect(tx).toBeLessThan(cash);
  });

  it('orders Expenses Payroll before Staff', () => {
    const exp = sidebar.indexOf("title: 'Expenses'");
    const acc = sidebar.indexOf("title: 'Accounting'");
    const slice = sidebar.slice(exp, acc);
    expect(slice.indexOf("label: 'Payroll'")).toBeLessThan(slice.indexOf("label: 'Staff'"));
  });

  it('uses Accounting section title instead of Structure', () => {
    expect(sidebar).toContain("title: 'Accounting'");
    expect(sidebar).not.toContain("title: 'Structure'");
  });

  it('puts Reports in its own section with matchPrefix', () => {
    const rep = sidebar.indexOf("title: 'Reports'");
    const plan = sidebar.indexOf("title: 'Planning'");
    expect(rep).toBeGreaterThan(plan);
    expect(sidebar.slice(rep, rep + 400)).toContain("matchPrefix: '/reports'");
  });

  it('Planning contains only Budgets and Month End', () => {
    const plan = sidebar.indexOf("title: 'Planning'");
    const rep = sidebar.indexOf("title: 'Reports'");
    const slice = sidebar.slice(plan, rep);
    expect(slice).toContain("label: 'Budgets'");
    expect(slice).toContain("label: 'Month End'");
    expect(slice).not.toContain("label: 'Reports'");
  });

  it('bumps sidebar localStorage key for section state', () => {
    expect(sidebar).toContain("'sidebarNavGroups_v2'");
  });
});
