/**
 * Pure validation and journal-building functions for payroll runs.
 *
 * All amounts are in pence (bigint-safe integers).
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PayrollInputs {
  netPence: number;
  payePence: number;
  nicPence: number;
  pensionPence: number;
  grossPence?: number; // optional — auto-computed if omitted or 0
}

export interface PayrollSplit {
  fundId: string | null;
  amountPence: number;
}

export interface PayrollAccountIds {
  salariesAccountId: string;
  erNicAccountId: string;
  pensionAccountId: string;
  payeNicLiabilityId: string;
  pensionLiabilityId: string;
  netPayLiabilityId: string;
}

export interface JournalLineOutput {
  accountId: string;
  debitPence: number;
  creditPence: number;
  fundId: string | null;
  memo: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/* ------------------------------------------------------------------ */
/*  computeGross                                                       */
/* ------------------------------------------------------------------ */

/**
 * Gross pay = net + PAYE.
 * Employer NIC and pension are additional costs, not deducted from gross.
 */
export function computeGross(netPence: number, payePence: number): number {
  return netPence + payePence;
}

/* ------------------------------------------------------------------ */
/*  validatePayrollInputs                                              */
/* ------------------------------------------------------------------ */

export function validatePayrollInputs(
  inputs: PayrollInputs,
  splits?: PayrollSplit[],
): ValidationResult {
  const errors: string[] = [];

  if (inputs.netPence < 0) errors.push('Net pay cannot be negative.');
  if (inputs.netPence === 0) errors.push('Net pay must be greater than zero.');
  if (inputs.payePence < 0) errors.push('PAYE cannot be negative.');
  if (inputs.nicPence < 0) errors.push('Employer NIC cannot be negative.');
  if (inputs.pensionPence < 0) errors.push('Pension cannot be negative.');

  const expectedGross = computeGross(inputs.netPence, inputs.payePence);

  // If gross is provided and non-zero, it must equal net + paye
  if (
    inputs.grossPence !== undefined &&
    inputs.grossPence !== 0 &&
    inputs.grossPence !== expectedGross
  ) {
    errors.push(
      `Gross (${inputs.grossPence}) must equal net + PAYE (${expectedGross}).`,
    );
  }

  // Validate splits if provided
  if (splits && splits.length > 0) {
    const gross = inputs.grossPence && inputs.grossPence > 0
      ? inputs.grossPence
      : expectedGross;

    const splitsTotal = splits.reduce((sum, s) => sum + s.amountPence, 0);
    if (splitsTotal !== gross) {
      errors.push(
        `Fund splits total (${splitsTotal}) must equal gross (${gross}).`,
      );
    }

    for (const s of splits) {
      if (s.amountPence <= 0) {
        errors.push('Each fund split must have a positive amount.');
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  buildPayrollJournalLines                                           */
/* ------------------------------------------------------------------ */

export function buildPayrollJournalLines(params: {
  grossPence: number;
  netPence: number;
  payePence: number;
  nicPence: number;
  pensionPence: number;
  splits?: PayrollSplit[];
  accountIds: PayrollAccountIds;
}): JournalLineOutput[] {
  const {
    grossPence,
    netPence,
    payePence,
    nicPence,
    pensionPence,
    splits,
    accountIds,
  } = params;

  const lines: JournalLineOutput[] = [];

  // --- Debit side: Expense lines ---

  if (splits && splits.length > 0) {
    // Split expense lines proportionally by fund
    for (const split of splits) {
      const proportion = split.amountPence / grossPence;

      // Salaries expense (gross portion for this fund)
      const salaryPence = Math.round(grossPence * proportion);
      if (salaryPence > 0) {
        lines.push({
          accountId: accountIds.salariesAccountId,
          debitPence: salaryPence,
          creditPence: 0,
          fundId: split.fundId,
          memo: 'Salaries expense',
        });
      }

      // Employer NIC expense (proportional)
      if (nicPence > 0) {
        const nicShare = Math.round(nicPence * proportion);
        if (nicShare > 0) {
          lines.push({
            accountId: accountIds.erNicAccountId,
            debitPence: nicShare,
            creditPence: 0,
            fundId: split.fundId,
            memo: 'Employer NIC expense',
          });
        }
      }

      // Pension expense (proportional)
      if (pensionPence > 0) {
        const pensionShare = Math.round(pensionPence * proportion);
        if (pensionShare > 0) {
          lines.push({
            accountId: accountIds.pensionAccountId,
            debitPence: pensionShare,
            creditPence: 0,
            fundId: split.fundId,
            memo: 'Pension expense',
          });
        }
      }
    }

    // Fix rounding: adjust first split's amounts to absorb rounding differences
    const salaryTotal = lines
      .filter((l) => l.accountId === accountIds.salariesAccountId)
      .reduce((sum, l) => sum + l.debitPence, 0);
    if (salaryTotal !== grossPence) {
      const firstSalary = lines.find(
        (l) => l.accountId === accountIds.salariesAccountId,
      );
      if (firstSalary) firstSalary.debitPence += grossPence - salaryTotal;
    }

    if (nicPence > 0) {
      const nicTotal = lines
        .filter((l) => l.accountId === accountIds.erNicAccountId)
        .reduce((sum, l) => sum + l.debitPence, 0);
      if (nicTotal !== nicPence) {
        const firstNic = lines.find(
          (l) => l.accountId === accountIds.erNicAccountId,
        );
        if (firstNic) firstNic.debitPence += nicPence - nicTotal;
      }
    }

    if (pensionPence > 0) {
      const pensionTotal = lines
        .filter((l) => l.accountId === accountIds.pensionAccountId)
        .reduce((sum, l) => sum + l.debitPence, 0);
      if (pensionTotal !== pensionPence) {
        const firstPension = lines.find(
          (l) => l.accountId === accountIds.pensionAccountId,
        );
        if (firstPension) firstPension.debitPence += pensionPence - pensionTotal;
      }
    }
  } else {
    // No splits: single debit lines
    lines.push({
      accountId: accountIds.salariesAccountId,
      debitPence: grossPence,
      creditPence: 0,
      fundId: null,
      memo: 'Salaries expense',
    });

    if (nicPence > 0) {
      lines.push({
        accountId: accountIds.erNicAccountId,
        debitPence: nicPence,
        creditPence: 0,
        fundId: null,
        memo: 'Employer NIC expense',
      });
    }

    if (pensionPence > 0) {
      lines.push({
        accountId: accountIds.pensionAccountId,
        debitPence: pensionPence,
        creditPence: 0,
        fundId: null,
        memo: 'Pension expense',
      });
    }
  }

  // --- Credit side: Liability lines (never split by fund) ---

  // PAYE/NIC Liability = paye + nic (employer NIC is paid to HMRC together with PAYE)
  const payeNicTotal = payePence + nicPence;
  if (payeNicTotal > 0) {
    lines.push({
      accountId: accountIds.payeNicLiabilityId,
      debitPence: 0,
      creditPence: payeNicTotal,
      fundId: null,
      memo: 'PAYE/NIC liability',
    });
  }

  // Pension Liability
  if (pensionPence > 0) {
    lines.push({
      accountId: accountIds.pensionLiabilityId,
      debitPence: 0,
      creditPence: pensionPence,
      fundId: null,
      memo: 'Pension liability',
    });
  }

  // Net Pay Liability
  lines.push({
    accountId: accountIds.netPayLiabilityId,
    debitPence: 0,
    creditPence: netPence,
    fundId: null,
    memo: 'Net pay liability',
  });

  return lines;
}
