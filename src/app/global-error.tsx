'use client';

/**
 * Global error boundary. Catches unhandled errors at the root layout level.
 * This file MUST define its own <html> and <body> because it replaces
 * the root layout when an error occurs.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-8 w-8 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="mt-2 text-sm text-gray-500">
              An unexpected error occurred. Please try again.
            </p>
            {error.digest && (
              <p className="mt-1 font-mono text-xs text-gray-400">
                Error ID: {error.digest}
              </p>
            )}
          </div>
          <button
            onClick={reset}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
