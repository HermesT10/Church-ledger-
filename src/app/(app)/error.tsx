'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Error boundary for the authenticated app shell.
 * Catches errors in any page under (app)/ and shows a
 * friendly recovery UI inside the existing sidebar layout.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-6 flex items-start justify-center min-h-[60vh]">
      <Card className="max-w-lg w-full rounded-2xl shadow-sm mt-12">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-7 w-7 text-red-600"
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
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            An error occurred while loading this page. You can try again or
            navigate to another section.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          {error.digest && (
            <p className="font-mono text-xs text-muted-foreground">
              Error ID: {error.digest}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => window.history.back()}>
              Go Back
            </Button>
            <Button onClick={reset}>Try Again</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
