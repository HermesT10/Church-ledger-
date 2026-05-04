import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/money/format-money';
import { getMoneyTone, moneyToneClass } from '@/lib/money/money-tone';
import type { MoneyDirection, MoneySemantic, MoneySize } from '@/lib/money/types';

const SIZE_CLASS: Record<MoneySize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

export type MoneyAmountProps = {
  /** Signed amount in pence. */
  amountPence: number | null | undefined;
  direction?: MoneyDirection;
  semantic?: MoneySemantic;
  showSign?: boolean;
  currency?: 'GBP';
  className?: string;
  size?: MoneySize;
  /** When true, use warning tone (e.g. data quality). */
  forceWarning?: boolean;
  /** null/undefined renders em dash */
  emptyLabel?: string;
  /** Use neutral foreground for raw debit/credit cells; `auto` applies success/danger rules. */
  toneMode?: 'auto' | 'neutral';
};

export function MoneyAmount({
  amountPence,
  direction,
  semantic,
  showSign = false,
  currency = 'GBP',
  className,
  size = 'sm',
  forceWarning,
  emptyLabel = '—',
  toneMode = 'auto',
}: MoneyAmountProps) {
  if (amountPence == null || Number.isNaN(amountPence)) {
    return <span className={cn('text-muted-foreground', SIZE_CLASS[size], className)}>{emptyLabel}</span>;
  }

  const tone =
    toneMode === 'neutral' && !forceWarning
      ? 'neutral'
      : getMoneyTone(amountPence, { direction, semantic, forceWarning });
  const text = formatMoney(amountPence, {
    currency,
    showPlusForPositive: showSign && amountPence > 0,
  });

  return (
    <span className={cn('font-mono tabular-nums', moneyToneClass(tone), SIZE_CLASS[size], className)}>{text}</span>
  );
}
