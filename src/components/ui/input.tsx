import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-slate-400 selection:bg-primary selection:text-primary-foreground border-slate-200/90 h-9 w-full min-w-0 rounded-xl border bg-white px-3 py-1 text-base text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[color,box-shadow,border-color,background-color] outline-none hover:border-slate-300 hover:bg-slate-50/40 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-primary/30 focus-visible:ring-primary/15 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
