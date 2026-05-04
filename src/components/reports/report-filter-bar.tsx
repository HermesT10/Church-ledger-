import { cn } from "@/lib/utils";

export function ReportFilterBar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]",
        className,
      )}
    >
      {children}
    </div>
  );
}
