'use server';

import { getActiveOrg } from '@/lib/org';
import { getTrialBalance, getSOFAReport, getSupplierSpendReport, getCashPositionReport } from '@/lib/reports/glReports';
import { getIncomeExpenditureReport, getBalanceSheetReport, getFundMovementsReport, getCashFlowReport } from '@/lib/reports/actions';
import { buildCsv, penceToPoundsStr, type CsvColumn } from './csvExport';

/* ================================================================== */
/*  CSV Export actions                                                  */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  Trial Balance CSV                                                   */
/* ------------------------------------------------------------------ */

export async function exportTrialBalanceCsv(params: {
  asOfDate: string;
  fundId?: string | null;
}): Promise<{ data: string | null; error: string | null }> {
  await getActiveOrg();
  const { data: report, error } = await getTrialBalance(params);
  if (error || !report) return { data: null, error: error ?? 'No data.' };

  type Row = (typeof report.rows)[number];
  const columns: CsvColumn<Row>[] = [
    { header: 'Account Code', accessor: (r) => r.accountCode },
    { header: 'Account Name', accessor: (r) => r.accountName },
    { header: 'Type', accessor: (r) => r.accountType },
    { header: 'Debit (£)', accessor: (r) => penceToPoundsStr(r.debitPence) },
    { header: 'Credit (£)', accessor: (r) => penceToPoundsStr(r.creditPence) },
    { header: 'Net Balance (£)', accessor: (r) => penceToPoundsStr(r.netBalancePence) },
  ];

  return { data: buildCsv(report.rows, columns), error: null };
}

/* ------------------------------------------------------------------ */
/*  I&E CSV                                                             */
/* ------------------------------------------------------------------ */

export async function exportIncomeExpenditureCsv(params: {
  year: number;
  month?: number;
  fundId?: string | null;
}): Promise<{ data: string | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const { data: report, error } = await getIncomeExpenditureReport({
    organisationId: orgId,
    ...params,
  });
  if (error || !report) return { data: null, error: error ?? 'No data.' };

  type Row = { accountCode: string; accountName: string; category: string; monthlyActual: number; ytdActual: number };
  const rows: Row[] = [];
  for (const cat of report.categories) {
    for (const r of cat.rows) {
      rows.push({
        accountCode: r.accountCode,
        accountName: r.accountName,
        category: cat.categoryName,
        monthlyActual: r.monthlyActual,
        ytdActual: r.ytdActual,
      });
    }
  }

  const columns: CsvColumn<Row>[] = [
    { header: 'Category', accessor: (r) => r.category },
    { header: 'Account Code', accessor: (r) => r.accountCode },
    { header: 'Account Name', accessor: (r) => r.accountName },
    { header: 'Monthly (£)', accessor: (r) => penceToPoundsStr(r.monthlyActual) },
    { header: 'YTD (£)', accessor: (r) => penceToPoundsStr(r.ytdActual) },
  ];

  return { data: buildCsv(rows, columns), error: null };
}

/* ------------------------------------------------------------------ */
/*  Balance Sheet CSV                                                   */
/* ------------------------------------------------------------------ */

export async function exportBalanceSheetCsv(params: {
  asOfDate: string;
  fundId?: string | null;
}): Promise<{ data: string | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const { data: report, error } = await getBalanceSheetReport({
    organisationId: orgId,
    ...params,
  });
  if (error || !report) return { data: null, error: error ?? 'No data.' };

  type Row = { section: string; accountCode: string; accountName: string; balance: number };
  const rows: Row[] = [];
  for (const r of report.sections.assets.rows) rows.push({ section: 'Assets', accountCode: r.accountCode, accountName: r.accountName, balance: r.balance });
  for (const r of report.sections.liabilities.rows) rows.push({ section: 'Liabilities', accountCode: r.accountCode, accountName: r.accountName, balance: r.balance });
  for (const r of report.sections.equity.rows) rows.push({ section: 'Equity', accountCode: r.accountCode, accountName: r.accountName, balance: r.balance });

  const columns: CsvColumn<Row>[] = [
    { header: 'Section', accessor: (r) => r.section },
    { header: 'Account Code', accessor: (r) => r.accountCode },
    { header: 'Account Name', accessor: (r) => r.accountName },
    { header: 'Balance (£)', accessor: (r) => penceToPoundsStr(r.balance) },
  ];

  return { data: buildCsv(rows, columns), error: null };
}

