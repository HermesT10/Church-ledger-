import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-5xl font-bold tracking-tight">ChurchLedger</h1>
      <p className="text-lg text-muted-foreground">
        Simple, transparent church accounting.
      </p>
      <Button asChild size="lg">
        <Link href="/login">Get Started</Link>
      </Button>
    </main>
  );
}
