'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Landmark, Lock, Mail, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Logo } from '@/components/logo';
import { login } from './actions';

function GoogleIcon() {
  return (
    <svg className="mr-2 size-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function AuthShowcase() {
  return (
    <aside className="relative hidden min-h-screen overflow-hidden bg-foreground p-10 text-background lg:flex lg:w-[52%] lg:flex-col">
      <div className="absolute -left-32 top-20 h-80 w-80 rounded-full bg-primary/40 blur-3xl" />
      <div className="absolute -right-24 bottom-12 h-96 w-96 rounded-full bg-info/20 blur-3xl" />
      <Link href="/" className="relative z-10 flex items-center gap-3">
        <Logo size={40} />
        <span className="text-xl font-bold">ChurchLedger</span>
      </Link>

      <div className="relative z-10 flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-[520px] rounded-[2.5rem] border border-background/10 bg-background/5 p-8 shadow-modal backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-background/45">
            Welcome back
          </p>
          <h1 className="mt-4 max-w-sm text-5xl font-black tracking-[-0.07em]">
            Finally a calmer way to run church finance.
          </h1>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            <div className="rounded-3xl bg-background p-5 text-foreground">
              <div className="flex items-center justify-between">
                <Landmark className="text-primary" size={22} />
                <span className="text-xs text-muted-foreground">Cash</span>
              </div>
              <p className="mt-8 text-3xl font-bold">£24,359</p>
              <p className="mt-1 text-xs text-success">Reconciled this month</p>
            </div>
            <div className="landing-float rounded-3xl border border-background/10 bg-background/10 p-5">
              <TrendingUp size={22} />
              <p className="mt-8 text-2xl font-bold">Trustee pack</p>
              <p className="mt-1 text-xs text-background/50">Ready for review</p>
            </div>
            <div className="sm:col-span-2 rounded-3xl border border-background/10 bg-background/10 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold">Secure role-based access</p>
                  <p className="text-xs text-background/50">Treasurer, trustee, finance user, and auditor views.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 flex items-center gap-3 text-sm text-background/70">
            <Sparkles size={16} className="text-primary" />
            Built for transparent stewardship and clear handovers.
          </div>
        </div>
      </div>
    </aside>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const message = searchParams.get('message');
  const [showPassword, setShowPassword] = useState(false);

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <section className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden px-5 py-10 sm:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,color-mix(in_srgb,var(--primary)_16%,transparent),transparent_32%),radial-gradient(circle_at_80%_80%,color-mix(in_srgb,var(--chart-2)_12%,transparent),transparent_30%)]" />
      <div className="relative z-10 w-full max-w-[440px]">
        <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
          <Logo size={38} />
          <span className="text-xl font-bold">ChurchLedger</span>
        </div>

        <div className="rounded-[2rem] border border-border/70 bg-card/90 p-6 shadow-modal backdrop-blur sm:p-8">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Sign in</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.06em]">Welcome back</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Pick up your funds, reports, and reconciliations where you left off.
            </p>
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {message && (
            <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
              {message}
            </div>
          )}

          <form className="mt-7 space-y-4">
            <div className="relative">
              <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                className="h-12 rounded-2xl pl-11"
              />
            </div>

            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                required
                minLength={6}
                className="h-12 rounded-2xl pl-11 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                Forgot password?
              </Link>
            </div>

            <Button formAction={login} className="h-12 w-full rounded-2xl text-base shadow-card">
              Log in
            </Button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <Separator className="flex-1" />
            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          <Button
            variant="outline"
            onClick={handleGoogleLogin}
            type="button"
            className="h-12 w-full rounded-2xl bg-background/70 font-medium"
          >
            <GoogleIcon />
            Continue with Google
          </Button>

          <p className="mt-7 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-semibold text-primary hover:underline">
              Sign up
            </Link>
          </p>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            <Link href="/" className="hover:text-foreground hover:underline">
              Back to home
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <main className="flex min-h-screen bg-background">
        <AuthShowcase />
        <LoginForm />
      </main>
    </Suspense>
  );
}
