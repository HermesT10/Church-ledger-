import { Badge } from "@/components/ui/badge";

const STATUS_VARIANTS: Record<
  string,
  { className: string; label?: string }
> = {
  draft: { className: "border-info/20 bg-info-soft text-info" },
  approved: { className: "border-info/20 bg-info-soft text-info" },
  submitted: { className: "border-info/20 bg-info-soft text-info" },
  processing: { className: "border-info/20 bg-info-soft text-info" },
  uploaded: { className: "border-info/20 bg-info-soft text-info" },
  pending: { className: "border-info/20 bg-info-soft text-info" },
  posted: { className: "border-success/20 bg-success-soft text-success" },
  reconciled: { className: "border-success/20 bg-success-soft text-success" },
  matched: { className: "border-success/20 bg-success-soft text-success" },
  paid: { className: "border-success/20 bg-success-soft text-success" },
  complete: { className: "border-success/20 bg-success-soft text-success" },
  active: { className: "border-success/20 bg-success-soft text-success" },
  unmatched: { className: "border-warning/20 bg-warning-soft text-warning" },
  suggested_match: { className: "border-warning/20 bg-warning-soft text-warning", label: "Suggested" },
  needs_review: { className: "border-warning/20 bg-warning-soft text-warning", label: "Needs review" },
  stale: { className: "border-warning/20 bg-warning-soft text-warning" },
  overspent: { className: "border-warning/20 bg-warning-soft text-warning" },
  warning: { className: "border-warning/20 bg-warning-soft text-warning" },
  failed: { className: "border-danger/20 bg-danger-soft text-danger" },
  error: { className: "border-danger/20 bg-danger-soft text-danger" },
  conflict: { className: "border-danger/20 bg-danger-soft text-danger" },
  duplicate: { className: "border-danger/20 bg-danger-soft text-danger" },
  archived: { className: "border-border bg-surface-muted text-muted-foreground" },
  inactive: { className: "border-border bg-surface-muted text-muted-foreground" },
  excluded: { className: "border-border bg-surface-muted text-muted-foreground" },
};

function startCase(value: string): string {
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const preset = STATUS_VARIANTS[status] ?? {
    className: "border-border bg-surface-muted text-foreground",
  };

  return (
    <Badge
      variant="outline"
      className={[preset.className, className].filter(Boolean).join(" ")}
    >
      {label ?? preset.label ?? startCase(status)}
    </Badge>
  );
}
