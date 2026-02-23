'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Value between 0 and 100 representing completion percentage. */
  value?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => {
    const clampedValue = Math.max(0, Math.min(100, value));

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          'relative h-2 w-full overflow-hidden rounded-full bg-primary/20',
          className,
        )}
        {...props}
      >
        <div
          className="h-full bg-primary transition-all duration-500 ease-in-out rounded-full"
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    );
  },
);

Progress.displayName = 'Progress';

export { Progress };
