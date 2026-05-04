"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SearchInput({
  className,
  iconClassName,
  ...props
}: React.ComponentProps<typeof Input> & {
  iconClassName?: string;
}) {
  return (
    <div className={cn("relative w-full", className)}>
      <Search
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground",
          iconClassName,
        )}
      />
      <Input className="pl-10" {...props} />
    </div>
  );
}
