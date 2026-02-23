'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { onboard } from './actions';
import { Button } from '@/components/ui/button';
import { SoftAlert } from '@/components/soft-alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/logo';

interface Props {
  defaultOrgName: string;
  defaultCity: string;
  defaultRole: string;
}

function FormInner({ defaultOrgName, defaultCity, defaultRole }: Props) {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md rounded-2xl border shadow-sm bg-white/70 border-slate-200/40">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <Logo size={48} />
          </div>
          <CardTitle className="text-2xl">Welcome to ChurchLedger</CardTitle>
          <CardDescription>
            Confirm your church details to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4">
              <SoftAlert variant="error">{error}</SoftAlert>
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
                defaultValue={defaultOrgName || 'My Church'}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="city">City / Location</Label>
              <Input
                id="city"
                name="city"
                type="text"
                placeholder="London"
                defaultValue={defaultCity}
              />
            </div>
            <input type="hidden" name="role" value={defaultRole} />
            <Button formAction={onboard}>Create &amp; Continue</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

export function OnboardingForm(props: Props) {
  return (
    <Suspense>
      <FormInner {...props} />
    </Suspense>
  );
}
