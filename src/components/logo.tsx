import { cn } from '@/lib/utils';

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * ChurchLedger logo — a church steeple integrated with an open book,
 * rendered in the brand blue-to-violet gradient.
 */
export function Logo({ size = 32, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-label="ChurchLedger logo"
    >
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#logo-grad)" />
      {/* Cross */}
      <rect x="22.5" y="8" width="3" height="14" rx="1.5" fill="white" />
      <rect x="18" y="11.5" width="12" height="3" rx="1.5" fill="white" />
      {/* Steeple roof */}
      <path d="M14 24 L24 17 L34 24 Z" fill="white" opacity="0.9" />
      {/* Building body */}
      <rect x="16" y="24" width="16" height="12" rx="1" fill="white" opacity="0.85" />
      {/* Open book at bottom */}
      <path d="M10 34 Q14 31 24 32 Q34 31 38 34 L38 40 Q34 37 24 38 Q14 37 10 40 Z" fill="white" opacity="0.95" />
      {/* Book spine */}
      <line x1="24" y1="32" x2="24" y2="38" stroke="url(#logo-grad)" strokeWidth="0.8" opacity="0.5" />
    </svg>
  );
}

export function LogoMark({ size = 24, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-label="ChurchLedger"
    >
      <defs>
        <linearGradient id="logo-mark-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      {/* Cross */}
      <rect x="22.5" y="4" width="3" height="16" rx="1.5" fill="url(#logo-mark-grad)" />
      <rect x="17" y="8" width="14" height="3" rx="1.5" fill="url(#logo-mark-grad)" />
      {/* Steeple roof */}
      <path d="M12 24 L24 15 L36 24 Z" fill="url(#logo-mark-grad)" opacity="0.8" />
      {/* Building */}
      <rect x="15" y="24" width="18" height="10" rx="1.5" fill="url(#logo-mark-grad)" opacity="0.6" />
      {/* Open book */}
      <path d="M8 33 Q14 30 24 31 Q34 30 40 33 L40 40 Q34 37 24 38 Q14 37 8 40 Z" fill="url(#logo-mark-grad)" opacity="0.9" />
      <line x1="24" y1="31" x2="24" y2="38" stroke="url(#logo-mark-grad)" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}
