import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isDemoMode, getDemoOrgConfig } from '@/lib/demo';

export interface UserOrganisationMembership {
  orgId: string;
  orgName: string;
  role: string;
  joinedAt: string | null;
  createdAt: string;
  logoUrl: string | null;
}

type MembershipRow = {
  organisation_id: string;
  role: string;
  joined_at: string | null;
  created_at: string;
  organisations:
    | {
        name: string | null;
        logo_url?: string | null;
      }
    | {
        name: string | null;
        logo_url?: string | null;
      }[]
    | null;
};

function normalizeMembershipRow(row: MembershipRow): UserOrganisationMembership {
  const organisations = Array.isArray(row.organisations)
    ? row.organisations[0] ?? null
    : row.organisations;

  return {
    orgId: row.organisation_id,
    orgName: organisations?.name ?? 'Unknown organisation',
    role: row.role,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    logoUrl: organisations?.logo_url ?? null,
  };
}

export function resolveActiveMembership(
  memberships: UserOrganisationMembership[],
  preferredOrgId?: string | null,
): UserOrganisationMembership | null {
  if (memberships.length === 0) {
    return null;
  }

  if (preferredOrgId) {
    const preferred = memberships.find((membership) => membership.orgId === preferredOrgId);
    if (preferred) {
      return preferred;
    }
  }

  return memberships[0];
}

export async function listUserOrganisations(): Promise<UserOrganisationMembership[]> {
  const user = await requireSession();

  if (await isDemoMode()) {
    const config = getDemoOrgConfig();
    return [
      {
        orgId: config.orgId,
        orgName: 'Demo organisation',
        role: config.role,
        joinedAt: null,
        createdAt: new Date(0).toISOString(),
        logoUrl: null,
      },
    ];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('memberships')
    .select('organisation_id, role, joined_at, created_at, organisations(name, logo_url)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as MembershipRow[]).map(normalizeMembershipRow);
}

export async function getActiveOrg() {
  const user = await requireSession();

  if (await isDemoMode()) {
    const config = getDemoOrgConfig();
    return {
      user,
      orgId: config.orgId,
      orgName: 'Demo organisation',
      role: config.role,
      organisations: await listUserOrganisations(),
    };
  }

  const supabase = await createClient();

  const [{ data: profile }, memberships] = await Promise.all([
    supabase
      .from('profiles')
      .select('active_organisation_id')
      .eq('id', user.id)
      .maybeSingle(),
    listUserOrganisations(),
  ]);

  const activeMembership = resolveActiveMembership(
    memberships,
    profile?.active_organisation_id ?? null,
  );

  if (!activeMembership) {
    const { data: disabled } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'disabled')
      .limit(1)
      .maybeSingle();

    if (disabled) {
      redirect(
        '/login?error=' +
          encodeURIComponent('Your account has been disabled. Contact your administrator.'),
      );
    }

    redirect('/onboarding');
  }

  return {
    user,
    orgId: activeMembership.orgId,
    orgName: activeMembership.orgName,
    role: activeMembership.role,
    organisations: memberships,
  };
}

export async function assertActiveOrgId(orgId: string) {
  const active = await getActiveOrg();
  if (active.orgId !== orgId) {
    throw new Error('Requested organisation does not match the active organisation.');
  }

  return active;
}
