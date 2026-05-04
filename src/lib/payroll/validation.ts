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
  nicPence: number; // Backwards-compatible employer NIC field.
  pensionPence: number; // Backwards-compatible employer pension field.
  employeeNicPence?: number;
  employerNicPence?: number;
  employeePensionPence?: number;
  employerPensionPence?: number;
  otherDeductionsPence?: number;
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

export function computePayrollGross(inputs: {
  netPence: number;
  payePence: number;
  employeeNicPence?: number;
  employeePensionPence?: number;
  otherDeductionsPence?: number;
}): number {
  return (
    inputs.netPence +
    inputs.payePence +
    (inputs.employeeNicPence ?? 0) +
    (inputs.employeePensionPence ?? 0) +
    (inputs.otherDeductionsPence ?? 0)
  );
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
  if ((inputs.employeeNicPence ?? 0) < 0) errors.push('Employee NIC cannot be negative.');
  if ((inputs.employerNicPence ?? inputs.nicPence) < 0) errors.push('Employer NIC cannot be negative.');
  if ((inputs.employeePensionPence ?? 0) < 0) errors.push('Employee pension cannot be negative.');
  if ((inputs.employerPensionPence ?? inputs.pensionPence) < 0) errors.push('Employer pension cannot be negative.');
  if ((inputs.otherDeductionsPence ?? 0) < 0) errors.push('Other deductions cannot be negative.');

  const expectedGross = computePayrollGross(inputs);

  // If gross is provided and non-zero, it must equal net pay plus employee deductions.
  if (
    inputs.grossPence !== undefined &&
    inputs.grossPence !== 0 &&
    inputs.grossPence !== expectedGross
  ) {
    errors.push(
      `Gross (${inputs.grossPence}) must equal net pay plus employee deductions (${expectedGross}).`,
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
  employeeNicPence?: number;
  employerNicPence?: number;
  employeePensionPence?: number;
  employerPensionPence?: number;
  otherDeductionsPence?: number;
  splits?: PayrollSplit[];
  accountIds: PayrollAccountIds;
}): JournalLineOutput[] {
  const {
    grossPence,
    netPence,
    payePence,
    splits,
    accountIds,
  } = params;
  const employeeNicPence = params.employeeNicPence ?? 0;
  const employerNicPence = params.employerNicPence ?? params.nicPence;
  const employeePensionPence = params.employeePensionPence ?? 0;
  const employerPensionPence = params.employerPensionPence ?? params.pensionPence;

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
      if (employerNicPence > 0) {
        const nicShare = Math.round(employerNicPence * proportion);
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
      if (employerPensionPence > 0) {
        const pensionShare = Math.round(employerPensionPence * proportion);
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

    if (employerNicPence > 0) {
      const nicTotal = lines
        .filter((l) => l.accountId === accountIds.erNicAccountId)
        .reduce((sum, l) => sum + l.debitPence, 0);
      if (nicTotal !== employerNicPence) {
        const firstNic = lines.find(
          (l) => l.accountId === accountIds.erNicAccountId,
        );
        if (firstNic) firstNic.debitPence += employerNicPence - nicTotal;
      }
    }

    if (employerPensionPence > 0) {
      const pensionTotal = lines
        .filter((l) => l.accountId === accountIds.pensionAccountId)
        .reduce((sum, l) => sum + l.debitPence, 0);
      if (pensionTotal !== employerPensionPence) {
        const firstPension = lines.find(
          (l) => l.accountId === accountIds.pensionAccountId,
        );
        if (firstPension) firstPension.debitPence += employerPensionPence - pensionTotal;
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

    if (employerNicPence > 0) {
      lines.push({
        accountId: accountIds.erNicAccountId,
        debitPence: employerNicPence,
        creditPence: 0,
        fundId: null,
        memo: 'Employer NIC expense',
      });
    }

    if (employerPensionPence > 0) {
      lines.push({
        accountId: accountIds.pensionAccountId,
        debitPence: employerPensionPence,
        creditPence: 0,
        fundId: null,
        memo: 'Pension expense',
      });
    }
  }

  // --- Credit side: Liability lines (never split by fund) ---

  // PAYE/NIC Liability = paye + nic (employer NIC is paid to HMRC together with PAYE)
  const payeNicTotal = payePence + employeeNicPence + employerNicPence;
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
  const pensionLiabilityPence = employeePensionPence + employerPensionPence;
  if (pensionLiabilityPence > 0) {
    lines.push({
      accountId: accountIds.pensionLiabilityId,
      debitPence: 0,
      creditPence: pensionLiabilityPence,
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
