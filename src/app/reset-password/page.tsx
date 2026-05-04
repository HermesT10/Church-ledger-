'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { CheckCircle2, Lock, ShieldAlert } from 'lucide-react';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

type ResetState = 'checking' | 'ready' | 'invalid' | 'updating' | 'success';

const INVALID_RESET_LINK_MESSAGE = 'This password reset link is invalid or has expired. Please request a new one.';
const UPDATE_PASSWORD_ERROR_MESSAGE = 'We could not update your password. Please request a new reset link and try again.';
const PASSWORD_HELP_TEXT = 'Use at least 8 characters. A mix of letters, numbers, and symbols is recommended.';

function cleanAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  const keys = [
    'code',
    'token_hash',
    'type',
    'access_token',
    'refresh_token',
    'expires_in',
    'expires_at',
  ];

  for (const key of keys) {
    url.searchParams.delete(key);
  }

  url.hash = '';

  const query = url.searchParams.toString();
  const nextUrl = `${url.pathname}${query ? `?${query}` : ''}`;
  window.history.replaceState({}, '', nextUrl);
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<ResetState>('checking');
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const markReady = (session: Session | null) => {
      if (!active || !session) return;
      setEmail(session.user.email ?? null);
      setError(null);
      setState('ready');
      cleanAuthParamsFromUrl();
    };

    async function checkRecoverySession() {
      setState('checking');
      setError(null);

      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');
      const type = url.searchParams.get('type');

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!active) return;

        if (error || !data.session) {
          setError(INVALID_RESET_LINK_MESSAGE);
          setState('invalid');
          return;
        }

        markReady(data.session);
        return;
      }

      if (tokenHash && type === 'recovery') {
        const { error } = await supabase.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash,
        });

        if (!active) return;

        if (error) {
          setError(INVALID_RESET_LINK_MESSAGE);
          setState('invalid');
          return;
        }
      }

      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error || !data.session) {
        setError(INVALID_RESET_LINK_MESSAGE);
        setState('invalid');
        return;
      }

      markReady(data.session);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === 'PASSWORD_RECOVERY' && session) {
        markReady(session);
      }
    });

    void checkRecoverySession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);

    if (!password) {
      setError('Password is required.');
      return;
    }

    if (!confirmPassword) {
      setError('Confirm your new password.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setState('updating');

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setError(UPDATE_PASSWORD_ERROR_MESSAGE);
      setState('ready');
      return;
    }

    await supabase.auth.signOut();

    setState('success');

    window.setTimeout(() => {
      router.replace(
        `/login?message=${encodeURIComponent('Password updated successfully. Please sign in with your new password.')}`
      );
    }, 1200);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-7xl items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
          <div className="mb-8 flex items-center gap-3">
            <Logo size={36} />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create a new password</h1>
              <p className="text-sm text-muted-foreground">
                Choose a secure password for your account.
              </p>
            </div>
          </div>

          {state === 'checking' && (
            <div className="rounded-2xl border bg-muted/40 p-6">
              <p className="text-sm text-muted-foreground">Checking your reset link...</p>
            </div>
          )}

          {state === 'invalid' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
                <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-white">
                  <ShieldAlert className="text-amber-600" size={22} />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">Invalid or expired link</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {error ?? INVALID_RESET_LINK_MESSAGE}
                </p>
              </div>

              <Button asChild className="h-11 w-full rounded-lg bg-blue-600 hover:bg-blue-700">
                <Link href="/forgot-password">Request a new reset link</Link>
              </Button>
            </div>
          )}

          {(state === 'ready' || state === 'updating' || state === 'success') && (
            <div className="space-y-6">
              {state === 'success' ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
                  <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-white">
                    <CheckCircle2 className="text-emerald-600" size={22} />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">Password updated</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Your password has been updated successfully. Redirecting you to login...
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Choose your new password</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {email ? `Updating password for ${email}.` : 'Enter your new password below.'}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {PASSWORD_HELP_TEXT}
                    </p>
                  </div>

                  {error && (
                    <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="password">New password</Label>
                      <div className="relative">
                        <Lock
                          size={18}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                        <Input
                          id="password"
                          name="password"
                          type="password"
                          autoComplete="new-password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="At least 8 characters"
                          required
                          minLength={8}
                          disabled={state === 'updating'}
                          className="h-11 rounded-lg border-gray-200 pl-10 focus-visible:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="confirmPassword">Confirm new password</Label>
                      <div className="relative">
                        <Lock
                          size={18}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                        <Input
                          id="confirmPassword"
                          name="confirmPassword"
                          type="password"
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          placeholder="Re-enter your password"
                          required
                          minLength={8}
                          disabled={state === 'updating'}
                          className="h-11 rounded-lg border-gray-200 pl-10 focus-visible:ring-blue-500"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={state === 'updating'}
                      className="h-11 w-full rounded-lg bg-blue-600 hover:bg-blue-700"
                    >
                      {state === 'updating' ? 'Updating password...' : 'Update password'}
                    </Button>
                  </form>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
