import type { SBSAccountRow, SBSReport, SFMReport } from '@/lib/reports/types';
import type { AnnualAccountsBalanceSheetRow, AnnualAccountsValidationResult } from './types';

function classifyAsset(row: SBSAccountRow): AnnualAccountsBalanceSheetRow['section'] {
  const name = row.accountName.toLowerCase();
  if (name.includes('fixed') || name.includes('property') || name.includes('equipment')) return 'fixed-assets';
  if (name.includes('debtor') || name.includes('receivable')) return 'debtors';
  if (name.includes('cash') || name.includes('bank')) return 'cash';
  return 'current-assets';
}

function classifyLiability(row: SBSAccountRow): AnnualAccountsBalanceSheetRow['section'] {
  const name = row.accountName.toLowerCase();
  if (name.includes('loan') || name.includes('long')) return 'creditors-long-term';
  return 'creditors-current';
}

function priorBalance(priorYearBalanceSheet: SBSReport | null | undefined, accountName: string) {
  const priorRows = [
    ...(priorYearBalanceSheet?.sections.assets.rows ?? []),
    ...(priorYearBalanceSheet?.sections.liabilities.rows ?? []),
    ...(priorYearBalanceSheet?.sections.equity.rows ?? []),
  ];
  return priorRows.find((row) => row.accountName === accountName)?.balance ?? 0;
}

export function buildAnnualAccountsBalanceSheet(params: {
  balanceSheet: SBSReport | null;
  priorYearBalanceSheet?: SBSReport | null;
  fundMovements?: SFMReport | null;
}): AnnualAccountsBalanceSheetRow[] {
  const { balanceSheet, priorYearBalanceSheet, fundMovements } = params;
  if (!balanceSheet) return [];

  const rows: AnnualAccountsBalanceSheetRow[] = [
    ...balanceSheet.sections.assets.rows.map((row) => ({
      id: `asset-${row.accountId}`,
      label: row.accountName,
      section: classifyAsset(row),
      currentYearPence: row.balance,
      priorYearPence: priorBalance(priorYearBalanceSheet, row.accountName),
    })),
    ...balanceSheet.sections.liabilities.rows.map((row) => ({
      id: `liability-${row.accountId}`,
      label: row.accountName,
      section: classifyLiability(row),
      currentYearPence: row.balance,
      priorYearPence: priorBalance(priorYearBalanceSheet, row.accountName),
    })),
    {
      id: 'net-assets',
      label: 'Net assets',
      section: 'net-assets',
      currentYearPence: balanceSheet.netAssets,
      priorYearPence: priorYearBalanceSheet?.netAssets ?? 0,
    },
  ];

  if (fundMovements) {
    const restricted = fundMovements.funds
      .filter((fund) => fund.fundType === 'restricted')
      .reduce((sum, fund) => sum + fund.closingBalancePence, 0);
    const designated = fundMovements.funds
      .filter((fund) => fund.fundType === 'designated')
      .reduce((sum, fund) => sum + fund.closingBalancePence, 0);
    const unrestricted = fundMovements.totals.closingBalancePence - restricted - designated;

    rows.push(
      { id: 'funds-unrestricted', label: 'Unrestricted funds', section: 'funds', currentYearPence: unrestricted, priorYearPence: 0 },
      { id: 'funds-restricted', label: 'Restricted funds', section: 'funds', currentYearPence: restricted, priorYearPence: 0 },
      { id: 'funds-designated', label: 'Designated funds', section: 'funds', currentYearPence: designated, priorYearPence: 0 },
      {
        id: 'total-charity-funds',
        label: 'Total charity funds',
        section: 'funds',
        currentYearPence: fundMovements.totals.closingBalancePence,
        priorYearPence: 0,
      },
    );
  } else {
    rows.push({
      id: 'total-charity-funds',
      label: 'Total charity funds',
      section: 'funds',
      currentYearPence: balanceSheet.netAssets,
      priorYearPence: priorYearBalanceSheet?.netAssets ?? 0,
    });
  }

  return rows;
}

export function validateAnnualAccountsBalanceSheet(params: {
  balanceSheet: SBSReport | null;
  rows: AnnualAccountsBalanceSheetRow[];
  trialBalanceIsBalanced: boolean;
  bankDifferencePence: number;
}): AnnualAccountsValidationResult[] {
  const { balanceSheet, rows, trialBalanceIsBalanced, bankDifferencePence } = params;
  const netAssets = rows.find((row) => row.id === 'net-assets')?.currentYearPence ?? 0;
  const totalFunds = rows.find((row) => row.id === 'total-charity-funds')?.currentYearPence ?? netAssets;
  const difference = netAssets - totalFunds;

  return [
    {
      id: 'balance-sheet-balances',
      severity: balanceSheet?.check.balances && difference === 0 ? 'info' : 'blocker',
      title: 'Balance sheet balances',
      message: difference === 0 ? 'Net assets agree to total charity funds.' : `Net assets differ from total funds by ${difference} pence.`,
      status: balanceSheet?.check.balances && difference === 0 ? 'passed' : 'failed',
      source: 'balance_sheet',
    },
    {
      id: 'trial-balance-agrees',
      severity: trialBalanceIsBalanced ? 'info' : 'blocker',
      title: 'Trial balance agrees',
      message: trialBalanceIsBalanced ? 'Trial balance is balanced.' : 'Trial balance must balance before annual accounts can be finalised.',
      status: trialBalanceIsBalanced ? 'passed' : 'failed',
      source: 'trial_balance',
    },
    {
      id: 'bank-cash-agrees',
      severity: bankDifferencePence === 0 ? 'info' : 'warning',
      title: 'Bank and cash agree to bank module',
      message: bankDifferencePence === 0 ? 'Bank module agrees to ledger cash.' : `Bank module differs by ${bankDifferencePence} pence.`,
      status: bankDifferencePence === 0 ? 'passed' : 'needs_review',
      source: 'bank_reconciliation',
    },
  ];
}
