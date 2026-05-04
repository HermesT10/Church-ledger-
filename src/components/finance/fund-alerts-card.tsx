import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function FundAlertsCard({
  items,
}: {
  items: Array<{ id: string; title: string; body: string; href?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Fund Alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-border/70 bg-success-soft px-4 py-6 text-sm text-foreground">
            No restricted or designated fund alerts right now.
          </div>
        ) : (
          items.map((item) => {
            const content = (
              <div className="rounded-xl border border-amber-200/70 bg-warning-soft px-4 py-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                  </div>
                </div>
              </div>
            );
            return item.href ? <Link key={item.id} href={item.href}>{content}</Link> : <div key={item.id}>{content}</div>;
          })
        )}
      </CardContent>
    </Card>
  );
}
