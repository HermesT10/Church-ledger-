/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BSAccountRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  balance: bigint; // computed per sign convention
}

export interface BSSection {
  rows: BSAccountRow[];
  total: bigint;
}

export interface BSReport {
  asOfDate: string;
  sections: {
    assets: BSSection;
    liabilities: BSSection;
    equity: BSSection;
  };
  netAssets: bigint; // assets.total - liabilities.total
  check: {
    balances: boolean; // assets.total == liabilities.total + equity.total
    difference: bigint; // assets.total - (liabilities.total + equity.total)
  };
}

/** A single journal line already filtered to posted journals <= asOfDate. */
export interface BSRawLine {
  account_id: string;
  debit_pence: number;
  credit_pence: number;
}

/** Minimal account shape required by the report builder. */
export interface BSAccountRef {
  id: string;
  code: string;
  name: string;
  type: string; // 'asset' | 'liability' | 'equity'
}

/* ------------------------------------------------------------------ */
/*  buildBalanceSheetReport                                            */
/* ------------------------------------------------------------------ */

/**
 * Build a Balance Sheet report from raw journal lines.
 *
 * @param accounts  Asset / liability / equity accounts, sorted by type then code.
 * @param lines     Journal lines already filtered to posted journals with date <= asOfDate.
 * @param asOfDate  ISO date string (inclusive upper bound).
 */
export function buildBalanceSheetReport(params: {
  accounts: BSAccountRef[];
  lines: BSRawLine[];
  asOfDate: string;
}): BSReport {
  const { accounts, lines, asOfDate } = params;

  // 1. Aggregate debits and credits per account
  const debits: Record<string, bigint> = {};
  const credits: Record<string, bigint> = {};

  for (const line of lines) {
    const aid = line.account_id;
    debits[aid] = (debits[aid] ?? 0n) + BigInt(line.debit_pence);
    credits[aid] = (credits[aid] ?? 0n) + BigInt(line.credit_pence);
  }

  // 2. Split accounts by type
  const assetAccounts = accounts.filter((a) => a.type === 'asset');
  const liabilityAccounts = accounts.filter((a) => a.type === 'liability');
  const equityAccounts = accounts.filter((a) => a.type === 'equity');

  // 3. Build sections
  const assets = buildSection(assetAccounts, debits, credits, 'asset');
  const liabilities = buildSection(liabilityAccounts, debits, credits, 'liability');
  const equity = buildSection(equityAccounts, debits, credits, 'equity');

  // 4. Net assets
  const netAssets = assets.total - liabilities.total;

  // 5. Accounting equation check: A = L + E
  const difference = assets.total - (liabilities.total + equity.total);

  return {
    asOfDate,
    sections: { assets, liabilities, equity },
    netAssets,
    check: {
      balances: difference === 0n,
      difference,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function computeBalance(
  accountType: string,
  totalDebit: bigint,
  totalCredit: bigint,
): bigint {
  if (accountType === 'asset') {
    return totalDebit - totalCredit;
  }
  // liability and equity: credit - debit
  return totalCredit - totalDebit;
}

function buildSection(
  accounts: BSAccountRef[],
  debits: Record<string, bigint>,
  credits: Record<string, bigint>,
  accountType: string,
): BSSection {
  const rows: BSAccountRow[] = accounts.map((account) => {
    const d = debits[account.id] ?? 0n;
    const c = credits[account.id] ?? 0n;
    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      balance: computeBalance(accountType, d, c),
    };
  });

  let total = 0n;
  for (const row of rows) {
    total += row.balance;
  }

  return { rows, total };
}
