'use server';

import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertWriteAllowed } from '@/lib/demo';

export async function onboard(formData: FormData) {
  await assertWriteAllowed();
  const user = await requireSession();

  const name = (formData.get('name') as string)?.trim();
  const city = (formData.get('city') as string)?.trim() || null;
  const role = (formData.get('role') as string) || 'admin';

  if (!name) {
    redirect('/onboarding?error=' + encodeURIComponent('Organisation name is required.'));
  }

  const validRoles = ['admin', 'treasurer', 'trustee_viewer'];
  const safeRole = validRoles.includes(role) ? role : 'admin';

  // Use the admin (service-role) client for onboarding inserts.
  // This bypasses RLS, which is necessary here because onboarding is a
  // bootstrap operation — the user has no org/membership yet, so
  // cookie-based auth.uid() may not propagate to PostgREST correctly
  // until the first membership exists.
  const admin = createAdminClient();

  // 1. Create the organisation
  const { data: org, error: orgError } = await admin
    .from('organisations')
    .insert({ name, city, country: 'United Kingdom' })
    .select()
    .single();

  if (orgError || !org) {
    redirect(
      '/onboarding?error=' +
        encodeURIComponent(orgError?.message ?? 'Failed to create organisation.')
    );
  }

  // 2. Create membership linking this user to the new org
  const { error: memError } = await admin.from('memberships').insert({
    organisation_id: org.id,
    user_id: user.id,
    role: safeRole,
  });

  if (memError) {
    await admin.from('organisations').delete().eq('id', org.id);
    redirect(
      '/onboarding?error=' +
        encodeURIComponent(memError.message)
    );
  }

  // 3. Create onboarding progress row for the new org
  await admin.from('onboarding_progress').insert({
    organisation_id: org.id,
    current_step: 1,
    completed_steps: [],
    is_completed: false,
  });

  redirect('/onboarding/setup');
}
