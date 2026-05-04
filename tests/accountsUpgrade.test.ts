import { describe, it, expect } from 'vitest';
import { buildAccountCleanupSuggestions } from '@/lib/accounts/cleanup';
import type { AccountRow } from '@/lib/accounts/types';

function makeRow(p: Partial<AccountRow> & Pick<AccountRow, 'id' | 'code' | 'name' | 'type'>): AccountRow {
  return {
    organisation_id: 'o1',
    parent_id: null,
    is_active: true,
    created_at: new Date().toISOString(),
    reporting_category: null,
    ...p,
  };
}

describe('buildAccountCleanupSuggestions', () => {
  it('flags duplicate codes', () => {
    const accounts: AccountRow[] = [
      makeRow({ id: 'a1', code: 'INC-1', name: 'A', type: 'income' }),
      makeRow({ id: 'a2', code: 'inc-1', name: 'B', type: 'income' }),
    ];
    const s = buildAccountCleanupSuggestions(accounts);
    expect(s.some((x) => x.id.startsWith('dup-code'))).toBe(true);
  });

  it('flags missing reporting category', () => {
    const accounts: AccountRow[] = [
      makeRow({
        id: 'a1',
        code: 'X',
        name: 'Only',
        type: 'expense',
        reporting_category: null,
      }),
    ];
    const s = buildAccountCleanupSuggestions(accounts);
    expect(s.some((x) => x.id === 'missing-reporting-category')).toBe(true);
  });
});
