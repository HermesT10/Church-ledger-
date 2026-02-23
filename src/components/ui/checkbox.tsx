'use client';

import * as React from 'react';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', checked, onCheckedChange, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        ref={ref}
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        className={`h-4 w-4 rounded border border-input text-primary focus:ring-1 focus:ring-ring cursor-pointer accent-primary ${className}`}
        {...props}
      />
    );
  }
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
