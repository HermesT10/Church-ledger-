/* ------------------------------------------------------------------ */
/*  Budget validation utilities                                        */
/* ------------------------------------------------------------------ */

/**
 * Account types that can have budget lines.
 * Matches the lowercase values from the `public.account_type` enum
 * defined in 00006_accounts.sql.
 */
export const BUDGETABLE_TYPES: readonly string[] = ['income', 'expense'];

/** Minimal account shape needed by the validation helpers. */
export interface AccountRow {
  id: string;
  name: string;
  type: string; // 'income' | 'expense' | 'asset' | 'liability' | 'equity'
}

/** Minimal budget line shape needed by the validation helpers. */
export interface BudgetLineRef {
  id?: string;
  account_id: string;
}

/* ------------------------------------------------------------------ */
/*  isBudgetableAccount                                                */
/* ------------------------------------------------------------------ */

/**
 * Returns true if the account's type is one that can carry a budget
 * (income or expense).
 */
export function isBudgetableAccount(account: AccountRow): boolean {
  return BUDGETABLE_TYPES.includes(account.type);
}

/* ------------------------------------------------------------------ */
/*  validateBudgetLines                                                */
/* ------------------------------------------------------------------ */

/**
 * Validate that every budget line references a budgetable account.
 *
 * @param accounts  All accounts available in the organisation.
 * @param lines     The budget lines to validate.
 * @returns         An array of human-readable error strings.
 *                  Empty array means all lines are valid.
 */
export function validateBudgetLines(
  accounts: AccountRow[],
  lines: BudgetLineRef[],
): string[] {
  const accountMap = new Map<string, AccountRow>();
  for (const a of accounts) {
    accountMap.set(a.id, a);
  }

  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const account = accountMap.get(line.account_id);

    if (!account) {
      errors.push(`Line ${i + 1}: account ${line.account_id} not found.`);
      continue;
    }

    if (!isBudgetableAccount(account)) {
      errors.push(
        `Line ${i + 1}: account "${account.name}" (type: ${account.type}) is not budgetable. Only income and expense accounts are allowed.`,
      );
    }
  }

  return errors;
}
