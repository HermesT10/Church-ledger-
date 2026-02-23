'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import type {
  STrialBalanceRow,
  STrialBalanceReport,
  SSOFARow,
  SSOFAReport,
  SSupplierSpendRow,
  SSupplierSpendReport,
  SCashPositionRow,
  SCashPositionReport,
} from './types';

/* ================================================================== */
/*  Trial Balance                                                      */
/* ================================================================== */

export async function getTrialBalance(params: {
  asOfDate: string;
  fundId?: string | null;
}): Promise<{ data: STrialBalanceReport | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const { asOfDate, fundId } = params;
  const supabase = await createClient();

  // 1. Fetch all active accounts
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .order('code');

  if (accErr) return { data: null, error: accErr.message };

  // 2. Fetch posted journals up to asOfDate
  const { data: journals } = await supabase
    .from('journals')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('status', 'posted')
    .lte('journal_date', asOfDate);

  if (!journals || journals.length === 0) {
    return {
      data: {
        asOfDate,
        rows: (accounts ?? []).map((a) => ({
          accountId: a.id,
          accountCode: a.code ?? '',
          accountName: a.name,
          accountType: a.type,
          debitPence: 0,
          creditPence: 0,
          netBalancePence: 0,
        })),
        totalDebitPence: 0,
        totalCreditPence: 0,
        isBalanced: true,
      },
      error: null,
    };
  }

  const journalIds = journals.map((j) => j.id);

  // 3. Fetch journal lines
  let query = supabase
    .from('journal_lines')
    .select('account_id, debit_pence, credit_pence')
    .eq('organisation_id', orgId)
    .in('journal_id', journalIds);

  if (fundId) {
    query = query.eq('fund_id', fundId);
  }

  const { data: lines } = await query;

  // 4. Aggregate per account
  const debitMap = new Map<string, number>();
  const creditMap = new Map<string, number>();

  for (const l of lines ?? []) {
    debitMap.set(l.account_id, (debitMap.get(l.account_id) ?? 0) + Number(l.debit_pence));
    creditMap.set(l.account_id, (creditMap.get(l.account_id) ?? 0) + Number(l.credit_pence));
  }

  let totalDebit = 0;
  let totalCredit = 0;

  const rows: STrialBalanceRow[] = (accounts ?? [])
    .map((a) => {
      const dr = debitMap.get(a.id) ?? 0;
      const cr = creditMap.get(a.id) ?? 0;
      totalDebit += dr;
      totalCredit += cr;
      return {
        accountId: a.id,
        accountCode: a.code ?? '',
        accountName: a.name,
        accountType: a.type,
        debitPence: dr,
        creditPence: cr,
        netBalancePence: dr - cr,
      };
    })
    .filter((r) => r.debitPence !== 0 || r.creditPence !== 0);

  return {
    data: {
      asOfDate,
      rows,
      totalDebitPence: totalDebit,
      totalCreditPence: totalCredit,
      isBalanced: totalDebit === totalCredit,
    },
    error: null,
  };
}

/* ================================================================== */
/*  SOFA (Statement of Financial Activities)                           */
/* ================================================================== */