/* ------------------------------------------------------------------ */
/*  SOFA CSV                                                            */
/* ------------------------------------------------------------------ */

export async function exportSOFACsv(params: {
  year: number;
}): Promise<{ data: string | null; error: string | null }> {
  await getActiveOrg();
  const { data: report, error } = await getSOFAReport(params);
  if (error || !report) return { data: null, error: error ?? 'No data.' };

  type Row = { section: string; accountCode: string; accountName: string; unrestricted: number; restricted: number; designated: number; total: number };
  const rows: Row[] = [];
  for (const r of report.incomeRows) rows.push({ section: 'Income', accountCode: r.accountCode, accountName: r.accountName, unrestricted: r.unrestrictedPence, restricted: r.restrictedPence, designated: r.designatedPence, total: r.totalPence });
  for (const r of report.expenditureRows) rows.push({ section: 'Expenditure', accountCode: r.accountCode, accountName: r.accountName, unrestricted: r.unrestrictedPence, restricted: r.restrictedPence, designated: r.designatedPence, total: r.totalPence });

  const columns: CsvColumn<Row>[] = [
    { header: 'Section', accessor: (r) => r.section },
    { header: 'Account Code', accessor: (r) => r.accountCode },
    { header: 'Account Name', accessor: (r) => r.accountName },
    { header: 'Unrestricted (£)', accessor: (r) => penceToPoundsStr(r.unrestricted) },
    { header: 'Restricted (£)', accessor: (r) => penceToPoundsStr(r.restricted) },
    { header: 'Designated (£)', accessor: (r) => penceToPoundsStr(r.designated) },
    { header: 'Total (£)', accessor: (r) => penceToPoundsStr(r.total) },
  ];

  return { data: buildCsv(rows, columns), error: null };
}

/* ------------------------------------------------------------------ */
/*  Fund Movements CSV                                                  */
/* ------------------------------------------------------------------ */

export async function exportFundMovementsCsv(params: {
  year: number;
  month?: number;
}): Promise<{ data: string | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const { data: report, error } = await getFundMovementsReport({
    organisationId: orgId,
    ...params,
    mode: params.month ? 'MONTH' : 'YTD',
  });
  if (error || !report) return { data: null, error: error ?? 'No data.' };

  type Row = (typeof report.funds)[number];
  const columns: CsvColumn<Row>[] = [
    { header: 'Fund', accessor: (r) => r.fundName },
    { header: 'Type', accessor: (r) => r.fundType },
    { header: 'Opening Balance (£)', accessor: (r) => penceToPoundsStr(r.openingBalancePence) },
    { header: 'Income (£)', accessor: (r) => penceToPoundsStr(r.incomePence) },
    { header: 'Expenditure (£)', accessor: (r) => penceToPoundsStr(r.expenditurePence) },
    { header: 'Net Movement (£)', accessor: (r) => penceToPoundsStr(r.netMovementPence) },
    { header: 'Closing Balance (£)', accessor: (r) => penceToPoundsStr(r.closingBalancePence) },
  ];

  return { data: buildCsv(report.funds, columns), error: null };
}

/* ------------------------------------------------------------------ */
/*  Supplier Spend CSV                                                  */
/* ------------------------------------------------------------------ */

export async function exportSupplierSpendCsv(params: {
  year: number;
}): Promise<{ data: string | null; error: string | null }> {
  await getActiveOrg();
  const { data: report, error } = await getSupplierSpendReport(params);
  if (error || !report) return { data: null, error: error ?? 'No data.' };

  type Row = (typeof report.rows)[number];
  const columns: CsvColumn<Row>[] = [
    { header: 'Supplier', accessor: (r) => r.supplierName },
    { header: 'Transactions', accessor: (r) => r.transactionCount },
    { header: 'Total Spend (£)', accessor: (r) => penceToPoundsStr(r.totalPence) },
  ];

  return { data: buildCsv(report.rows, columns), error: null };
}

/* ------------------------------------------------------------------ */
/*  Cash Position CSV                                                   */
/* ------------------------------------------------------------------ */

