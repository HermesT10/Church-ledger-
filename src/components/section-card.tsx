import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b border-border/60 pb-4">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? (
          <CardDescription className="max-w-2xl leading-6">
            {description}
          </CardDescription>
        ) : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className={cn("pt-5", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