export async function getSOFAReport(params: {
  year: number;
}): Promise<{ data: SSOFAReport | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const { year } = params;
  const supabase = await createClient();

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // 1. Fetch income/expense accounts
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('organisation_id', orgId)
    .in('type', ['income', 'expense'])
    .eq('is_active', true)
    .order('type')
    .order('code');

  if (accErr) return { data: null, error: accErr.message };

  // 2. Fetch posted journals for the year
  const { data: journals } = await supabase
    .from('journals')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('status', 'posted')
    .gte('journal_date', startDate)
    .lte('journal_date', endDate);

  if (!journals || journals.length === 0) {
    const emptyTotals = { unrestrictedPence: 0, restrictedPence: 0, designatedPence: 0, totalPence: 0 };
    return { data: { year, incomeRows: [], expenditureRows: [], incomeTotals: emptyTotals, expenditureTotals: emptyTotals, netTotals: emptyTotals }, error: null };
  }

  const journalIds = journals.map((j) => j.id);

  // 3. Fetch journal lines with fund info
  const { data: lines } = await supabase
    .from('journal_lines')
    .select('account_id, fund_id, debit_pence, credit_pence')
    .eq('organisation_id', orgId)
    .in('journal_id', journalIds);

  // 4. Fetch funds to determine types
  const { data: funds } = await supabase
    .from('funds')
    .select('id, type')
    .eq('organisation_id', orgId);

  const fundTypeMap = new Map<string, string>();
  for (const f of funds ?? []) {
    fundTypeMap.set(f.id, f.type);
  }

  // 5. Aggregate: per account per fund type
  type BucketKey = string; // accountId
  const buckets = new Map<BucketKey, { unrestricted: number; restricted: number; designated: number }>();

  for (const l of lines ?? []) {
    const fundType = l.fund_id ? (fundTypeMap.get(l.fund_id) ?? 'unrestricted') : 'unrestricted';
    const amt = Number(l.debit_pence) - Number(l.credit_pence);

    if (!buckets.has(l.account_id)) {
      buckets.set(l.account_id, { unrestricted: 0, restricted: 0, designated: 0 });
    }
    const b = buckets.get(l.account_id)!;
    if (fundType === 'restricted') b.restricted += amt;
    else if (fundType === 'designated') b.designated += amt;
    else b.unrestricted += amt;
  }

  // 6. Build SOFA rows
  const incomeAccounts = (accounts ?? []).filter((a) => a.type === 'income');
  const expenseAccounts = (accounts ?? []).filter((a) => a.type === 'expense');

  function buildRows(accts: typeof accounts): SSOFARow[] {
    return (accts ?? []).map((a) => {
      const b = buckets.get(a.id) ?? { unrestricted: 0, restricted: 0, designated: 0 };
      // Income accounts: credit - debit is positive income
      // We stored debit - credit, so for income, negate
      const sign = a.type === 'income' ? -1 : 1;
      return {
        accountId: a.id,
        accountCode: a.code ?? '',
        accountName: a.name,
        accountType: a.type,
        unrestrictedPence: b.unrestricted * sign,
        restrictedPence: b.restricted * sign,
        designatedPence: b.designated * sign,
        totalPence: (b.unrestricted + b.restricted + b.designated) * sign,
      };
    }).filter((r) => r.totalPence !== 0);
  }

  const incomeRows = buildRows(incomeAccounts);
  const expenditureRows = buildRows(expenseAccounts);

  function sumTotals(rows: SSOFARow[]) {
    return rows.reduce(
      (acc, r) => ({
        unrestrictedPence: acc.unrestrictedPence + r.unrestrictedPence,
        restrictedPence: acc.restrictedPence + r.restrictedPence,
        designatedPence: acc.designatedPence + r.designatedPence,
        totalPence: acc.totalPence + r.totalPence,
      }),
      { unrestrictedPence: 0, restrictedPence: 0, designatedPence: 0, totalPence: 0 },
    );
  }

  const incomeTotals = sumTotals(incomeRows);
  const expenditureTotals = sumTotals(expenditureRows);
  const netTotals = {
    unrestrictedPence: incomeTotals.unrestrictedPence - expenditureTotals.unrestrictedPence,
    restrictedPence: incomeTotals.restrictedPence - expenditureTotals.restrictedPence,
    designatedPence: incomeTotals.designatedPence - expenditureTotals.designatedPence,
    totalPence: incomeTotals.totalPence - expenditureTotals.totalPence,
  };

  return {
    data: { year, incomeRows, expenditureRows, incomeTotals, expenditureTotals, netTotals },
    error: null,
  };
}

/* ================================================================== */
/*  Supplier Spend                                                     */
/* ================================================================== */

export async function getSupplierSpendReport(params: {
  year: number;
}): Promise<{ data: SSupplierSpendReport | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const { year } = params;
  const supabase = await createClient();

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // 1. Fetch posted journals for the year
  const { data: journals } = await supabase
    .from('journals')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('status', 'posted')
    .gte('journal_date', startDate)
    .lte('journal_date', endDate);

  if (!journals || journals.length === 0) {
    return { data: { year, rows: [], grandTotalPence: 0 }, error: null };
  }

  const journalIds = journals.map((j) => j.id);

  // 2. Fetch journal lines where supplier_id is not null
  const { data: lines } = await supabase
    .from('journal_lines')
    .select('supplier_id, debit_pence, credit_pence')
    .eq('organisation_id', orgId)
    .in('journal_id', journalIds)
    .not('supplier_id', 'is', null);

  // 3. Aggregate by supplier
  const spendMap = new Map<string, { total: number; count: number }>();
  for (const l of lines ?? []) {
    const supplierId = l.supplier_id!;
    const existing = spendMap.get(supplierId) ?? { total: 0, count: 0 };
    // For expense lines, debit is the spend
    existing.total += Number(l.debit_pence);
    existing.count += 1;
    spendMap.set(supplierId, existing);
  }

  // 4. Fetch supplier names
  const supplierIds = [...spendMap.keys()];
  if (supplierIds.length === 0) {
    return { data: { year, rows: [], grandTotalPence: 0 }, error: null };
  }

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name')
    .in('id', supplierIds);

  const nameMap = new Map<string, string>();
  for (const s of suppliers ?? []) {
    nameMap.set(s.id, s.name);
  }

  // 5. Build rows
  const rows: SSupplierSpendRow[] = supplierIds
    .map((id) => {
      const s = spendMap.get(id)!;
      return {
        supplierId: id,
        supplierName: nameMap.get(id) ?? 'Unknown',
        totalPence: s.total,
        transactionCount: s.count,
      };
    })
    .sort((a, b) => b.totalPence - a.totalPence);

  const grandTotal = rows.reduce((sum, r) => sum + r.totalPence, 0);

  return {
    data: { year, rows, grandTotalPence: grandTotal },
    error: null,
  };
}

