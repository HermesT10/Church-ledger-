import { cn } from "@/lib/utils";

export function FilterBar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card p-3 shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FilterBarLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("px-1 text-xs font-semibold text-muted-foreground", className)}>
      {children}
    </span>
  );
}
