'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signup(formData: FormData) {
  const fullName = (formData.get('full_name') as string)?.trim();
  const email = (formData.get('email') as string)?.trim();
  const phone = (formData.get('phone') as string)?.trim() || undefined;
  const password = formData.get('password') as string;
  const orgName = (formData.get('org_name') as string)?.trim();
  const city = (formData.get('city') as string)?.trim() || undefined;
  const role = (formData.get('role') as string) || 'admin';

  if (!fullName || !email || !password || !orgName) {
    redirect(
      '/signup?error=' +
        encodeURIComponent('Please fill in all required fields.')
    );
  }

  if (password.length < 6) {
    redirect(
      '/signup?error=' +
        encodeURIComponent('Password must be at least 6 characters.')
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        phone,
        org_name: orgName,
        city,
        role,
      },
    },
  });

  if (error) {
    redirect('/signup?error=' + encodeURIComponent(error.message));
  }

  redirect(
    '/login?message=' +
      encodeURIComponent(
        'Account created! Check your email to confirm, then log in.'
      )
  );
}
