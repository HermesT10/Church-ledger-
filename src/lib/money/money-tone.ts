import type { MoneyDirection, MoneySemantic, MoneyTone } from './types';

export type MoneyToneContext = {
  direction?: MoneyDirection;
  semantic?: MoneySemantic;
  /** When set, forces warning tone (overrides amount-based). */
  forceWarning?: boolean;
};

const ZERO = 0;

/**
 * Maps amount + optional UI role to a display tone for Tailwind/theme classes.
 * Default: positive pence → green, negative → red, zero → neutral.
 */
export function getMoneyTone(amountPence: number, context?: MoneyToneContext): MoneyTone {
  if (context?.forceWarning) return 'warning';

  if (context?.direction === 'transfer') return 'transfer';

  if (context?.semantic === 'income' || context?.direction === 'income' || context?.direction === 'money_in') {
    if (amountPence === ZERO) return 'neutral';
    return 'positive';
  }

  if (context?.semantic === 'expense' || context?.direction === 'expense' || context?.direction === 'money_out') {
    if (amountPence === ZERO) return 'neutral';
    return 'negative';
  }

  if (context?.semantic === 'ledger_net') {
    if (amountPence === ZERO) return 'neutral';
    return amountPence > ZERO ? 'positive' : 'negative';
  }

  if (context?.semantic === 'negative_bad') return amountPence <= ZERO ? 'negative' : 'positive';
  if (context?.semantic === 'positive_good') return amountPence >= ZERO ? 'positive' : 'negative';

  if (amountPence === ZERO) return 'neutral';
  if (amountPence > ZERO) return 'positive';
  return 'negative';
}

/** Tailwind classes aligned with design tokens (success / danger / muted). */
export function moneyToneClass(tone: MoneyTone): string {
  switch (tone) {
    case 'positive':
      return 'text-success';
    case 'negative':
      return 'text-danger';
    case 'transfer':
      return 'text-info';
    case 'warning':
      return 'text-warning';
    default:
      return 'text-muted-foreground';
  }
}
