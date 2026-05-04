import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function TrusteeSummaryCard({
  title = "Trustee Summary",
  summary,
  bullets,
}: {
  title?: string;
  summary: string;
  bullets: string[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-foreground">{summary}</p>
        <div className="space-y-2">
          {bullets.map((item) => (
            <div
              key={item}
              className="rounded-xl border border-border/70 bg-surface-muted px-3 py-2 text-sm text-muted-foreground"
            >
              {item}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
