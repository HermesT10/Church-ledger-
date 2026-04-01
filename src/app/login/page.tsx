'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { login } from './actions';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Landmark,
  Plus,
} from 'lucide-react';
import { Logo } from '@/components/logo';

/* ------------------------------------------------------------------ */
/*  Google SVG icon (unchanged from original)                          */
/* ------------------------------------------------------------------ */

function GoogleIcon() {
  return (
    <svg className="mr-2 size-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Left Panel -- Brand Showcase                                       */
/* ------------------------------------------------------------------ */

function BrandShowcase() {
  return (
    <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100 p-10 relative overflow-hidden min-h-screen">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <Logo size={36} />
        <span className="text-xl font-bold text-gray-800">ChurchLedger</span>
      </div>

      {/* Floating feature cards */}
      <div className="flex-1 flex items-center justify-center py-10">
        <div className="relative w-[320px] h-[380px]">
          {/* Card 1 -- Current Balance */}
          <div className="absolute top-0 left-0 bg-white rounded-2xl shadow-lg p-5 w-[220px] border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Landmark size={20} className="text-blue-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Current Balance
              </span>
            </div>
            <p className="text-2xl font-bold text-blue-600">£24,359</p>
          </div>

          {/* Card 2 -- Fund Allocation */}
          <div className="absolute top-[100px] right-0 bg-white rounded-2xl shadow-lg p-5 w-[180px] border border-gray-100">
            <div className="flex items-center justify-center mb-2">
              <div className="relative w-20 h-20">
                <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    strokeDasharray="65 35"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="3"
                    strokeDasharray="20 80"
                    strokeDashoffset="-65"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3"
                    strokeDasharray="15 85"
                    strokeDashoffset="-85"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold text-gray-800">65%</span>
                  <span className="text-[10px] text-gray-500">General</span>
                </div>
              </div>
            </div>
            <p className="text-center text-xs font-medium text-gray-500">
              Fund Allocation
            </p>
          </div>

          {/* Card 3 -- New Journal Entry */}
          <div className="absolute bottom-0 left-[30px] bg-white rounded-2xl shadow-lg p-5 w-[200px] border border-gray-100 border-dashed">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
                <Plus size={20} />
              </div>
              <span className="text-sm font-medium text-gray-700">
                New Journal Entry
              </span>
              <span className="text-xs text-gray-400">
                or import .csv file
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom text */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800">Welcome back!</h2>
        <p className="text-gray-500 mt-1">
          Simple, transparent church accounting.
        </p>
        <p className="text-gray-400 text-sm mt-0.5">
          Manage funds, budgets, and reports with confidence.
        </p>

        {/* Decorative dots */}
        <div className="flex items-center gap-2 mt-6">
          <div className="w-2 h-2 rounded-full bg-gray-300" />
          <div className="w-2 h-2 rounded-full bg-gray-300" />
          <div className="w-2.5 h-2.5 rounded-full bg-gray-800" />
          <div className="w-2 h-2 rounded-full bg-gray-300" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Right Panel -- Login Form                                          */
/* ------------------------------------------------------------------ */

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
    <div className="flex flex-col min-h-screen">
      {/* Mobile-only header */}
      <div className="lg:hidden bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-8 text-center">
        <div className="flex items-center justify-center gap-2.5 mb-2">
          <Logo size={32} />
          <span className="text-lg font-bold text-gray-800">ChurchLedger</span>
        </div>
        <p className="text-sm text-gray-500">
          Simple, transparent church accounting.
        </p>
      </div>

      {/* Form area */}
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[400px] rounded-[1.75rem] border border-border/70 bg-card/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-md space-y-6">
          {/* Heading */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome back!</h1>
            <p className="text-sm text-gray-500 mt-1">
              Start managing your church finances faster and better
            </p>
          </div>

          {/* Error / message banners */}
          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-lg bg-primary/10 px-4 py-3 text-sm text-primary">
              {message}
            </div>
          )}

          {/* Form */}
          <form className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  className="pl-10 h-11 rounded-lg border-gray-200 focus-visible:ring-blue-500"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  className="pl-10 pr-10 h-11 rounded-lg border-gray-200 focus-visible:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Sign In button */}
            <Button
              formAction={login}
              className="w-full h-11 rounded-xl"
            >
              Login
            </Button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center gap-4">
            <Separator className="flex-1" />
            <span className="text-xs text-gray-400 uppercase">or</span>
            <Separator className="flex-1" />
          </div>

          {/* Google */}
          <Button
            variant="outline"
            onClick={handleGoogleLogin}
            type="button"
            className="w-full h-11 rounded-xl font-medium text-sm"
          >
            <GoogleIcon />
            Google
          </Button>

          {/* Sign up prompt */}
          <p className="text-center text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-blue-600 font-semibold hover:underline">
              Sign Up
            </Link>
          </p>

          {/* Back to home */}
          <p className="text-center text-xs text-gray-400">
            <Link href="/" className="hover:text-gray-600 hover:underline">
              Back to Home
            </Link>
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="py-4 text-center text-xs text-gray-400">
        &copy; {new Date().getFullYear()} ChurchLedger. All rights reserved.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LoginPage() {
  return (
    <Suspense>
      <main className="flex min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_30%),linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.96))]">
        {/* Left -- Brand Showcase (hidden on mobile) */}
        <div className="hidden lg:block lg:w-1/2">
          <BrandShowcase />
        </div>

        {/* Right -- Login Form */}
        <div className="w-full lg:w-1/2 bg-transparent">
          <LoginForm />
        </div>
      </main>
    </Suspense>
  );
}
