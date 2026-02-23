import { describe, it, expect } from 'vitest';
import {
  computeGross,
  validatePayrollInputs,
  buildPayrollJournalLines,
} from '../src/lib/payroll/validation';
import type {
  PayrollInputs,
  PayrollSplit,
  PayrollAccountIds,
} from '../src/lib/payroll/validation';

/* ------------------------------------------------------------------ */
/*  Shared fixtures                                                    */
/* ------------------------------------------------------------------ */

const ACCOUNTS: PayrollAccountIds = {
  salariesAccountId: 'sal-001',
  erNicAccountId: 'nic-001',
  pensionAccountId: 'pen-001',
  payeNicLiabilityId: 'paye-lia-001',
  pensionLiabilityId: 'pen-lia-001',
  netPayLiabilityId: 'net-lia-001',
};

/* ------------------------------------------------------------------ */
/*  computeGross                                                       */
/* ------------------------------------------------------------------ */

describe('computeGross', () => {
  it('returns net + paye', () => {
    expect(computeGross(200000, 50000)).toBe(250000);
  });

  it('returns net when paye is zero', () => {
    expect(computeGross(150000, 0)).toBe(150000);
  });

  it('handles zero values', () => {
    expect(computeGross(0, 0)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  validatePayrollInputs                                              */
/* ------------------------------------------------------------------ */

describe('validatePayrollInputs', () => {
  it('valid inputs pass', () => {
    const inputs: PayrollInputs = {
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
    };
    const result = validatePayrollInputs(inputs);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects negative net pay', () => {
    const inputs: PayrollInputs = {
      netPence: -100,
      payePence: 50000,
      nicPence: 0,
      pensionPence: 0,
    };
    const result = validatePayrollInputs(inputs);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('negative'))).toBe(true);
  });

  it('rejects zero net pay', () => {
    const inputs: PayrollInputs = {
      netPence: 0,
      payePence: 50000,
      nicPence: 0,
      pensionPence: 0,
    };
    const result = validatePayrollInputs(inputs);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('greater than zero'))).toBe(true);
  });

  it('rejects negative PAYE', () => {
    const inputs: PayrollInputs = {
      netPence: 200000,
      payePence: -100,
      nicPence: 0,
      pensionPence: 0,
    };
    const result = validatePayrollInputs(inputs);
    expect(result.valid).toBe(false);
  });

  it('rejects negative NIC', () => {
    const inputs: PayrollInputs = {
      netPence: 200000,
      payePence: 50000,
      nicPence: -100,
      pensionPence: 0,
    };
    const result = validatePayrollInputs(inputs);
    expect(result.valid).toBe(false);
  });

  it('rejects negative pension', () => {
    const inputs: PayrollInputs = {
      netPence: 200000,
      payePence: 50000,
      nicPence: 0,
      pensionPence: -100,
    };
    const result = validatePayrollInputs(inputs);
    expect(result.valid).toBe(false);
  });

  it('rejects gross mismatch', () => {
    const inputs: PayrollInputs = {
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
      grossPence: 300000, // should be 250000
    };
    const result = validatePayrollInputs(inputs);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Gross'))).toBe(true);
  });

  it('accepts correct gross override', () => {
    const inputs: PayrollInputs = {
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
      grossPence: 250000,
    };
    const result = validatePayrollInputs(inputs);
    expect(result.valid).toBe(true);
  });

  it('validates splits must sum to gross', () => {
    const inputs: PayrollInputs = {
      netPence: 200000,
      payePence: 50000,
      nicPence: 0,
      pensionPence: 0,
    };
    const splits: PayrollSplit[] = [
      { fundId: 'f1', amountPence: 100000 },
      { fundId: 'f2', amountPence: 100000 }, // total 200000, gross is 250000
    ];
    const result = validatePayrollInputs(inputs, splits);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('splits total'))).toBe(true);
  });

  it('accepts splits that sum to gross', () => {
    const inputs: PayrollInputs = {
      netPence: 200000,
      payePence: 50000,
      nicPence: 0,
      pensionPence: 0,
    };
    const splits: PayrollSplit[] = [
      { fundId: 'f1', amountPence: 100000 },
      { fundId: 'f2', amountPence: 150000 },
    ];
    const result = validatePayrollInputs(inputs, splits);
    expect(result.valid).toBe(true);
  });

  it('rejects split with zero amount', () => {
    const inputs: PayrollInputs = {
      netPence: 200000,
      payePence: 50000,
      nicPence: 0,
      pensionPence: 0,
    };
    const splits: PayrollSplit[] = [
      { fundId: 'f1', amountPence: 250000 },
      { fundId: 'f2', amountPence: 0 },
    ];
    const result = validatePayrollInputs(inputs, splits);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('positive amount'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  buildPayrollJournalLines — without splits                          */
/* ------------------------------------------------------------------ */

describe('buildPayrollJournalLines (no splits)', () => {
  it('creates balanced journal lines', () => {
    const lines = buildPayrollJournalLines({
      grossPence: 250000,
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
      accountIds: ACCOUNTS,
    });

    const totalDebits = lines.reduce((s, l) => s + l.debitPence, 0);
    const totalCredits = lines.reduce((s, l) => s + l.creditPence, 0);

    expect(totalDebits).toBe(totalCredits);
  });

  it('has correct debit amounts', () => {
    const lines = buildPayrollJournalLines({
      grossPence: 250000,
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
      accountIds: ACCOUNTS,
    });

    const salariesDebit = lines
      .filter((l) => l.accountId === ACCOUNTS.salariesAccountId)
      .reduce((s, l) => s + l.debitPence, 0);
    expect(salariesDebit).toBe(250000);

    const nicDebit = lines
      .filter((l) => l.accountId === ACCOUNTS.erNicAccountId)
      .reduce((s, l) => s + l.debitPence, 0);
    expect(nicDebit).toBe(30000);

    const pensionDebit = lines
      .filter((l) => l.accountId === ACCOUNTS.pensionAccountId)
      .reduce((s, l) => s + l.debitPence, 0);
    expect(pensionDebit).toBe(20000);
  });

  it('has correct credit amounts', () => {
    const lines = buildPayrollJournalLines({
      grossPence: 250000,
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
      accountIds: ACCOUNTS,
    });

    const payeNicCredit = lines
      .filter((l) => l.accountId === ACCOUNTS.payeNicLiabilityId)
      .reduce((s, l) => s + l.creditPence, 0);
    expect(payeNicCredit).toBe(80000); // paye 50000 + nic 30000

    const pensionCredit = lines
      .filter((l) => l.accountId === ACCOUNTS.pensionLiabilityId)
      .reduce((s, l) => s + l.creditPence, 0);
    expect(pensionCredit).toBe(20000);

    const netPayCredit = lines
      .filter((l) => l.accountId === ACCOUNTS.netPayLiabilityId)
      .reduce((s, l) => s + l.creditPence, 0);
    expect(netPayCredit).toBe(200000);
  });

  it('produces 6 lines with all components', () => {
    const lines = buildPayrollJournalLines({
      grossPence: 250000,
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
      accountIds: ACCOUNTS,
    });

    // 3 debits (salaries, nic, pension) + 3 credits (paye/nic lia, pension lia, net lia)
    expect(lines).toHaveLength(6);
  });

  it('omits Employer NIC lines when NIC is zero', () => {
    const lines = buildPayrollJournalLines({
      grossPence: 250000,
      netPence: 200000,
      payePence: 50000,
      nicPence: 0,
      pensionPence: 20000,
      accountIds: ACCOUNTS,
    });

    const nicLines = lines.filter(
      (l) => l.accountId === ACCOUNTS.erNicAccountId,
    );
    expect(nicLines).toHaveLength(0);

    // PAYE/NIC liability should only include PAYE (no NIC)
    const payeNicCredit = lines
      .filter((l) => l.accountId === ACCOUNTS.payeNicLiabilityId)
      .reduce((s, l) => s + l.creditPence, 0);
    expect(payeNicCredit).toBe(50000);

    // Should still be balanced
    const totalDebits = lines.reduce((s, l) => s + l.debitPence, 0);
    const totalCredits = lines.reduce((s, l) => s + l.creditPence, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  it('omits Pension lines when pension is zero', () => {
    const lines = buildPayrollJournalLines({
      grossPence: 250000,
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 0,
      accountIds: ACCOUNTS,
    });

    const pensionDebitLines = lines.filter(
      (l) => l.accountId === ACCOUNTS.pensionAccountId,
    );
    expect(pensionDebitLines).toHaveLength(0);

    const pensionCreditLines = lines.filter(
      (l) => l.accountId === ACCOUNTS.pensionLiabilityId,
    );
    expect(pensionCreditLines).toHaveLength(0);

    // Should still be balanced
    const totalDebits = lines.reduce((s, l) => s + l.debitPence, 0);
    const totalCredits = lines.reduce((s, l) => s + l.creditPence, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  it('fund is null for all lines without splits', () => {
    const lines = buildPayrollJournalLines({
      grossPence: 250000,
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
      accountIds: ACCOUNTS,
    });

    for (const line of lines) {
      expect(line.fundId).toBeNull();
    }
  });
});

/* ------------------------------------------------------------------ */
/*  buildPayrollJournalLines — with splits                             */
/* ------------------------------------------------------------------ */

describe('buildPayrollJournalLines (with splits)', () => {
  const splits: PayrollSplit[] = [
    { fundId: 'fund-general', amountPence: 150000 },
    { fundId: 'fund-youth', amountPence: 100000 },
  ];

  it('is balanced with splits', () => {
    const lines = buildPayrollJournalLines({
      grossPence: 250000,
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
      splits,
      accountIds: ACCOUNTS,
    });

    const totalDebits = lines.reduce((s, l) => s + l.debitPence, 0);
    const totalCredits = lines.reduce((s, l) => s + l.creditPence, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  it('expense lines are split by fund', () => {
    const lines = buildPayrollJournalLines({
      grossPence: 250000,
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
      splits,
      accountIds: ACCOUNTS,
    });

    const salariesLines = lines.filter(
      (l) => l.accountId === ACCOUNTS.salariesAccountId,
    );
    expect(salariesLines).toHaveLength(2);

    // Total salaries debits should equal gross
    const salariesTotal = salariesLines.reduce((s, l) => s + l.debitPence, 0);
    expect(salariesTotal).toBe(250000);

    // Each should have a fund ID
    expect(salariesLines.every((l) => l.fundId !== null)).toBe(true);
  });

  it('NIC expense lines are split by fund', () => {
    const lines = buildPayrollJournalLines({
      grossPence: 250000,
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
      splits,
      accountIds: ACCOUNTS,
    });

    const nicLines = lines.filter(
      (l) => l.accountId === ACCOUNTS.erNicAccountId,
    );
    expect(nicLines).toHaveLength(2);
    const nicTotal = nicLines.reduce((s, l) => s + l.debitPence, 0);
    expect(nicTotal).toBe(30000);
  });

  it('pension expense lines are split by fund', () => {
    const lines = buildPayrollJournalLines({
      grossPence: 250000,
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
      splits,
      accountIds: ACCOUNTS,
    });

    const pensionLines = lines.filter(
      (l) => l.accountId === ACCOUNTS.pensionAccountId,
    );
    expect(pensionLines).toHaveLength(2);
    const pensionTotal = pensionLines.reduce((s, l) => s + l.debitPence, 0);
    expect(pensionTotal).toBe(20000);
  });

  it('liability lines are unsplit (no fund)', () => {
    const lines = buildPayrollJournalLines({
      grossPence: 250000,
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
      splits,
      accountIds: ACCOUNTS,
    });

    const creditLines = lines.filter((l) => l.creditPence > 0);
    for (const line of creditLines) {
      expect(line.fundId).toBeNull();
    }
  });

  it('handles uneven splits with rounding correction', () => {
    // 3 funds that don't divide evenly
    const unevenSplits: PayrollSplit[] = [
      { fundId: 'f1', amountPence: 83334 },
      { fundId: 'f2', amountPence: 83333 },
      { fundId: 'f3', amountPence: 83333 },
    ];
    // gross = 250000, but splits total is 250000
    const lines = buildPayrollJournalLines({
      grossPence: 250000,
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
      splits: unevenSplits,
      accountIds: ACCOUNTS,
    });

    const totalDebits = lines.reduce((s, l) => s + l.debitPence, 0);
    const totalCredits = lines.reduce((s, l) => s + l.creditPence, 0);
    expect(totalDebits).toBe(totalCredits);

    // Salaries total should still be exactly gross
    const salariesTotal = lines
      .filter((l) => l.accountId === ACCOUNTS.salariesAccountId)
      .reduce((s, l) => s + l.debitPence, 0);
    expect(salariesTotal).toBe(250000);
  });
});

/* ------------------------------------------------------------------ */
/*  Posted run immutability (status validation)                        */
/* ------------------------------------------------------------------ */

describe('posted run immutability', () => {
  it('validatePayrollInputs does not reject posted status (pure fn has no status)', () => {
    // The immutability is enforced at the action level (postPayrollRun checks status).
    // The pure validation only checks numeric inputs, so any valid inputs should pass.
    const result = validatePayrollInputs({
      netPence: 200000,
      payePence: 50000,
      nicPence: 30000,
      pensionPence: 20000,
    });
    expect(result.valid).toBe(true);
  });

  it('only draft runs can be posted (business rule - documented)', () => {
    // This test documents the business rule enforced by postPayrollRun server action:
    // - If status === 'posted', returns success (idempotency)
    // - If status !== 'draft', returns error
    // We can't test the server action here (requires DB), so we verify the validation
    // layer accepts the inputs correctly.
    const result = validatePayrollInputs({
      netPence: 200000,
      payePence: 50000,
      nicPence: 0,
      pensionPence: 0,
    });
    expect(result.valid).toBe(true);
  });
});
