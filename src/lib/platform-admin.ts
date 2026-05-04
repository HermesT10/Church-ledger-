import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export function getPlatformAdminEmails(): string[] {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  return getPlatformAdminEmails().includes(email.trim().toLowerCase());
}

export async function requirePlatformAdmin() {
  const user = await requireSession();

  const admin = createAdminClient();
  const { data: platformAdmin } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .is('disabled_at', null)
    .maybeSingle();

  if (!platformAdmin && !isPlatformAdminEmail(user.email)) {
    redirect('/dashboard');
  }

  return user;
}
