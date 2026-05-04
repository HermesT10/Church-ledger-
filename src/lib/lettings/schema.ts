import { z } from 'zod';

/** Keep in sync with `createLettingsCharge` payload. */
export const lettingsChargeInputSchema = z.object({
  hirerId: z.string().uuid(),
  periodYear: z.number().int().min(2000).max(2200),
  periodMonth: z.number().int().min(1).max(12),
  description: z.string().trim().max(500).optional().nullable(),
  expectedAmountPence: z.number().int().nonnegative(),
  dueDate: z.string().trim().optional().nullable(),
  defaultFundId: z.string().uuid('Select a fund for this charge.'),
  defaultIncomeAccountId: z.string().uuid('Select an income account.'),
});
