export const BANK_CARD_THEME_KEYS = [
  'purple',
  'blue',
  'green',
  'teal',
  'orange',
  'pink',
  'slate',
  'black',
] as const;

export type BankCardTheme = (typeof BANK_CARD_THEME_KEYS)[number];

export interface BankCardThemeDefinition {
  label: string;
  background: string;
  foreground: '#ffffff' | '#111827';
}

export const DEFAULT_BANK_CARD_THEME: BankCardTheme = 'purple';

export const BANK_CARD_THEMES: Record<BankCardTheme, BankCardThemeDefinition> =
  {
    purple: { label: 'Purple', background: '#7c3aed', foreground: '#ffffff' },
    blue: { label: 'Blue', background: '#2563eb', foreground: '#ffffff' },
    green: { label: 'Green', background: '#15803d', foreground: '#ffffff' },
    teal: { label: 'Teal', background: '#0f766e', foreground: '#ffffff' },
    orange: { label: 'Orange', background: '#c2410c', foreground: '#ffffff' },
    pink: { label: 'Pink', background: '#be185d', foreground: '#ffffff' },
    slate: { label: 'Slate', background: '#334155', foreground: '#ffffff' },
    black: { label: 'Black', background: '#111827', foreground: '#ffffff' },
  };

const HEX_COLOUR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isBankCardTheme(value: unknown): value is BankCardTheme {
  return (
    typeof value === 'string' &&
    BANK_CARD_THEME_KEYS.includes(value as BankCardTheme)
  );
}

export function isSafeHexColour(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOUR_PATTERN.test(value.trim());
}

function hexChannel(hex: string, start: number): number {
  return Number.parseInt(hex.slice(start, start + 2), 16);
}

export function getReadableTextColor(
  backgroundColor: string
): '#ffffff' | '#111827' {
  if (!isSafeHexColour(backgroundColor)) return '#ffffff';

  const normalized = backgroundColor.trim();
  const red = hexChannel(normalized, 1);
  const green = hexChannel(normalized, 3);
  const blue = hexChannel(normalized, 5);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.62 ? '#111827' : '#ffffff';
}

export interface BankCardAppearanceInput {
  card_theme?: string | null;
  card_colour?: string | null;
}

export interface ResolvedBankCardAppearance {
  theme: BankCardTheme;
  label: string;
  background: string;
  foreground: '#ffffff' | '#111827';
  isCustom: boolean;
}

export function resolveBankCardAppearance(
  input: BankCardAppearanceInput
): ResolvedBankCardAppearance {
  const theme = isBankCardTheme(input.card_theme)
    ? input.card_theme
    : DEFAULT_BANK_CARD_THEME;
  const preset = BANK_CARD_THEMES[theme];
  const customColour = input.card_colour?.trim();

  if (isSafeHexColour(customColour)) {
    return {
      theme,
      label: 'Custom',
      background: customColour,
      foreground: getReadableTextColor(customColour),
      isCustom: true,
    };
  }

  return {
    theme,
    label: preset.label,
    background: preset.background,
    foreground: preset.foreground,
    isCustom: false,
  };
}
