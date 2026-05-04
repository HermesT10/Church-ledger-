import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ReportSummaryCard({
  title,
  description,
  href,
  icon: Icon,
  accentClassName,
}: {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  accentClassName?: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full rounded-2xl border-border/70 bg-card shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-soft">
        <CardContent className="flex h-full items-start gap-4 p-5">
          <div
            className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground",
              accentClassName,
            )}
          >
            <Icon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
              {title}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
          <ChevronRight
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          />
        </CardContent>
      </Card>
    </Link>
  );
}
