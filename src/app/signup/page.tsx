'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Gift,
  Layers,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  TrendingUp,
  User,
} from 'lucide-react';
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
import { Logo } from '@/components/logo';
import { signup } from './actions';

const HIGHLIGHTS = [
  {
    icon: Layers,
    title: 'Fund management',
    description: 'Track restricted, unrestricted, and designated funds from day one.',
  },
  {
    icon: Gift,
    title: 'Gift Aid workflows',
    description: 'Capture declarations and prepare claim-ready donation records.',
  },
  {
    icon: TrendingUp,
    title: 'Trustee reporting',
    description: 'Create calm, clear views for boards and finance reviews.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-based access',
    description: 'Invite treasurers, trustees, finance users, and auditors later.',
  },
] as const;

function SignupShowcase() {
  return (
    <aside className="relative hidden min-h-screen overflow-hidden bg-foreground p-10 text-background lg:flex lg:w-[48%] lg:flex-col">
      <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-primary/35 blur-3xl" />
      <div className="absolute -right-28 bottom-0 h-96 w-96 rounded-full bg-info/20 blur-3xl" />

      <Link href="/" className="relative z-10 flex items-center gap-3">
        <Logo size={40} />
        <span className="text-xl font-bold">ChurchLedger</span>
      </Link>

      <div className="relative z-10 flex flex-1 flex-col justify-center">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-background/45">
          Start from a clean workspace
        </p>
        <h1 className="mt-4 max-w-md text-5xl font-black tracking-[-0.07em]">
          Build transparent church finances from day one.
        </h1>
        <p className="mt-5 max-w-md text-sm leading-7 text-background/55">
          Create an organisation workspace, invite your finance team, and choose a blank or guided setup after signup.
        </p>

        <div className="mt-10 grid gap-4">
          {HIGHLIGHTS.map((highlight) => {
            const Icon = highlight.icon;
            return (
              <div key={highlight.title} className="flex gap-4 rounded-3xl border border-background/10 bg-background/10 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-background text-foreground">
                  <Icon size={19} />
                </div>
                <div>
                  <p className="text-sm font-semibold">{highlight.title}</p>
                  <p className="mt-1 text-xs leading-5 text-background/50">{highlight.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex items-center gap-3 text-sm text-background/70">
          <CheckCircle2 size={16} className="text-success" />
          Free to start. No credit card required.
        </div>
      </div>
    </aside>
  );
}

function SignupForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('admin');

  return (
    <section className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden px-5 py-10 sm:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_34%),radial-gradient(circle_at_12%_80%,color-mix(in_srgb,var(--chart-2)_12%,transparent),transparent_30%)]" />
      <div className="relative z-10 w-full max-w-[520px]">
        <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
          <Logo size={38} />
          <span className="text-xl font-bold">ChurchLedger</span>
        </div>

        <div className="rounded-[2rem] border border-border/70 bg-card/90 p-6 shadow-modal backdrop-blur sm:p-8">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Create workspace</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.06em]">Start your church ledger</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Create your account and organisation workspace in one step.
            </p>
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <form className="mt-7 space-y-6">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Your details
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="full_name">Full name</Label>
                  <div className="relative">
                    <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="full_name"
                      name="full_name"
                      type="text"
                      placeholder="John Smith"
                      required
                      className="h-12 rounded-2xl pl-11"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="email">Email</Label>
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
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="phone">
                    Phone number <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <div className="relative">
                    <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="+44 7700 900000"
                      className="h-12 rounded-2xl pl-11"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 6 characters"
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
                </div>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Organisation
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="org_name">Organisation name</Label>
                  <div className="relative">
                    <Building2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="org_name"
                      name="org_name"
                      type="text"
                      placeholder="St Mary's Church"
                      required
                      className="h-12 rounded-2xl pl-11"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="city">
                    City <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <div className="relative">
                    <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="city"
                      name="city"
                      type="text"
                      placeholder="London"
                      className="h-12 rounded-2xl pl-11"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="role">Your role</Label>
                  <input type="hidden" name="role" value={role} />
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id="role" className="h-12 rounded-2xl">
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="treasurer">Treasurer</SelectItem>
                      <SelectItem value="trustee_viewer">Trustee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                You can invite others and change roles later in Settings.
              </p>
            </div>

            <Button formAction={signup} className="h-12 w-full rounded-2xl text-base shadow-card">
              Create account
            </Button>
          </form>

          <p className="mt-7 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Log in
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

export default function SignupPage() {
  return (
    <Suspense>
      <main className="flex min-h-screen bg-background">
        <SignupShowcase />
        <SignupForm />
      </main>
    </Suspense>
  );
}
