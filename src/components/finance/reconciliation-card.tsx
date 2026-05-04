import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ReconciliationCard({
  title,
  value,
  helper,
  href,
}: {
  title: string;
  value: string;
  helper: string;
  href?: string;
}) {
  const content = (
    <Card className="h-full">
      <CardContent className="flex h-full items-start justify-between gap-3 p-5">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
          <p className="mt-2 text-sm text-muted-foreground">{helper}</p>
        </div>
        {href ? <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" /> : null}
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}
