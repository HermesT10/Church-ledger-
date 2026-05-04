import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/demo';
import { getActiveOrg } from '@/lib/org';
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
      <CollapsibleLayout
        userName="Demo User"
        orgName="Demo Organisation"
        activeOrgId="demo-org"
        organisations={[
          {
            orgId: 'demo-org',
            orgName: 'Demo Organisation',
            role: 'admin',
            joinedAt: null,
            createdAt: new Date(0).toISOString(),
            logoUrl: null,
          },
        ]}
        role="admin"
      >
        {children}
      </CollapsibleLayout>
    );
  }

  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';
  const supabase = await createClient();
  const { count } = await supabase
    .from('memberships')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'active');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  const userName = profile?.full_name ?? user.email ?? 'User';

  if (
    count === 0 &&
    (pathname === '/onboarding' || pathname.startsWith('/accept-invite'))
  ) {
    return (
      <CollapsibleLayout
        userName={userName}
        orgName="ChurchLedger"
        activeOrgId="setup"
        organisations={[
          {
            orgId: 'setup',
            orgName: 'ChurchLedger',
            role: 'viewer',
            joinedAt: null,
            createdAt: new Date(0).toISOString(),
            logoUrl: null,
          },
        ]}
        role="viewer"
      >
        {children}
      </CollapsibleLayout>
    );
  }

  const activeOrg = await getActiveOrg();

  // Onboarding redirect: if the org's onboarding is not completed and the user
  // is an admin or treasurer, redirect them to the setup wizard.
  // Trustees and auditors can use the app without completing onboarding.
  if (
    !pathname.startsWith('/onboarding') &&
    !pathname.startsWith('/accept-invite') &&
    (activeOrg.role === 'admin' || activeOrg.role === 'treasurer')
  ) {
    const { data: onboardingRow, error: onboardingErr } = await supabase
      .from('onboarding_progress')
      .select('is_completed')
      .eq('organisation_id', activeOrg.orgId)
      .single();

    // Only redirect if we successfully fetched an incomplete onboarding row.
    // If there's no row (legacy org) or the query failed, let the user through.
    if (!onboardingErr && onboardingRow && !onboardingRow.is_completed) {
      redirect('/onboarding/setup');
    }
  }

  return (
    <CollapsibleLayout
      userName={userName}
      orgName={activeOrg.orgName}
      activeOrgId={activeOrg.orgId}
      organisations={activeOrg.organisations}
      role={activeOrg.role}
    >
      {children}
    </CollapsibleLayout>
  );
}
