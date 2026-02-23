/**
 * Pure functions for building and validating reversal journals.
 *
 * A reversal journal corrects a posted journal by creating a new journal
 * with equal and opposite entries (debits become credits and vice versa).
 * The original journal is not modified.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface JournalLine {
  account_id: string;
  fund_id: string | null;
  description: string | null;
  debit_pence: number;
  credit_pence: number;
}

export interface ReversalLine {
  account_id: string;
  fund_id: string | null;
  description: string | null;
  debit_pence: number;
  credit_pence: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/* ------------------------------------------------------------------ */
/*  buildReversalLines                                                 */
/* ------------------------------------------------------------------ */

/**
 * Takes the lines of a posted journal and returns lines with debits and
 * credits swapped. Each original debit becomes a credit and vice versa.
 */
export function buildReversalLines(originalLines: JournalLine[]): ReversalLine[] {
  return originalLines.map((line) => ({
    account_id: line.account_id,
    fund_id: line.fund_id,
    description: line.description ? `Reversal: ${line.description}` : 'Reversal',
    debit_pence: line.credit_pence,   // swap: original credit -> reversal debit
    credit_pence: line.debit_pence,   // swap: original debit -> reversal credit
  }));
}

/* ------------------------------------------------------------------ */
/*  validateReversal                                                   */
/* ------------------------------------------------------------------ */

/**
 * Validates that a set of reversal lines correctly reverses the original.
 *
 * Checks:
 * - Same number of lines
 * - Each line references the same account
 * - Each line has equal and opposite amounts
 * - The reversal journal itself is balanced (sum debits = sum credits)
 */
export function validateReversal(
  originalLines: JournalLine[],
  reversalLines: ReversalLine[],
): ValidationResult {
  const errors: string[] = [];

  if (originalLines.length !== reversalLines.length) {
    errors.push(
      `Line count mismatch: original has ${originalLines.length} lines, reversal has ${reversalLines.length}.`,
    );
    return { valid: false, errors };
  }

  if (originalLines.length === 0) {
    errors.push('Original journal has no lines to reverse.');
    return { valid: false, errors };
  }

  for (let i = 0; i < originalLines.length; i++) {
    const orig = originalLines[i];
    const rev = reversalLines[i];

    if (orig.account_id !== rev.account_id) {
      errors.push(
        `Line ${i + 1}: account mismatch (original=${orig.account_id}, reversal=${rev.account_id}).`,
      );
    }

    if (orig.debit_pence !== rev.credit_pence) {
      errors.push(
        `Line ${i + 1}: original debit ${orig.debit_pence} does not match reversal credit ${rev.credit_pence}.`,
      );
    }

    if (orig.credit_pence !== rev.debit_pence) {
      errors.push(
        `Line ${i + 1}: original credit ${orig.credit_pence} does not match reversal debit ${rev.debit_pence}.`,
      );
    }
  }

  // Check balance of reversal
  const totalDebits = reversalLines.reduce((sum, l) => sum + l.debit_pence, 0);
  const totalCredits = reversalLines.reduce((sum, l) => sum + l.credit_pence, 0);

  if (totalDebits !== totalCredits) {
    errors.push(
      `Reversal is unbalanced: total debits ${totalDebits} != total credits ${totalCredits}.`,
    );
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  canReverse                                                         */
/* ------------------------------------------------------------------ */

/**
 * Checks whether a journal can be reversed.
 * Returns { allowed, reason? }.
 */
export function canReverse(journal: {
  status: string;
  reversed_by: string | null;
  reversal_of: string | null;
}): { allowed: boolean; reason?: string } {
  if (journal.status !== 'posted') {
    return { allowed: false, reason: 'Only posted journals can be reversed.' };
  }

  if (journal.reversed_by) {
    return { allowed: false, reason: 'This journal has already been reversed.' };
  }

  if (journal.reversal_of) {
    return { allowed: false, reason: 'Reversal journals cannot themselves be reversed.' };
  }

  return { allowed: true };
}