export async function exportCashPositionCsv(): Promise<{ data: string | null; error: string | null }> {
  await getActiveOrg();
  const { data: report, error } = await getCashPositionReport();
  if (error || !report) return { data: null, error: error ?? 'No data.' };

  type Row = (typeof report.rows)[number];
  const columns: CsvColumn<Row>[] = [
    { header: 'Bank Account', accessor: (r) => r.bankAccountName },
    { header: 'Statement Balance (£)', accessor: (r) => r.bankStatementBalancePence !== null ? penceToPoundsStr(r.bankStatementBalancePence) : 'N/A' },
    { header: 'GL Balance (£)', accessor: (r) => penceToPoundsStr(r.glBalancePence) },
    { header: 'Difference (£)', accessor: (r) => penceToPoundsStr(r.differencePence) },
  ];

  return { data: buildCsv(report.rows, columns), error: null };
}

/* ------------------------------------------------------------------ */
/*  Cash Flow CSV                                                       */
/* ------------------------------------------------------------------ */

export async function exportCashFlowCsv(params: {
  year: number;
  month?: number;
}): Promise<{ data: string | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const { data: report, error } = await getCashFlowReport({
    organisationId: orgId,
    ...params,
  });
  if (error || !report) return { data: null, error: error ?? 'No data.' };

  type Row = { item: string; amount: string };
  const rows: Row[] = [];

  rows.push({ item: 'Opening Cash Balance', amount: penceToPoundsStr(report.openingBalancePence) });

  for (const section of report.sections) {
    rows.push({ item: `--- ${section.label} ---`, amount: '' });
    for (const line of section.items) {
      rows.push({ item: `  ${line.label}`, amount: penceToPoundsStr(line.amountPence) });
    }
    rows.push({ item: `Net ${section.label}`, amount: penceToPoundsStr(section.totalPence) });
  }

  rows.push({ item: 'Net Increase / (Decrease) in Cash', amount: penceToPoundsStr(report.netChangePence) });
  rows.push({ item: 'Closing Cash Balance', amount: penceToPoundsStr(report.closingBalancePence) });

  const columns: CsvColumn<Row>[] = [
    { header: 'Item', accessor: (r) => r.item },
    { header: 'Amount (£)', accessor: (r) => r.amount },
  ];

  return { data: buildCsv(rows, columns), error: null };
}

/* ================================================================== */
/*  Trustee Export Pack — combines all key reports                      */
/* ================================================================== */

export interface TrusteePackReport {
  name: string;
  csv: string;
}

export async function generateTrusteeExportPack(params: {
  year: number;
  asOfDate: string;
}): Promise<{ data: TrusteePackReport[]; error: string | null }> {
  const { year, asOfDate } = params;
  await getActiveOrg();

  const results: TrusteePackReport[] = [];

  // Generate all reports in parallel
  const [tbRes, ieRes, bsRes, sofaRes, fmRes, ssRes, cpRes, cfRes] = await Promise.all([
    exportTrialBalanceCsv({ asOfDate }),
    exportIncomeExpenditureCsv({ year }),
    exportBalanceSheetCsv({ asOfDate }),
    exportSOFACsv({ year }),
    exportFundMovementsCsv({ year }),
    exportSupplierSpendCsv({ year }),
    exportCashPositionCsv(),
    exportCashFlowCsv({ year }),
  ]);

  if (tbRes.data) results.push({ name: `trial-balance-${asOfDate}.csv`, csv: tbRes.data });
  if (ieRes.data) results.push({ name: `income-expenditure-${year}.csv`, csv: ieRes.data });
  if (bsRes.data) results.push({ name: `balance-sheet-${asOfDate}.csv`, csv: bsRes.data });
  if (sofaRes.data) results.push({ name: `sofa-${year}.csv`, csv: sofaRes.data });
  if (fmRes.data) results.push({ name: `fund-movements-${year}.csv`, csv: fmRes.data });
  if (ssRes.data) results.push({ name: `supplier-spend-${year}.csv`, csv: ssRes.data });
  if (cpRes.data) results.push({ name: `cash-position-${asOfDate}.csv`, csv: cpRes.data });
  if (cfRes.data) results.push({ name: `cash-flow-${year}.csv`, csv: cfRes.data });

  return { data: results, error: null };
}
