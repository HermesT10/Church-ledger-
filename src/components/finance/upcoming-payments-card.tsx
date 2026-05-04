import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PaymentRow {
  id: string;
  title: string;
  amount: string;
  dueLabel: string;
  href?: string;
}

export function UpcomingPaymentsCard({
  title = "Upcoming Payments",
  items,
}: {
  title?: string;
  items: PaymentRow[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            No scheduled payments for the selected period.
          </div>
        ) : (
          items.map((item) =>
            item.href ? (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3 transition-colors hover:bg-surface-muted"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.dueLabel}</p>
                </div>
                <span className="text-sm font-semibold">{item.amount}</span>
              </Link>
            ) : (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.dueLabel}</p>
                </div>
                <span className="text-sm font-semibold">{item.amount}</span>
              </div>
            ),
          )
        )}
      </CardContent>
    </Card>
  );
}
