import { z } from 'zod';

export const transactionTypeSchema = z.enum(['income', 'expense', 'transfer', 'adjustment']);

export const transactionStatusSchema = z.enum([
  'draft',
  'submitted',
  'approved',
  'awaiting_bank_match',
  'matched',
  'reconciled',
  'posted',
  'rejected',
  'voided',
]);

export const transactionLineSchema = z.object({
  fund_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid(),
  income_stream_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  amount_pence: z.coerce.number().int().positive(),
  direction: z.enum(['in', 'out']),
});

export const manualTransactionSchema = z.object({
  type: transactionTypeSchema,
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_pence: z.coerce.number().int().positive(),
  description: z.string().trim().min(3).max(1000),
  payee_payer_name: z.string().trim().max(255).nullable().optional(),
  reference: z.string().trim().max(255).nullable().optional(),
  payment_method: z.string().trim().max(100).nullable().optional(),
  expected_bank_account_id: z.string().uuid().nullable().optional(),
  requires_bank_match: z.coerce.boolean().optional(),
  duplicate_override_reason: z.string().trim().max(500).nullable().optional(),
  lines: z.array(transactionLineSchema).min(1),
});

export const updateManualTransactionSchema = manualTransactionSchema.extend({
  id: z.string().uuid(),
});

export const transitionSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export const confirmMatchSchema = z.object({
  manualTransactionId: z.string().uuid(),
  bankLineId: z.string().uuid(),
});

export const rejectMatchSchema = z.object({
  matchId: z.string().uuid(),
});

export function validateLineTotals(input: z.infer<typeof manualTransactionSchema>): string | null {
  const lineTotal = input.lines.reduce((sum, line) => sum + line.amount_pence, 0);

  if (input.type === 'transfer' || input.type === 'adjustment') {
    const incoming = input.lines
      .filter((line) => line.direction === 'in')
      .reduce((sum, line) => sum + line.amount_pence, 0);
    const outgoing = input.lines
      .filter((line) => line.direction === 'out')
      .reduce((sum, line) => sum + line.amount_pence, 0);

    if (incoming !== outgoing) {
      return 'Transfer and adjustment lines must balance incoming and outgoing amounts.';
    }
    if (incoming !== input.amount_pence) {
      return 'Balanced transfer/adjustment lines must equal the transaction amount.';
    }
    return null;
  }

  if (lineTotal !== input.amount_pence) {
    return 'Split line amounts must equal the transaction amount.';
  }

  return null;
}

export function validateFundRequirements(input: z.infer<typeof manualTransactionSchema>): string | null {
  if (input.type !== 'income' && input.type !== 'expense') return null;
  if (input.lines.some((line) => !line.fund_id)) {
    return 'Income and expense transaction lines must include a fund.';
  }
  return null;
}

export function defaultRequiresBankMatch(type: z.infer<typeof transactionTypeSchema>): boolean {
  return type !== 'adjustment';
}
