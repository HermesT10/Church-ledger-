'use server';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { assertWriteAllowed } from '@/lib/demo';
import type { ProfileData, UserPreferences } from './types';

/* ------------------------------------------------------------------ */
/*  getProfile                                                         */
/* ------------------------------------------------------------------ */

export async function getProfile(): Promise<{
  data: ProfileData | null;
  error: string | null;
}> {
  const user = await requireSession();
  const supabase = await createClient();

  // Fetch profile
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, theme, default_landing_page, default_report_view, number_format, date_format_preference')
    .eq('id', user.id)
    .single();

  if (profileErr) return { data: null, error: profileErr.message };

  // Fetch membership + org name
  const { data: membership, error: memberErr } = await supabase
    .from('memberships')
    .select('role, organisations(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (memberErr) return { data: null, error: memberErr.message };

  // Supabase may return organisations as array or object depending on join
  const orgs = membership.organisations as
    | { name: string }
    | { name: string }[]
    | null;
  const org = Array.isArray(orgs) ? orgs[0] ?? null : orgs;

  // Auth provider
  const provider =
    user.app_metadata?.provider ??
    (user.identities && user.identities.length > 0
      ? user.identities[0].provider
      : 'email');

  return {
    data: {
      userId: user.id,
      fullName: profile.full_name,
      avatarUrl: profile.avatar_url,
      email: user.email ?? null,
      role: membership.role as string,
      organisationName: org?.name ?? 'Unknown',
      lastSignInAt: user.last_sign_in_at ?? null,
      authProvider: provider ?? 'email',
      preferences: {
        theme: profile.theme ?? 'system',
        defaultLandingPage: profile.default_landing_page ?? 'dashboard',
        defaultReportView: profile.default_report_view ?? 'YTD',
        numberFormat: profile.number_format ?? 'comma',
        dateFormatPreference: profile.date_format_preference ?? 'DD/MM/YYYY',
      },
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  updateProfile                                                      */
/* ------------------------------------------------------------------ */

export async function updateProfile(fields: {
  full_name?: string;
}): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const user = await requireSession();
  const supabase = await createClient();

  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', user.id);

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  updatePreferences                                                  */
/* ------------------------------------------------------------------ */

export async function updatePreferences(fields: {
  theme?: string;
  default_landing_page?: string;
  default_report_view?: string;
  number_format?: string;
  date_format_preference?: string;
}): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const user = await requireSession();
  const supabase = await createClient();

  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', user.id);

  return { error: error?.message ?? null };
}
