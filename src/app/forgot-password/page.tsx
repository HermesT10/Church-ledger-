'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

type Status = 'idle' | 'submitting' | 'success';

const GENERIC_SUCCESS_MESSAGE = 'If an account exists for this email, we’ve sent a password reset link.';
const GENERIC_ERROR_MESSAGE = 'We could not send a reset link right now. Please wait a moment and try again.';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getResetRedirectUrl() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
  const origin = configuredSiteUrl || window.location.origin;
  return `${origin}/reset-password`;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Enter your email address.');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    setError(null);
    setStatus('submitting');

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: getResetRedirectUrl(),
    });

    if (error) {
      setError(GENERIC_ERROR_MESSAGE);
      setStatus('idle');
      return;
    }

    setStatus('success');
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-7xl items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
          <div className="mb-8 flex items-center gap-3">
            <Logo size={36} />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
              <p className="text-sm text-muted-foreground">
                Enter your email and we’ll send you a secure reset link.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {status === 'success' ? (
            <div className="space-y-6">
              <div className="rounded-2xl border bg-primary/5 p-6">
                <p className="text-sm text-gray-700">
                  {GENERIC_SUCCESS_MESSAGE}
                </p>
              </div>

              <Button asChild className="h-11 w-full rounded-lg bg-blue-600 hover:bg-blue-700">
                <Link href="/login">Back to login</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="h-11 rounded-lg border-gray-200 pl-10 focus-visible:ring-blue-500"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={status === 'submitting'}
                className="h-11 w-full rounded-lg bg-blue-600 hover:bg-blue-700"
              >
                {status === 'submitting' ? 'Sending reset link...' : 'Send reset link'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="inline-flex items-center gap-2 hover:underline">
                  <ArrowLeft size={14} />
                  Back to login
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