/* ================================================================== */
/*  Cash Position                                                      */
/* ================================================================== */

export async function getCashPositionReport(): Promise<{
  data: SCashPositionReport | null;
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const asOfDate = new Date().toISOString().slice(0, 10);

  // 1. Fetch all active bank accounts with linked GL accounts
  const { data: bankAccounts } = await supabase
    .from('bank_accounts')
    .select('id, name, linked_account_id')
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .order('name');

  if (!bankAccounts || bankAccounts.length === 0) {
    return {
      data: { asOfDate, rows: [], totalStatementPence: 0, totalGLPence: 0, totalDifferencePence: 0 },
      error: null,
    };
  }

  // 2. For each bank account, get latest statement balance
  const baIds = bankAccounts.map((ba) => ba.id);
  const { data: allLines } = await supabase
    .from('bank_lines')
    .select('bank_account_id, balance_pence, txn_date')
    .in('bank_account_id', baIds)
    .not('balance_pence', 'is', null)
    .order('txn_date', { ascending: false });

  // Latest balance per bank account
  const latestBalanceMap = new Map<string, number>();
  for (const l of allLines ?? []) {
    if (!latestBalanceMap.has(l.bank_account_id)) {
      latestBalanceMap.set(l.bank_account_id, Number(l.balance_pence));
    }
  }

  // 3. For bank accounts with linked GL accounts, compute GL balance
  const linkedAccountIds = bankAccounts
    .filter((ba) => ba.linked_account_id)
    .map((ba) => ba.linked_account_id!);

  let glBalanceMap = new Map<string, number>(); // linked_account_id -> balance

  if (linkedAccountIds.length > 0) {
    const { data: postedJournals } = await supabase
      .from('journals')
      .select('id')
      .eq('organisation_id', orgId)
      .eq('status', 'posted');

    if (postedJournals && postedJournals.length > 0) {
      const journalIds = postedJournals.map((j) => j.id);

      const { data: jLines } = await supabase
        .from('journal_lines')
        .select('account_id, debit_pence, credit_pence')
        .in('account_id', linkedAccountIds)
        .in('journal_id', journalIds);

      for (const jl of jLines ?? []) {
        const current = glBalanceMap.get(jl.account_id) ?? 0;
        glBalanceMap.set(jl.account_id, current + Number(jl.debit_pence) - Number(jl.credit_pence));
      }
    }
  }

  // 4. Build rows
  const rows: SCashPositionRow[] = bankAccounts.map((ba) => {
    const stmtBal = latestBalanceMap.get(ba.id) ?? null;
    const glBal = ba.linked_account_id ? (glBalanceMap.get(ba.linked_account_id) ?? 0) : 0;
    const diff = stmtBal !== null ? stmtBal - glBal : 0;

    return {
      bankAccountId: ba.id,
      bankAccountName: ba.name,
      bankStatementBalancePence: stmtBal,
      glBalancePence: glBal,
      differencePence: diff,
    };
  });

  const totalStatement = rows.reduce((sum, r) => sum + (r.bankStatementBalancePence ?? 0), 0);
  const totalGL = rows.reduce((sum, r) => sum + r.glBalancePence, 0);
  const totalDiff = rows.reduce((sum, r) => sum + r.differencePence, 0);

  return {
    data: {
      asOfDate,
      rows,
      totalStatementPence: totalStatement,
      totalGLPence: totalGL,
      totalDifferencePence: totalDiff,
    },
    error: null,
  };
}
