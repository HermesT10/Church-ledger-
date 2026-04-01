import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isDemoMode, getDemoOrgConfig } from '@/lib/demo';
import { PermissionError } from '@/lib/permissions';

const ACTIVE_ORG_COOKIE = 'churchledger_active_org';
const ACTIVE_ORG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface OrgOption {
  orgId: string;
  orgName: string;
  role: string;
}

interface MembershipRow {
  organisation_id: string;
  role: string;
  status: string;
  created_at: string;
  organisations:
    | { name: string | null }
    | { name: string | null }[]
    | null;
}

export interface ActiveOrgContext {
  user: Awaited<ReturnType<typeof requireSession>>;
  orgId: string;
  orgName: string;
  role: string;
  availableOrgs: OrgOption[];
}

interface GetActiveOrgOptions {
  allowMissingMembership?: boolean;
}

function getOrgName(
  organisations: MembershipRow['organisations'],
): string {
  const value = Array.isArray(organisations)
    ? organisations[0]?.name
    : organisations?.name;

  return value ?? 'ChurchLedger';
}

async function readActiveOrgCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null;
}

function resolveSelectedMembership(
  memberships: MembershipRow[],
  preferredOrgId: string | null,
): MembershipRow {
  if (preferredOrgId) {
    const preferred = memberships.find(
      (membership) => membership.organisation_id === preferredOrgId,
    );
    if (preferred) {
      return preferred;
    }
  }

  return memberships[0];
}

async function getActiveMemberships(userId: string): Promise<MembershipRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('memberships')
    .select('organisation_id, role, status, created_at, organisations(name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  return (data ?? []) as MembershipRow[];
}

async function ensureMembershipAccess(userId: string) {
  const supabase = await createClient();
  const { data: disabled } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'disabled')
    .limit(1)
    .maybeSingle();

  if (disabled) {
    redirect(
      '/login?error=' +
        encodeURIComponent(
          'Your account has been disabled. Contact your administrator.',
        ),
    );
  }

  redirect('/onboarding');
}

export async function setActiveOrgCookie(orgId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACTIVE_ORG_COOKIE_MAX_AGE,
  });
}

export async function clearActiveOrgCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_ORG_COOKIE);
}

/**
 * Returns the current authenticated org context.
 *
 * The active organisation is resolved from a trusted httpOnly cookie when
 * available. If the cookie is missing or no longer points to an active
 * membership, the earliest active membership is used as a deterministic
 * fallback.
 */
export async function getActiveOrg(
  options: GetActiveOrgOptions = {},
): Promise<ActiveOrgContext> {
  const user = await requireSession();

  if (await isDemoMode()) {
    const config = getDemoOrgConfig();
    return {
      user,
      orgId: config.orgId,
      orgName: 'Demo Organisation',
      role: config.role,
      availableOrgs: [
        {
          orgId: config.orgId,
          orgName: 'Demo Organisation',
          role: config.role,
        },
      ],
    };
  }

  const memberships = await getActiveMemberships(user.id);

  if (memberships.length === 0) {
    if (options.allowMissingMembership) {
      throw new PermissionError('No active organisation membership found.');
    }
    await ensureMembershipAccess(user.id);
  }

  const preferredOrgId = await readActiveOrgCookie();
  const selectedMembership = resolveSelectedMembership(
    memberships,
    preferredOrgId,
  );

  return {
    user,
    orgId: selectedMembership.organisation_id,
    orgName: getOrgName(selectedMembership.organisations),
    role: selectedMembership.role,
    availableOrgs: memberships.map((membership) => ({
      orgId: membership.organisation_id,
      orgName: getOrgName(membership.organisations),
      role: membership.role,
    })),
  };
}

export async function assertActiveOrgAccess(orgId: string): Promise<ActiveOrgContext> {
  const context = await getActiveOrg();

  if (context.orgId !== orgId) {
    throw new PermissionError(
      'The requested organisation does not match your active organisation.',
    );
  }

  return context;
}
