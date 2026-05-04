import { z } from 'zod';

export const ACCOUNT_TYPES_Z = z.enum([
  'income',
  'expense',
  'asset',
  'liability',
  'fund_balance',
  'equity',
]);

export const createAccountSchema = z.object({
  code: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  type: ACCOUNT_TYPES_Z,
  reporting_category: z.string().max(160).nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  subtype: z.string().max(80).nullable().optional(),
  normal_balance: z.enum(['debit', 'credit']).nullable().optional(),
  available_in_reconciliation: z.boolean().optional(),
  available_in_donations: z.boolean().optional(),
  available_in_invoices: z.boolean().optional(),
  available_in_payroll: z.boolean().optional(),
  default_fund_id: z.string().uuid().nullable().optional(),
});

export const updateAccountSchema = createAccountSchema.extend({
  id: z.string().uuid(),
});

export const mergeAccountsSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
});
