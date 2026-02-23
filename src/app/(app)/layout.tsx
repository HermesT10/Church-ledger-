import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/demo';
import { CollapsibleLayout } from '@/components/collapsible-layout';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  const demo = await isDemoMode();

  // In demo mode, skip all DB queries for membership/onboarding/profile
  if (demo) {
    return (
      <CollapsibleLayout userName="Demo User" orgName="Demo Organisation" role="admin">
        {children}
      </CollapsibleLayout>
    );
  }

  // Check if the user has any active memberships (also fetch org name + role)
  const supabase = await createClient();
  const { data: membershipData, count } = await supabase
    .from('memberships')
    .select('organisation_id, role, status, organisations(name)', { count: 'exact', head: false })
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1);

  // If no active memberships, check for disabled → redirect with error
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';

  if (count === 0 && !pathname.startsWith('/onboarding') && !pathname.startsWith('/accept-invite')) {
    // Check if user has a disabled membership
    const { data: disabledMembership } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'disabled')
      .limit(1)
      .maybeSingle();

    if (disabledMembership) {
      redirect('/login?error=' + encodeURIComponent('Your account has been disabled. Contact your administrator.'));
    }

    redirect('/onboarding');
  }

  // Extract organisation name from the membership join
  const orgs = membershipData?.[0]?.organisations as
    | { name: string }
    | { name: string }[]
    | null
    | undefined;
  const organisationName =
    (Array.isArray(orgs) ? orgs[0]?.name : orgs?.name) ?? 'ChurchLedger';

  // Onboarding redirect: if the org's onboarding is not completed and the user
  // is an admin or treasurer, redirect them to the setup wizard.
  // Trustees and auditors can use the app without completing onboarding.
  const membership = membershipData?.[0];
  if (
    membership &&
    !pathname.startsWith('/onboarding') &&
    (membership.role === 'admin' || membership.role === 'treasurer')
  ) {
    const { data: onboardingRow, error: onboardingErr } = await supabase
      .from('onboarding_progress')
      .select('is_completed')
      .eq('organisation_id', membership.organisation_id)
      .single();

    // Only redirect if we successfully fetched an incomplete onboarding row.
    // If there's no row (legacy org) or the query failed, let the user through.
    if (!onboardingErr && onboardingRow && !onboardingRow.is_completed) {
      redirect('/onboarding/setup');
    }
  }

  // Fetch the user's display name for the sidebar footer
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  const userName = profile?.full_name ?? user.email ?? 'User';

  const userRole = (membership?.role as string) ?? 'viewer';

  return (
    <CollapsibleLayout userName={userName} orgName={organisationName} role={userRole}>
      {children}
    </CollapsibleLayout>
  );
}
