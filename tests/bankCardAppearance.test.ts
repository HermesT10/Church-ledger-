import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BANK_CARD_THEME,
  getReadableTextColor,
  isBankCardTheme,
  isSafeHexColour,
  resolveBankCardAppearance,
} from '@/lib/banking/cardAppearance';

const bankingHubClient = readFileSync(
  new URL('../src/app/(app)/banking/banking-hub-client.tsx', import.meta.url),
  'utf8'
);
const bankCardAppearanceForm = readFileSync(
  new URL(
    '../src/app/(app)/banking/[bankAccountId]/bank-card-appearance-form.tsx',
    import.meta.url
  ),
  'utf8'
);
const bankAccountDetailPage = readFileSync(
  new URL('../src/app/(app)/banking/[bankAccountId]/page.tsx', import.meta.url),
  'utf8'
);
const bankingActions = readFileSync(
  new URL('../src/lib/banking/actions.ts', import.meta.url),
  'utf8'
);
const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260504082400_bank_card_appearance.sql',
    import.meta.url
  ),
  'utf8'
);

describe('bank card appearance helper', () => {
  it('uses default purple when no valid theme is set', () => {
    const appearance = resolveBankCardAppearance({});

    expect(DEFAULT_BANK_CARD_THEME).toBe('purple');
    expect(appearance.theme).toBe('purple');
    expect(appearance.background).toBe('#7c3aed');
    expect(appearance.foreground).toBe('#ffffff');
  });

  it('resolves selected preset themes safely', () => {
    const appearance = resolveBankCardAppearance({ card_theme: 'teal' });

    expect(isBankCardTheme('teal')).toBe(true);
    expect(appearance.theme).toBe('teal');
    expect(appearance.background).toBe('#0f766e');
  });

  it('rejects invalid themes and unsafe custom colours', () => {
    expect(isBankCardTheme('url(javascript:alert(1))')).toBe(false);
    expect(isSafeHexColour('#7c3aed')).toBe(true);
    expect(isSafeHexColour('linear-gradient(red, blue)')).toBe(false);
    expect(resolveBankCardAppearance({ card_theme: 'bad' }).theme).toBe(
      'purple'
    );
  });

  it('chooses readable text for light and dark custom colours', () => {
    expect(getReadableTextColor('#ffffff')).toBe('#111827');
    expect(getReadableTextColor('#111827')).toBe('#ffffff');
  });
});

describe('bank card appearance UI integration', () => {
  it('renders themed dashboard cards from persisted account fields', () => {
    expect(bankingHubClient).toContain('resolveBankCardAppearance(account)');
    expect(bankingHubClient).toContain(
      'data-bank-card-theme={cardAppearance.theme}'
    );
    expect(bankingHubClient).toContain(
      'backgroundColor: cardAppearance.background'
    );
  });

  it('lets users update and preview card colour from account settings', () => {
    expect(bankAccountDetailPage).toContain('BankCardAppearanceForm');
    expect(bankCardAppearanceForm).toContain('Card appearance');
    expect(bankCardAppearanceForm).toContain(
      'Choose a colour to help identify this bank account.'
    );
    expect(bankCardAppearanceForm).toContain('Preset options');
    expect(bankCardAppearanceForm).toContain('Reset to default');
    expect(bankCardAppearanceForm).toContain(
      'updateBankCardAppearanceFromForm'
    );
  });

  it('persists safe fields and rejects invalid values server-side', () => {
    expect(bankingActions).toContain('isBankCardTheme');
    expect(bankingActions).toContain('isSafeHexColour');
    expect(bankingActions).toContain('card_theme');
    expect(bankingActions).toContain('card_colour');
    expect(migration).toContain('bank_accounts_card_theme_check');
    expect(migration).toContain('bank_accounts_card_colour_hex_check');
  });
});
