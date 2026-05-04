import type { SFMReport, SGiftAidSummaryReport } from '@/lib/reports/types';
import type { AnnualAccountsNote } from './types';

export function buildAnnualAccountsNotes(params: {
  fundMovements?: SFMReport | null;
  giftAid?: SGiftAidSummaryReport | null;
  payrollRunCount: number;
  payrollSummary?: {
    grossPayPence: number;
    employerNicPence: number;
    employerPensionPence: number;
    totalEmployerCostPence: number;
  };
  hasPriorYearData: boolean;
}): AnnualAccountsNote[] {
  const { fundMovements, giftAid, payrollRunCount, payrollSummary, hasPriorYearData } = params;
  const restrictedFunds = fundMovements?.funds.filter((fund) => fund.fundType === 'restricted') ?? [];

  const notes: AnnualAccountsNote[] = [
    {
      id: 'accounting-policies',
      title: 'Accounting policies',
      category: 'accounting-policy',
      required: true,
      recommended: true,
      text: 'The accounts have been prepared in accordance with applicable charity accounting guidance and the selected accounting basis.',
      sourceRefs: ['builder'],
    },
    {
      id: 'income-breakdown',
      title: 'Income breakdown',
      category: 'income',
      required: true,
      recommended: true,
      text: 'Income is analysed between unrestricted, restricted and designated funds in the SOFA.',
      sourceRefs: ['sofa'],
    },
    {
      id: 'expenditure-breakdown',
      title: 'Expenditure breakdown',
      category: 'expenditure',
      required: true,
      recommended: true,
      text: 'Expenditure is analysed by ledger category and fund in the SOFA.',
      sourceRefs: ['sofa'],
    },
    {
      id: 'fund-movements',
      title: 'Fund movements',
      category: 'funds',
      required: true,
      recommended: true,
      text: 'Opening balances, income, expenditure and closing balances are reconciled through the fund movement schedule.',
      amountPence: fundMovements?.totals.closingBalancePence ?? 0,
      sourceRefs: ['fund_movements'],
    },
    {
      id: 'restricted-fund-purposes',
      title: 'Restricted fund purposes',
      category: 'funds',
      required: restrictedFunds.length > 0,
      recommended: true,
      text:
        restrictedFunds.length > 0
          ? restrictedFunds.map((fund) => `${fund.fundName}: purpose to be confirmed by trustees.`).join('\n')
          : 'No restricted funds were identified for this period.',
      missingReason: restrictedFunds.length > 0 ? 'Trustees must confirm each restricted fund purpose.' : undefined,
      sourceRefs: ['funds'],
    },
    {
      id: 'debtors',
      title: 'Debtors',
      category: 'assets',
      required: false,
      recommended: true,
      text: 'Debtors should be reviewed and updated where year-end receivables exist.',
      sourceRefs: ['balance_sheet'],
    },
    {
      id: 'creditors',
      title: 'Creditors',
      category: 'liabilities',
      required: false,
      recommended: true,
      text: 'Creditors should be reviewed and updated where year-end liabilities exist.',
      sourceRefs: ['balance_sheet', 'bills'],
    },
    {
      id: 'payroll-staff-costs',
      title: 'Payroll and staff costs',
      category: 'payroll',
      required: payrollRunCount > 0,
      recommended: payrollRunCount > 0,
      text:
        payrollRunCount > 0
          ? `Payroll activity was identified across ${payrollRunCount} run(s). Staff costs total £${((payrollSummary?.totalEmployerCostPence ?? 0) / 100).toFixed(2)} including gross pay, employer NIC, and employer pension.`
          : 'No payroll runs were identified for this period.',
      amountPence: payrollSummary?.totalEmployerCostPence,
      sourceRefs: ['payroll_runs'],
    },
    {
      id: 'trustee-remuneration-expenses',
      title: 'Trustee remuneration and expenses',
      category: 'trustees',
      required: true,
      recommended: true,
      text: 'Trustees should confirm whether any remuneration, benefits or expenses were paid.',
      missingReason: 'Trustee confirmation required.',
      sourceRefs: ['trustees'],
    },
    {
      id: 'related-party-transactions',
      title: 'Related party transactions',
      category: 'related-parties',
      required: true,
      recommended: true,
      text: 'Trustees should confirm whether related party transactions occurred.',
      missingReason: 'Trustee confirmation required.',
      sourceRefs: ['trustees'],
    },
    {
      id: 'fixed-assets',
      title: 'Fixed assets',
      category: 'assets',
      required: false,
      recommended: true,
      text: 'Fixed assets should be disclosed where capitalised assets exist.',
      sourceRefs: ['balance_sheet'],
    },
    {
      id: 'loans-liabilities',
      title: 'Loans and liabilities',
      category: 'liabilities',
      required: false,
      recommended: true,
      text: 'Loans and liabilities should be split between amounts due within and after one year where applicable.',
      sourceRefs: ['balance_sheet'],
    },
    {
      id: 'reserves-policy',
      title: 'Reserves policy',
      category: 'reserves',
      required: true,
      recommended: true,
      text: 'The trustees should explain the charity reserves policy and the level of free reserves held.',
      missingReason: 'Trustee narrative required.',
      sourceRefs: ['narrative'],
    },
    {
      id: 'comparatives',
      title: 'Comparative prior-year notes',
      category: 'comparatives',
      required: !hasPriorYearData,
      recommended: true,
      text: hasPriorYearData
        ? 'Prior-year comparatives are included in the financial statements.'
        : 'Prior-year comparatives were not available. Trustees should add an explanation.',
      missingReason: hasPriorYearData ? undefined : 'Comparative explanation required.',
      sourceRefs: ['prior_year'],
    },
  ];

  if ((giftAid?.dashboard.eligibleDonationsCount ?? 0) > 0 || (giftAid?.dashboard.recentBatchCount ?? 0) > 0) {
    notes.push({
      id: 'gift-aid',
      title: 'Gift Aid',
      category: 'income',
      required: true,
      recommended: true,
      text: 'Gift Aid claims and eligible donations have been identified and should be disclosed or cross-referenced.',
      amountPence: giftAid?.dashboard.claimedAmountPence ?? 0,
      sourceRefs: ['gift_aid'],
    });
  }

  return notes;
}
