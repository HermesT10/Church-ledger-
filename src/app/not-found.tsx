import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Custom 404 page shown when a route doesn't exist.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
        <span className="text-4xl font-bold text-muted-foreground">404</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you are looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
        <Button asChild>
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </main>
  );
}
