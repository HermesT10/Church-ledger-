import Link from 'next/link';
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SummaryMetricCard({
  label,
  value,
  helper,
  className,
  href,
}: {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
  className?: string;
  href?: string;
}) {
  const content = (
    <Card className={cn("h-full", className)}>
      <CardContent className="space-y-2 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <div className="text-2xl font-bold tracking-tight text-foreground">{value}</div>
        {helper ? <div className="text-sm text-muted-foreground">{helper}</div> : null}
      </CardContent>
    </Card>
  );

  if (!href) {
    return content;
  }

  return (
    <Link className="block h-full transition-opacity hover:opacity-95" href={href}>
      {content}
    </Link>
  );
}
