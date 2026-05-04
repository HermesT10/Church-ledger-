import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

export function FundBalanceCard({
  name,
  type,
  balance,
  subtitle,
  status,
}: {
  name: string;
  type: string;
  balance: string;
  subtitle?: string;
  status?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{name}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.08em] text-muted-foreground">
              {type}
            </p>
          </div>
          {status ? <StatusBadge status={status} /> : null}
        </div>
        <p className="text-3xl font-bold tracking-tight">{balance}</p>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}
