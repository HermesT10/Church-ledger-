import type {
  BvaReportData,
  SBSReport,
  SCashPositionReport,
  SFMReport,
  SIEReport,
  STrusteeSnapshot,
} from './types';
import type { ReportInsight } from './framework';
import { formatCurrencyFromPence, formatPercent, toneFromRisk } from './framework';

export function buildIncomeStatementInsights(report: SIEReport): ReportInsight[] {
  const monthlyNet = report.totals.monthlyActual;
  const ytdNet = report.totals.ytdActual;

  return [
    {
      title: monthlyNet >= 0 ? 'Month closed with a surplus' : 'Month closed with a deficit',
      body: `This month finished at ${formatCurrencyFromPence(monthlyNet)}. Finance users can drill into each account row to trace the movement to posted journals.`,
      tone: toneFromRisk(monthlyNet >= 0),
    },
    {
      title: ytdNet >= 0 ? 'Year to date remains ahead' : 'Year to date needs attention',
      body: `Year-to-date net position is ${formatCurrencyFromPence(ytdNet)}. Use this together with Budget vs Actual to distinguish timing differences from recurring overspend.`,
      tone: toneFromRisk(ytdNet >= 0, true),
    },
  ];
}

export function buildBalanceSheetInsights(report: SBSReport): ReportInsight[] {
  return [
    {
      title: report.check.balances ? 'Accounting equation reconciles' : 'Accounting equation is out of balance',
      body: report.check.balances
        ? 'Assets equal liabilities plus equity for the selected scope.'
        : `The report is off by ${formatCurrencyFromPence(report.check.difference)} and should be investigated before sharing externally.`,
      tone: toneFromRisk(report.check.balances, true),
    },
    {
      title: 'Net assets snapshot',
      body: `Net assets at the reporting date are ${formatCurrencyFromPence(report.netAssets)}. Compare this with fund balances and cash position to understand liquidity versus restricted reserves.`,
      tone: 'neutral',
    },
  ];
}

export function buildBudgetInsights(
  data: BvaReportData,
  period: 'YTD' | 'MTD',
  monthKey?: string,
): ReportInsight[] {
  const totals = period === 'MTD' && monthKey ? data.totals.months[monthKey] : data.totals.ytd;
  const adverseRows = data.rows.filter((row) => {
    const cell = period === 'MTD' && monthKey ? row.months[monthKey] : row.ytd;
    if (row.accountType === 'expense') {
      return cell.variance > 0;
    }
    if (row.accountType === 'income') {
      return cell.variance < 0;
    }
    return false;
  });

  return [
    {
      title: totals.variance === 0 ? 'Budget is on plan' : 'Budget variance needs review',
      body: `${period} variance is ${formatCurrencyFromPence(totals.variance)} against a budget of ${formatCurrencyFromPence(totals.budget)}. ${adverseRows.length} account${adverseRows.length === 1 ? '' : 's'} currently show an adverse variance.`,
      tone: toneFromRisk(totals.variance <= 0),
    },
    {
      title: 'Variance percentages are directional',
      body: `A negative variance on income means income is behind plan, while a positive variance on expenses means spending is ahead of plan. Overall variance percentage is ${formatPercent(totals.variancePct, { signed: true })}.`,
      tone: 'neutral',
    },
  ];
}

export function buildFundInsights(report: SFMReport): ReportInsight[] {
  const overspentRestricted = report.funds.filter(
    (fund) => fund.fundType === 'restricted' && fund.closingBalancePence < 0,
  );

  return [
    {
      title: overspentRestricted.length === 0 ? 'Restricted funds remain covered' : 'Restricted funds need action',
      body:
        overspentRestricted.length === 0
          ? 'No restricted funds in this scope have closed below zero.'
          : `${overspentRestricted.length} restricted fund${overspentRestricted.length === 1 ? '' : 's'} closed below zero. Trustees should review whether the spend was authorised or should be reallocated.`,
      tone: toneFromRisk(overspentRestricted.length === 0, true),
    },
    {
      title: 'Fund movements explain balance changes',
      body: `Closing balances reconcile from opening balance plus income less expenditure. Use the drill-down on a fund row to inspect the journals behind the movement.`,
      tone: 'neutral',
    },
  ];
}

export function buildCashPositionInsights(report: SCashPositionReport): ReportInsight[] {
  const mismatches = report.rows.filter((row) => row.differencePence !== 0);

  return [
    {
      title: mismatches.length === 0 ? 'Cash balances reconcile' : 'Cash differences are outstanding',
      body:
        mismatches.length === 0
          ? 'All visible bank accounts agree between the latest statement balance and the general ledger.'
          : `${mismatches.length} bank account${mismatches.length === 1 ? '' : 's'} show a difference. Open reconciliation before relying on the closing cash balance for board reporting.`,
      tone: toneFromRisk(mismatches.length === 0, true),
    },
    {
      title: 'Statement balances should not replace ledger review',
      body: `Total statement cash is ${formatCurrencyFromPence(report.totalStatementPence)} versus ledger cash of ${formatCurrencyFromPence(report.totalGLPence)}.`,
      tone: 'neutral',
    },
  ];
}

export function buildLeadershipInsights(snapshot: STrusteeSnapshot): ReportInsight[] {
  const riskFlags: string[] = [];

  if (snapshot.funds.restrictedTotal < 0) {
    riskFlags.push('restricted funds are negative');
  }
  if (snapshot.incomeExpenditure.ytd.surplus < 0) {
    riskFlags.push('year-to-date operations are in deficit');
  }
  if (snapshot.forecast.riskLevel === 'AT_RISK') {
    riskFlags.push('forecast is marked at risk');
  }

  return [
    {
      title: riskFlags.length === 0 ? 'No immediate trustee risk flags' : 'Trustee attention required',
      body:
        riskFlags.length === 0
          ? 'Cash, fund balances, and forecast indicators do not currently show an obvious red flag.'
          : `Current leadership risks: ${riskFlags.join('; ')}.`,
      tone: toneFromRisk(riskFlags.length === 0, true),
    },
    {
      title: 'Snapshot is decision support, not a replacement for detail',
      body: `The snapshot highlights cash of ${formatCurrencyFromPence(snapshot.cash.total)} and a year-to-date result of ${formatCurrencyFromPence(snapshot.incomeExpenditure.ytd.surplus)}. Use drill-down reports for the underlying transactions.`,
      tone: 'neutral',
    },
  ];
}
