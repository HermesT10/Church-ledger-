import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

export function BudgetVsActualCard({
  title = "Budget vs Actual",
  budget,
  actual,
  variance,
  status,
}: {
  title?: string;
  budget: string;
  actual: string;
  variance: string;
  status?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{title}</CardTitle>
          {status ? <StatusBadge status={status} /> : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Budget</p>
          <p className="mt-1 text-xl font-semibold">{budget}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Actual</p>
          <p className="mt-1 text-xl font-semibold">{actual}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Variance</p>
          <p className="mt-1 text-xl font-semibold">{variance}</p>
        </div>
      </CardContent>
    </Card>
  );
}
