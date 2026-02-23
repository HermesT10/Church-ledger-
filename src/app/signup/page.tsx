'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { signup } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Phone,
  Building2,
  MapPin,
  ShieldCheck,
  Layers,
  Gift,
  TrendingUp,
} from 'lucide-react';
import { Logo } from '@/components/logo';

/* ------------------------------------------------------------------ */
/*  Left Panel — Brand Features                                        */
/* ------------------------------------------------------------------ */

const HIGHLIGHTS = [
  {
    icon: Layers,
    title: 'Fund Management',
    description: 'Track restricted, unrestricted, and designated funds.',
    color: 'bg-emerald-100 text-emerald-600',
  },
  {
    icon: Gift,
    title: 'Gift Aid Tracking',
    description: 'Manage declarations and maximise tax reclaims.',
    color: 'bg-pink-100 text-pink-600',
  },
  {
    icon: TrendingUp,
    title: 'Reports & Compliance',
    description: 'Generate trustee reports and SOFA statements.',
    color: 'bg-violet-100 text-violet-600',
  },
  {
    icon: ShieldCheck,
    title: 'Multi-User Roles',
    description: 'Admin, treasurer, trustee — everyone sees what they need.',
    color: 'bg-blue-100 text-blue-600',
  },
] as const;

function BrandPanel() {
  return (
    <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-100 p-10 relative overflow-hidden min-h-screen">
      <div className="flex items-center gap-2.5">
        <Logo size={36} />
        <span className="text-xl font-bold text-gray-800">ChurchLedger</span>
      </div>

      <div className="flex-1 flex flex-col justify-center py-10 max-w-sm">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Start managing your church finances today
        </h2>
        <p className="text-gray-500 text-sm mb-8">
          Create your free account in under two minutes.
        </p>

        <div className="space-y-4">
          {HIGHLIGHTS.map((h) => {
            const Icon = h.icon;
            return (
              <div key={h.title} className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${h.color}`}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">{h.title}</p>
                  <p className="text-xs text-gray-500">{h.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Free to start &bull; No credit card required
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Right Panel — Signup Form                                          */
/* ------------------------------------------------------------------ */

function SignupForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('admin');

  return (
    <div className="flex flex-col min-h-screen">
      {/* Mobile header */}
      <div className="lg:hidden bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-6 text-center">
        <div className="flex items-center justify-center gap-2.5 mb-1">
          <Logo size={32} />
          <span className="text-lg font-bold text-gray-800">ChurchLedger</span>
        </div>
        <p className="text-sm text-gray-500">Create your free account</p>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-[440px] space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
            <p className="text-sm text-gray-500 mt-1">
              Fill in the details below to get started
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form className="space-y-5">
            {/* ---- Your Details ---- */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Your Details
              </p>
              <div className="space-y-3">
                {/* Full name */}
                <div className="space-y-1.5">
                  <Label htmlFor="full_name">Full Name</Label>
                  <div className="relative">
                    <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      id="full_name"
                      name="full_name"
                      type="text"
                      placeholder="John Smith"
                      required
                      className="pl-10 h-11 rounded-lg border-gray-200 focus-visible:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
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

                {/* Phone */}
                <div className="space-y-1.5">
                  <Label htmlFor="phone">
                    Phone Number <span className="text-gray-400 font-normal">(optional)</span>
                  </Label>
                  <div className="relative">
                    <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="+44 7700 900000"
                      className="pl-10 h-11 rounded-lg border-gray-200 focus-visible:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
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
              </div>
            </div>

            {/* ---- Organisation ---- */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Your Church / Organisation
              </p>
              <div className="space-y-3">
                {/* Organisation name */}
                <div className="space-y-1.5">
                  <Label htmlFor="org_name">Organisation Name</Label>
                  <div className="relative">
                    <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      id="org_name"
                      name="org_name"
                      type="text"
                      placeholder="St Mary's Church"
                      required
                      className="pl-10 h-11 rounded-lg border-gray-200 focus-visible:ring-blue-500"
                    />
                  </div>
                </div>

                {/* City / Location */}
                <div className="space-y-1.5">
                  <Label htmlFor="city">
                    City / Location <span className="text-gray-400 font-normal">(optional)</span>
                  </Label>
                  <div className="relative">
                    <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      id="city"
                      name="city"
                      type="text"
                      placeholder="London"
                      className="pl-10 h-11 rounded-lg border-gray-200 focus-visible:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Role */}
                <div className="space-y-1.5">
                  <Label htmlFor="role">Your Role</Label>
                  <input type="hidden" name="role" value={role} />
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="w-full h-11 rounded-lg border-gray-200 focus-visible:ring-blue-500">
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="treasurer">Treasurer</SelectItem>
                      <SelectItem value="trustee_viewer">Trustee</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400">
                    You can invite others and change roles later in Settings.
                  </p>
                </div>
              </div>
            </div>

            {/* Submit */}
            <Button
              formAction={signup}
              className="w-full h-11 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-medium text-sm shadow-md"
            >
              Create Account
            </Button>
          </form>

          {/* Login link */}
          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 font-semibold hover:underline">
              Log in
            </Link>
          </p>

          {/* Home link */}
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

export default function SignupPage() {
  return (
    <Suspense>
      <main className="flex min-h-screen">
        <div className="hidden lg:block lg:w-1/2">
          <BrandPanel />
        </div>
        <div className="w-full lg:w-1/2 bg-white">
          <SignupForm />
        </div>
      </main>
    </Suspense>
  );
}
