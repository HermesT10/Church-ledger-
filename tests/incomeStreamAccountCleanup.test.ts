import { describe, expect, it } from 'vitest';
import { lettingsChargeInputSchema } from '../src/lib/lettings/schema';

const validBase = {
  hirerId: '123e4567-e89b-12d3-a456-426614174000',
  periodYear: 2026,
  periodMonth: 5,
  description: 'Test',
  expectedAmountPence: 10000,
  dueDate: null as string | null,
  defaultFundId: '223e4567-e89b-12d3-a456-426614174001',
  defaultIncomeAccountId: '323e4567-e89b-12d3-a456-426614174002',
};

describe('lettingsChargeInputSchema', () => {
  it('accepts charge payload with fund and income account', () => {
    const r = lettingsChargeInputSchema.safeParse(validBase);
    expect(r.success).toBe(true);
  });

  it('rejects missing fund', () => {
    const r = lettingsChargeInputSchema.safeParse({ ...validBase, defaultFundId: '' });
    expect(r.success).toBe(false);
  });

  it('rejects missing income account', () => {
    const r = lettingsChargeInputSchema.safeParse({ ...validBase, defaultIncomeAccountId: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });
});
