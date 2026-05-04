import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/money/format-money';

/** Legacy wrapper — prefer `MoneyAmount` for new UI (tones + semantics). */
export function FinanceAmount({
  pence,
  type = 'balance',
  className,
  showSign = false,
}: {
  pence: number | null | undefined;
  type?: 'balance' | 'movement' | 'variance';
  className?: string;
  showSign?: boolean;
}) {
  if (pence == null) {
    return <span className={cn('text-muted-foreground', className)}>Not linked</span>;
  }

  const isPositive = pence > 0;
  const tone =
    type === 'movement'
      ? isPositive
        ? 'text-success'
        : 'text-foreground'
      : type === 'variance'
        ? pence === 0
          ? 'text-success'
          : 'text-warning'
        : 'text-foreground';
  const text = formatMoney(pence, { showPlusForPositive: showSign && isPositive });

  return (
    <span className={cn('font-mono tabular-nums', tone, className)}>
      {text}
    </span>
  );
}
