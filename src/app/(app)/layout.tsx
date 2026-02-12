import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();

  // Check if the user has any memberships
  const supabase = await createClient();
  const { count } = await supabase
    .from('memberships')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  // If no memberships and not already on onboarding, redirect there
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';

  if (count === 0 && !pathname.startsWith('/app/onboarding')) {
    redirect('/app/onboarding');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link href="/app/dashboard" className="text-lg font-semibold">
          ChurchLedger
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/app/dashboard" className="hover:underline">
            Dashboard
          </Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
