/* ------------------------------------------------------------------ */
/*  Bill validation – pure functions (no 'use server')                 */
/* ------------------------------------------------------------------ */

export interface BillLineInput {
  account_id: string;
  fund_id?: string | null;
  description?: string;
  amount: string; // pounds string, e.g. "12.50"
}

/* ------------------------------------------------------------------ */
/*  validateBillLines                                                  */
/* ------------------------------------------------------------------ */

export interface BillLineError {
  index: number;
  message: string;
}

export interface BillLinesValidation {
  valid: boolean;
  errors: BillLineError[];
  /** Sum of all lines in pence */
  linesSumPence: number;
}

/**
 * Validates that:
 * - At least one line exists
 * - Each line has a positive amount and an account
 * - Sum of line amounts equals the expected total
 */
export function validateBillLines(
  lines: BillLineInput[],
  expectedTotalPence: number
): BillLinesValidation {
  const errors: BillLineError[] = [];

  if (lines.length === 0) {
    return {
      valid: false,
      errors: [{ index: -1, message: 'At least one bill line is required.' }],
      linesSumPence: 0,
    };
  }

  let sumPence = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.account_id) {
      errors.push({ index: i, message: `Line ${i + 1}: account is required.` });
    }

    const amountPence = Math.round(parseFloat(line.amount || '0') * 100);

    if (isNaN(amountPence) || amountPence <= 0) {
      errors.push({
        index: i,
        message: `Line ${i + 1}: amount must be greater than zero.`,
      });
    } else {
      sumPence += amountPence;
    }
  }

  if (errors.length === 0 && sumPence !== expectedTotalPence) {
    errors.push({
      index: -1,
      message: `Line totals (${(sumPence / 100).toFixed(2)}) do not match bill total (${(expectedTotalPence / 100).toFixed(2)}).`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    linesSumPence: sumPence,
  };
}

/* ------------------------------------------------------------------ */
/*  validateStatusTransition                                           */
/* ------------------------------------------------------------------ */

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['approved'],
  approved: ['posted'],
  posted: ['paid'],
  paid: [],
};

/**
 * Returns true if the transition from `current` to `next` is allowed.
 */
export function validateStatusTransition(
  current: string,
  next: string
): { valid: boolean; message: string } {
  const allowed = VALID_TRANSITIONS[current];

  if (!allowed) {
    return { valid: false, message: `Unknown current status: ${current}` };
  }

  if (!allowed.includes(next)) {
    return {
      valid: false,
      message: `Cannot transition from '${current}' to '${next}'. Allowed: ${allowed.join(', ') || 'none'}.`,
    };
  }

  return { valid: true, message: 'OK' };
}

/* ------------------------------------------------------------------ */
/*  buildJournalLinesFromBill – pure helper for posting                */
/* ------------------------------------------------------------------ */

export interface BillLineForPosting {
  account_id: string;
  fund_id: string | null;
  description: string | null;
  amount_pence: number;
}

export interface JournalLineOutput {
  account_id: string;
  fund_id: string | null;
  description: string | null;
  debit_pence: number;
  credit_pence: number;
}

/**
 * Builds balanced journal lines from bill lines:
 * - Debit each expense account (from bill lines, fund-tagged)
 * - Credit the creditors account for the total
 */
export function buildJournalLinesFromBill(
  billLines: BillLineForPosting[],
  creditorsAccountId: string,
  totalPence: number
): JournalLineOutput[] {
  const journalLines: JournalLineOutput[] = [];

  // Debit lines (one per bill line)
  for (const bl of billLines) {
    journalLines.push({
      account_id: bl.account_id,
      fund_id: bl.fund_id,
      description: bl.description,
      debit_pence: bl.amount_pence,
      credit_pence: 0,
    });
  }

  // Credit line (single entry to creditors)
  journalLines.push({
    account_id: creditorsAccountId,
    fund_id: null,
    description: 'Creditors – bill payment',
    debit_pence: 0,
    credit_pence: totalPence,
  });

  return journalLines;
}

/* ================================================================== */
/*  Payment Run validation + journal builder                           */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  PaymentRunItemInput                                                */
/* ------------------------------------------------------------------ */

export interface PaymentRunItemInput {
  bill_id: string;
  amount_pence: number;
}

/* ------------------------------------------------------------------ */
/*  validatePaymentRunItems                                            */
/* ------------------------------------------------------------------ */

export interface PaymentRunValidation {
  valid: boolean;
  errors: string[];
  itemsSumPence: number;
}

/**
 * Validates that:
 * - At least one item exists
 * - Each item has a positive amount
 * - Sum of item amounts equals the expected total
 */
export function validatePaymentRunItems(
  items: PaymentRunItemInput[],
  expectedTotalPence: number
): PaymentRunValidation {
  const errors: string[] = [];

  if (items.length === 0) {
    return {
      valid: false,
      errors: ['At least one bill must be included in a payment run.'],
      itemsSumPence: 0,
    };
  }

  let sumPence = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (!item.bill_id) {
      errors.push(`Item ${i + 1}: bill ID is required.`);
    }

    if (item.amount_pence <= 0) {
      errors.push(`Item ${i + 1}: amount must be greater than zero.`);
    } else {
      sumPence += item.amount_pence;
    }
  }

  if (errors.length === 0 && sumPence !== expectedTotalPence) {
    errors.push(
      `Items total (${(sumPence / 100).toFixed(2)}) does not match payment run total (${(expectedTotalPence / 100).toFixed(2)}).`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    itemsSumPence: sumPence,
  };
}

/* ------------------------------------------------------------------ */
/*  buildPaymentRunJournalLines                                        */
/* ------------------------------------------------------------------ */

export interface PaymentRunItemForPosting {
  bill_id: string;
  amount_pence: number;
  /** Optional description for the debit line (e.g. bill number) */
  description?: string | null;
}

/**
 * Builds balanced journal lines for a payment run:
 * - Debit creditors account (one line per bill item, clears AP)
 * - Credit bank account (single line for total, reduces cash)
 */
export function buildPaymentRunJournalLines(
  items: PaymentRunItemForPosting[],
  creditorsAccountId: string,
  bankAccountId: string,
  totalPence: number
): JournalLineOutput[] {
  const journalLines: JournalLineOutput[] = [];

  // Debit lines: one per bill (clears creditors / AP)
  for (const item of items) {
    journalLines.push({
      account_id: creditorsAccountId,
      fund_id: null,
      description: item.description ?? 'Payment run – clear creditor',
      debit_pence: item.amount_pence,
      credit_pence: 0,
    });
  }

  // Credit line: single entry to bank account
  journalLines.push({
    account_id: bankAccountId,
    fund_id: null,
    description: 'Payment run – bank transfer',
    debit_pence: 0,
    credit_pence: totalPence,
  });

  return journalLines;
}
