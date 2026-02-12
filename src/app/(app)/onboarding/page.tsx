'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { onboard } from './actions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function OnboardingForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to ChurchLedger</CardTitle>
          <CardDescription>
            Let&apos;s set up your church to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <form className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Organisation Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="My Church"
                defaultValue="My Church"
                required
              />
            </div>
            <Button formAction={onboard}>Create &amp; Continue</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingForm />
    </Suspense>
  );
}
