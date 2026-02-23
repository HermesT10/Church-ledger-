/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A single journal line already enriched with account_type and journal_date. */
export interface FMRawLine {
  fund_id: string | null;
  account_type: string; // 'income' | 'expense'
  debit_pence: number;
  credit_pence: number;
  journal_date: string; // ISO date, e.g. '2026-03-15'
}

/** Minimal fund shape required by the report builder. */
export interface FMFundRef {
  id: string;
  name: string;
  type: string; // 'restricted' | 'unrestricted' | 'designated'
}

export interface FMFundRow {
  fundId: string; // or UNALLOCATED_FUND_ID
  fundName: string;
  fundType: string;
  openingBalancePence: bigint;
  incomePence: bigint;
  expenditurePence: bigint;
  netMovementPence: bigint; // income - expenditure
  closingBalancePence: bigint; // opening + netMovement
}

export interface FMReport {
  period: { year: number; month?: number; startDate: string; endDate: string };
  funds: FMFundRow[];
  totals: Omit<FMFundRow, 'fundId' | 'fundName' | 'fundType'>;
}

export const UNALLOCATED_FUND_ID = '__unallocated__';

/* ------------------------------------------------------------------ */
/*  buildFundMovementsReport                                           */
/* ------------------------------------------------------------------ */

/**
 * Build a Fund Balances & Movements report.
 *
 * @param funds      All funds in scope, sorted by name.
 * @param lines      All posted income/expense journal lines for the org
 *                   from the beginning of time up to `endDate`.
 * @param startDate  Period start (ISO date, inclusive).
 * @param endDate    Period end (ISO date, inclusive).
 * @param year       Fiscal year for the report header.
 * @param month      Optional month (1..12) for the report header.
 */
export function buildFundMovementsReport(params: {
  funds: FMFundRef[];
  lines: FMRawLine[];
  startDate: string;
  endDate: string;
  year: number;
  month?: number;
}): FMReport {
  const { funds, lines, startDate, endDate, year, month } = params;

  // Accumulators keyed by fundId
  const opening: Record<string, bigint> = {};
  const income: Record<string, bigint> = {};
  const expenditure: Record<string, bigint> = {};

  // Track whether we see any unallocated lines
  let hasUnallocated = false;

  for (const line of lines) {
    const fid = line.fund_id ?? UNALLOCATED_FUND_ID;
    if (fid === UNALLOCATED_FUND_ID) hasUnallocated = true;

    // Compute net pence based on account type
    let netPence: bigint;
    if (line.account_type === 'income') {
      netPence = BigInt(line.credit_pence) - BigInt(line.debit_pence);
    } else {
      // expense: positive means money spent
      netPence = BigInt(line.debit_pence) - BigInt(line.credit_pence);
    }

    const isBeforePeriod = line.journal_date < startDate;
    const isWithinPeriod =
      line.journal_date >= startDate && line.journal_date <= endDate;

    if (isBeforePeriod) {
      // Opening balance: income adds, expense subtracts
      if (line.account_type === 'income') {
        opening[fid] = (opening[fid] ?? 0n) + netPence;
      } else {
        opening[fid] = (opening[fid] ?? 0n) - netPence;
      }
    } else if (isWithinPeriod) {
      if (line.account_type === 'income') {
        income[fid] = (income[fid] ?? 0n) + netPence;
      } else {
        expenditure[fid] = (expenditure[fid] ?? 0n) + netPence;
      }
    }
    // Lines after endDate are ignored (should not be passed in, but guard anyway)
  }

  // Build fund rows
  const fundRows: FMFundRow[] = [];

  for (const fund of funds) {
    fundRows.push(
      buildRow(fund.id, fund.name, fund.type, opening, income, expenditure),
    );
  }

  // Add unallocated row if any null-fund lines were seen
  if (hasUnallocated) {
    fundRows.push(
      buildRow(
        UNALLOCATED_FUND_ID,
        'Unallocated',
        'unrestricted',
        opening,
        income,
        expenditure,
      ),
    );
  }

  // Totals
  let totalOpening = 0n;
  let totalIncome = 0n;
  let totalExpenditure = 0n;
  for (const row of fundRows) {
    totalOpening += row.openingBalancePence;
    totalIncome += row.incomePence;
    totalExpenditure += row.expenditurePence;
  }
  const totalNet = totalIncome - totalExpenditure;

  return {
    period: { year, month, startDate, endDate },
    funds: fundRows,
    totals: {
      openingBalancePence: totalOpening,
      incomePence: totalIncome,
      expenditurePence: totalExpenditure,
      netMovementPence: totalNet,
      closingBalancePence: totalOpening + totalNet,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildRow(
  fundId: string,
  fundName: string,
  fundType: string,
  opening: Record<string, bigint>,
  income: Record<string, bigint>,
  expenditure: Record<string, bigint>,
): FMFundRow {
  const o = opening[fundId] ?? 0n;
  const i = income[fundId] ?? 0n;
  const e = expenditure[fundId] ?? 0n;
  const net = i - e;

  return {
    fundId,
    fundName,
    fundType,
    openingBalancePence: o,
    incomePence: i,
    expenditurePence: e,
    netMovementPence: net,
    closingBalancePence: o + net,
  };
}
