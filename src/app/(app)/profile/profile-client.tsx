'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  User,
  Shield,
  Palette,
  Activity,
  Lock,
  LogOut,
} from 'lucide-react';
import {
  updateProfile,
  updatePreferences,
} from './actions';
import { changePassword, forceLogoutAll } from '../settings/actions';
import type { ProfileData } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  treasurer: 'Treasurer',
  trustee_viewer: 'Trustee',
  auditor: 'Auditor',
};

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  profile: ProfileData | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ProfileClient({ profile }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Profile fields
  const [fullName, setFullName] = useState(profile?.fullName ?? '');

  // Preferences
  const [theme, setTheme] = useState(profile?.preferences.theme ?? 'system');
  const [landingPage, setLandingPage] = useState(
    profile?.preferences.defaultLandingPage ?? 'dashboard',
  );
  const [reportView, setReportView] = useState(
    profile?.preferences.defaultReportView ?? 'YTD',
  );
  const [numberFormat, setNumberFormat] = useState(
    profile?.preferences.numberFormat ?? 'comma',
  );
  const [dateFormat, setDateFormat] = useState(
    profile?.preferences.dateFormatPreference ?? 'DD/MM/YYYY',
  );

  // Security
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  if (!profile) {
    return (
      <p className="text-sm text-muted-foreground">
        Could not load profile data.
      </p>
    );
  }

  /* ---- Handlers ---- */
  const handleSaveName = () => {
    startTransition(async () => {
      const { error } = await updateProfile({ full_name: fullName.trim() });
      if (error) toast.error(error);
      else {
        toast.success('Name updated.');
        router.refresh();
      }
    });
  };

  const handleSavePref = (
    fields: Parameters<typeof updatePreferences>[0],
  ) => {
    startTransition(async () => {
      const { error } = await updatePreferences(fields);
      if (error) toast.error(error);
      else toast.success('Preference saved.');
    });
  };

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    startTransition(async () => {
      const { error } = await changePassword(newPassword);
      if (error) toast.error(error);
      else {
        toast.success('Password changed.');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordForm(false);
      }
    });
  };

  const handleForceLogout = () => {
    if (
      !confirm(
        'This will log out all other sessions. Continue?',
      )
    )
      return;
    startTransition(async () => {
      const { error } = await forceLogoutAll();
      if (error) toast.error(error);
      else toast.success('All other sessions terminated.');
    });
  };

  /* ---- Initials for avatar ---- */
  const initials = (profile.fullName ?? profile.email ?? '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  /* ---- Render ---- */
  return (
    <>
      {isPending && (
        <p className="text-sm text-muted-foreground">Saving...</p>
      )}

      {/* ============================================================ */}
      {/*  12-column grid: flat children for correct mobile ordering    */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

        {/* ==== 1. Profile  (left col, order-1 mobile) ==== */}
        <Card className="order-1 md:col-span-8 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Profile</CardTitle>
              </div>
            </div>
            <CardDescription>Your personal information.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold shadow">
                {initials}
              </div>
              <div>
                <p className="text-sm font-medium">Profile Photo</p>
                <Badge variant="secondary" className="text-[10px] mt-1">
                  Upload coming soon
                </Badge>
              </div>
            </div>

            {/* Full name */}
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <div className="flex gap-2">
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="flex-1"
                  placeholder="Your name"
                />
                <Button
                  size="sm"
                  onClick={handleSaveName}
                  disabled={isPending || fullName.trim() === (profile.fullName ?? '')}
                >
                  Save
                </Button>
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={profile.email ?? ''} disabled />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label>Role</Label>
              <div>
                <Badge variant="outline" className="text-xs">
                  {ROLE_LABELS[profile.role] ?? profile.role}
                </Badge>
              </div>
            </div>

            {/* Organisation */}
            <div className="space-y-1.5">
              <Label>Organisation</Label>
              <Input value={profile.organisationName} disabled />
            </div>
          </CardContent>
        </Card>

        {/* ==== 2. Account Security  (right col, order-2 mobile) ==== */}
        <Card className="order-2 md:col-span-4 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Account Security</CardTitle>
              </div>
            </div>
            <CardDescription>Password, sessions, and authentication.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            {/* Change password */}
            {!showPasswordForm ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPasswordForm(true)}
              >
                <Lock size={14} className="mr-2" />
                Change Password
              </Button>
            ) : (
              <div className="space-y-3 rounded-md border p-4">
                <div className="space-y-1.5">
                  <Label>New Password</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    minLength={6}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm Password</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleChangePassword}
                    disabled={isPending || !newPassword}
                  >
                    Update Password
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Auth provider */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auth Provider</p>
                <p className="text-xs text-muted-foreground">
                  How you sign in.
                </p>
              </div>
              <Badge variant="outline" className="text-xs capitalize">
                {profile.authProvider}
              </Badge>
            </div>

            {/* Last login */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Last Login</p>
                <p className="text-xs text-muted-foreground">
                  Most recent sign-in.
                </p>
              </div>
              <span className="text-sm tabular-nums">
                {profile.lastSignInAt
                  ? new Date(profile.lastSignInAt).toLocaleString('en-GB')
                  : '—'}
              </span>
            </div>

            {/* Active sessions */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Active Sessions</p>
                <p className="text-xs text-muted-foreground">
                  Manage login sessions.
                </p>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                Coming soon
              </Badge>
            </div>

            {/* Log out other sessions */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Log Out Others</p>
                <p className="text-xs text-muted-foreground">
                  Sign out all other devices.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleForceLogout}
                disabled={isPending}
              >
                <LogOut size={14} className="mr-1.5" />
                Logout All
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ==== 3. Preferences  (left col, order-3 mobile) ==== */}
        <Card className="order-3 md:col-span-8 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Preferences</CardTitle>
              </div>
            </div>
            <CardDescription>Customise your experience.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            {/* Theme */}
            <div className="space-y-1.5">
              <Label>Theme</Label>
              <select
                className={SELECT_CLASS}
                value={theme}
                onChange={(e) => {
                  setTheme(e.target.value);
                  handleSavePref({ theme: e.target.value });
                }}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>

            {/* Default landing page */}
            <div className="space-y-1.5">
              <Label>Default Landing Page</Label>
              <select
                className={SELECT_CLASS}
                value={landingPage}
                onChange={(e) => {
                  setLandingPage(e.target.value);
                  handleSavePref({ default_landing_page: e.target.value });
                }}
              >
                <option value="dashboard">Dashboard</option>
                <option value="trustee-snapshot">Trustee Snapshot</option>
              </select>
            </div>

            {/* Default report view */}
            <div className="space-y-1.5">
              <Label>Default Report View</Label>
              <select
                className={SELECT_CLASS}
                value={reportView}
                onChange={(e) => {
                  setReportView(e.target.value);
                  handleSavePref({ default_report_view: e.target.value });
                }}
              >
                <option value="MONTH">Month</option>
                <option value="YTD">Year to Date</option>
              </select>
            </div>

            {/* Number formatting */}
            <div className="space-y-1.5">
              <Label>Number Formatting</Label>
              <select
                className={SELECT_CLASS}
                value={numberFormat}
                onChange={(e) => {
                  setNumberFormat(e.target.value);
                  handleSavePref({ number_format: e.target.value });
                }}
              >
                <option value="comma">1,000.00</option>
                <option value="space">1 000.00</option>
              </select>
            </div>

            {/* Date format */}
            <div className="space-y-1.5">
              <Label>Date Format</Label>
              <select
                className={SELECT_CLASS}
                value={dateFormat}
                onChange={(e) => {
                  setDateFormat(e.target.value);
                  handleSavePref({ date_format_preference: e.target.value });
                }}
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* ==== 4. Activity  (right col, order-4 mobile) ==== */}
        <Card className="order-4 md:col-span-4 rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-muted-foreground" />
                <CardTitle className="text-base">Activity</CardTitle>
              </div>
            </div>
            <CardDescription>Your recent actions and login history.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            {/* Last login */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Last Login</p>
                <p className="text-xs text-muted-foreground">
                  Your most recent sign-in.
                </p>
              </div>
              <span className="text-sm tabular-nums">
                {profile.lastSignInAt
                  ? new Date(profile.lastSignInAt).toLocaleString('en-GB')
                  : '—'}
              </span>
            </div>

            {/* Audit log placeholder */}
            <div className="rounded-md border border-dashed p-6 text-center">
              <Activity
                size={24}
                className="mx-auto text-muted-foreground mb-2"
              />
              <p className="text-sm font-medium text-muted-foreground">
                Recent Activity Log
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                A detailed log of your recent actions will appear here.
              </p>
              <Badge variant="secondary" className="text-[10px] mt-3">
                Coming soon
              </Badge>
            </div>
          </CardContent>
        </Card>

      </div>
    </>
  );
}
