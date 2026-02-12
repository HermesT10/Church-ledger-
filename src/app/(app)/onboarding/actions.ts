'use server';

import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function onboard(formData: FormData) {
  const user = await requireSession();
  const name = (formData.get('name') as string)?.trim();

  if (!name) {
    redirect('/app/onboarding?error=' + encodeURIComponent('Organisation name is required.'));
  }

  const supabase = await createClient();

  // 1. Create the organisation
  const { data: org, error: orgError } = await supabase
    .from('organisations')
    .insert({ name })
    .select()
    .single();

  if (orgError || !org) {
    redirect(
      '/app/onboarding?error=' +
        encodeURIComponent(orgError?.message ?? 'Failed to create organisation.')
    );
  }

  // 2. Create admin membership
  const { error: memError } = await supabase.from('memberships').insert({
    organisation_id: org.id,
    user_id: user.id,
    role: 'admin',
  });

  if (memError) {
    redirect(
      '/app/onboarding?error=' +
        encodeURIComponent(memError.message)
    );
  }

  redirect('/app/dashboard');
}
