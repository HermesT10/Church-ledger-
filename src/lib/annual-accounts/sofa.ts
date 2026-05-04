import type { SFMReport, SSOFAReport } from '@/lib/reports/types';
import type { AnnualAccountsSOFARow } from './types';

function priorTotalByLabel(priorYearSOFA: SSOFAReport | null | undefined, label: string) {
  const row = [...(priorYearSOFA?.incomeRows ?? []), ...(priorYearSOFA?.expenditureRows ?? [])].find(
    (item) => item.accountName === label,
  );
  return row?.totalPence ?? 0;
}

function makeSummaryRow(
  id: string,
  label: string,
  section: AnnualAccountsSOFARow['section'],
  current: { unrestrictedPence: number; restrictedPence: number; designatedPence: number; totalPence: number },
  priorTotalPence: number,
): AnnualAccountsSOFARow {
  return {
    id,
    label,
    section,
    unrestrictedPence: current.unrestrictedPence,
    restrictedPence: current.restrictedPence,
    designatedPence: current.designatedPence,
    totalCurrentYearPence: current.totalPence,
    totalPriorYearPence: priorTotalPence,
  };
}

export function buildAnnualAccountsSOFA(params: {
  sofa: SSOFAReport | null;
  priorYearSOFA?: SSOFAReport | null;
  fundMovements?: SFMReport | null;
}): AnnualAccountsSOFARow[] {
  const { sofa, priorYearSOFA, fundMovements } = params;
  if (!sofa) {
    return [];
  }

  const incomeRows = sofa.incomeRows.map((row): AnnualAccountsSOFARow => ({
    id: `income-${row.accountId}`,
    label: row.accountName,
    section: 'income',
    unrestrictedPence: row.unrestrictedPence,
    restrictedPence: row.restrictedPence,
    designatedPence: row.designatedPence,
    totalCurrentYearPence: row.totalPence,
    totalPriorYearPence: priorTotalByLabel(priorYearSOFA, row.accountName),
  }));

  const expenditureRows = sofa.expenditureRows.map((row): AnnualAccountsSOFARow => ({
    id: `expenditure-${row.accountId}`,
    label: row.accountName,
    section: 'expenditure',
    unrestrictedPence: row.unrestrictedPence,
    restrictedPence: row.restrictedPence,
    designatedPence: row.designatedPence,
    totalCurrentYearPence: row.totalPence,
    totalPriorYearPence: priorTotalByLabel(priorYearSOFA, row.accountName),
  }));

  const totals = [
    makeSummaryRow('total-income', 'Total income and endowments', 'income', sofa.incomeTotals, priorYearSOFA?.incomeTotals.totalPence ?? 0),
    makeSummaryRow('total-expenditure', 'Total expenditure', 'expenditure', sofa.expenditureTotals, priorYearSOFA?.expenditureTotals.totalPence ?? 0),
    makeSummaryRow('net-income-expenditure', 'Net income / (expenditure)', 'fund-movement', sofa.netTotals, priorYearSOFA?.netTotals.totalPence ?? 0),
    makeSummaryRow('transfers-between-funds', 'Transfers between funds', 'fund-movement', {
      unrestrictedPence: 0,
      restrictedPence: 0,
      designatedPence: 0,
      totalPence: 0,
    }, 0),
  ];

  if (fundMovements) {
    totals.push(
      makeSummaryRow('opening-fund-balances', 'Fund balances brought forward', 'fund-movement', {
        unrestrictedPence: fundMovements.funds
          .filter((fund) => fund.fundType !== 'restricted' && fund.fundType !== 'designated')
          .reduce((sum, fund) => sum + fund.openingBalancePence, 0),
        restrictedPence: fundMovements.funds
          .filter((fund) => fund.fundType === 'restricted')
          .reduce((sum, fund) => sum + fund.openingBalancePence, 0),
        designatedPence: fundMovements.funds
          .filter((fund) => fund.fundType === 'designated')
          .reduce((sum, fund) => sum + fund.openingBalancePence, 0),
        totalPence: fundMovements.totals.openingBalancePence,
      }, 0),
      makeSummaryRow('closing-fund-balances', 'Fund balances carried forward', 'fund-movement', {
        unrestrictedPence: fundMovements.funds
          .filter((fund) => fund.fundType !== 'restricted' && fund.fundType !== 'designated')
          .reduce((sum, fund) => sum + fund.closingBalancePence, 0),
        restrictedPence: fundMovements.funds
          .filter((fund) => fund.fundType === 'restricted')
          .reduce((sum, fund) => sum + fund.closingBalancePence, 0),
        designatedPence: fundMovements.funds
          .filter((fund) => fund.fundType === 'designated')
          .reduce((sum, fund) => sum + fund.closingBalancePence, 0),
        totalPence: fundMovements.totals.closingBalancePence,
      }, 0),
    );
  }

  return [...incomeRows, ...expenditureRows, ...totals];
}
