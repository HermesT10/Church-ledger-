import { describe, expect, it } from 'vitest';
import { emptyStringToNull, normaliseOptionalUuid, parseRequiredUuid } from '../src/lib/validation/uuid';

describe('uuid validation helpers', () => {
  it('emptyStringToNull coerces blank to null', () => {
    expect(emptyStringToNull('')).toBeNull();
    expect(emptyStringToNull('  ')).toBeNull();
    expect(emptyStringToNull(undefined)).toBeNull();
    expect(emptyStringToNull(null)).toBeNull();
    expect(emptyStringToNull('  abc  ')).toBe('abc');
  });

  it('parseRequiredUuid rejects empty string', () => {
    const r = parseRequiredUuid('', 'Fund');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Fund');
  });

  it('parseRequiredUuid accepts lowercase uuid', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const r = parseRequiredUuid(id, 'x');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.uuid).toBe(id);
  });

  it('normaliseOptionalUuid maps blank to null', () => {
    const r = normaliseOptionalUuid('', 'Donor');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.uuid).toBeNull();
  });

  it('normaliseOptionalUuid rejects invalid token', () => {
    const r = normaliseOptionalUuid('not-uuid', 'Donor');
    expect(r.ok).toBe(false);
  });
});

describe('budget_lines upsert migration', () => {
  it('defines unique nulls not distinct constraint for onConflict target', async () => {
    const { readFileSync } = await import('node:fs');
    const m = readFileSync(
      new URL('../supabase/migrations/20260503130000_budget_lines_upsert_unique.sql', import.meta.url),
      'utf8',
    );
    expect(m).toContain('uq_budget_lines_budget_account_fund');
    expect(m.toLowerCase()).toContain('unique nulls not distinct');
    expect(m).toContain('budget_id');
    expect(m).toContain('account_id');
    expect(m).toContain('fund_id');
  });
});

describe('cash collection create hardening', () => {
  it('imports uuid helpers in cash actions', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/lib/cash/actions.ts', import.meta.url), 'utf8');
    expect(src).toContain("from '@/lib/validation/uuid'");
    expect(src).toContain('parseRequiredUuid');
    expect(src).toContain('normalisedLines');
  });
});
