import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { isDemoMode } from '@/lib/demo';
import { PermissionError } from '@/lib/permissions';
import { CollapsibleLayout } from '@/components/collapsible-layout';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const demo = await isDemoMode();
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';

  // In demo mode, skip all DB queries for membership/onboarding/profile
  if (demo) {
    return (
      <CollapsibleLayout
        userName="Demo User"
        orgId="demo-org"
        orgName="Demo Organisation"
        availableOrgs={[
          { orgId: 'demo-org', orgName: 'Demo Organisation', role: 'admin' },
        ]}
        role="admin"
      >
        {children}
      </CollapsibleLayout>
    );
  }

  const user = await requireSession();
  const supabase = await createClient();
  let activeOrg:
    | Awaited<ReturnType<typeof getActiveOrg>>
    | null = null;

  try {
    activeOrg = await getActiveOrg({ allowMissingMembership: true });
  } catch (error) {
    if (!(error instanceof PermissionError)) {
      throw error;
    }
  }

  if (!activeOrg) {
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

    if (!pathname.startsWith('/onboarding') && !pathname.startsWith('/accept-invite')) {
      redirect('/onboarding');
    }

    return children;
  }

  const { orgId, orgName, role, availableOrgs } = activeOrg;

  // Onboarding redirect: if the org's onboarding is not completed and the user
  // is an admin or treasurer, redirect them to the setup wizard.
  // Trustees and auditors can use the app without completing onboarding.
  if (
    !pathname.startsWith('/onboarding') &&
    (role === 'admin' || role === 'treasurer')
  ) {
    const { data: onboardingRow, error: onboardingErr } = await supabase
      .from('onboarding_progress')
      .select('is_completed')
      .eq('organisation_id', orgId)
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

  return (
    <CollapsibleLayout
      userName={userName}
      orgId={orgId}
      orgName={orgName}
      availableOrgs={availableOrgs}
      role={role}
    >
      {children}
    </CollapsibleLayout>
  );
}
