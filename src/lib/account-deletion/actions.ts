'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { assertWriteAllowed } from '@/lib/demo';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const SELF_DELETE_CONFIRMATION = 'DELETE MY ACCOUNT';

interface MembershipForDeletion {
  organisation_id: string;
  role: string;
  status: string;
  organisations?: { name?: string | null } | { name?: string | null }[] | null;
}

function getOrgName(row: MembershipForDeletion) {
  const org = Array.isArray(row.organisations) ? row.organisations[0] : row.organisations;
  return org?.name ?? 'this organisation';
}

export async function deleteSupabaseAuthUser(userId: string) {
  const admin = createAdminClient();
  return admin.auth.admin.deleteUser(userId, false);
}

export async function deleteMyAccountAction(input: {
  confirmation: string;
}): Promise<{ success: boolean; error: string | null; blockedOrganisations?: string[] }> {
  await assertWriteAllowed();
  const user = await requireSession();

  if (input.confirmation !== SELF_DELETE_CONFIRMATION) {
    return { success: false, error: `Type ${SELF_DELETE_CONFIRMATION} to confirm.` };
  }

  const admin = createAdminClient();

  const { data: memberships, error: membershipsError } = await admin
    .from('memberships')
    .select('organisation_id, role, status, organisations(name)')
    .eq('user_id', user.id)
    .neq('status', 'removed');

  if (membershipsError) {
    return { success: false, error: membershipsError.message };
  }

  const rows = (memberships ?? []) as MembershipForDeletion[];
  const blockedOrganisations: string[] = [];

  for (const membership of rows) {
    if (membership.role !== 'admin' || membership.status !== 'active') continue;

    const { count, error } = await admin
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', membership.organisation_id)
      .eq('role', 'admin')
      .eq('status', 'active')
      .neq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    if ((count ?? 0) === 0) {
      blockedOrganisations.push(getOrgName(membership));
      await logAuditEvent({
        orgId: membership.organisation_id,
        userId: user.id,
        action: 'account_deletion_blocked_sole_admin',
        entityType: 'profile',
        entityId: user.id,
      });
    }
  }

  if (blockedOrganisations.length > 0) {
    return {
      success: false,
      error: 'You are the only active admin for one or more organisations. Transfer admin access before deleting your account.',
      blockedOrganisations,
    };
  }

  for (const membership of rows) {
    await logAuditEvent({
      orgId: membership.organisation_id,
      userId: user.id,
      action: 'account_deletion_requested',
      entityType: 'profile',
      entityId: user.id,
    });

    const { error } = await admin.rpc('remove_user_from_workspace', {
      target_workspace_id: membership.organisation_id,
      target_user_id: user.id,
      removed_by_user_id: user.id,
      removal_reason: 'Self-service account deletion',
    });

    if (error) {
      return { success: false, error: error.message };
    }
  }

  if (user.email) {
    await admin
      .from('organisation_invites')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('invited_email', user.email)
      .in('status', ['draft', 'sent']);

    await admin
      .from('organisation_invites')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('email', user.email)
      .in('status', ['draft', 'sent']);
  }

  const { error: anonymiseError } = await admin.rpc('anonymise_user_personal_data', {
    target_user_id: user.id,
  });
  if (anonymiseError) {
    return { success: false, error: anonymiseError.message };
  }

  for (const membership of rows) {
    await logAuditEvent({
      orgId: membership.organisation_id,
      userId: user.id,
      action: 'account_deletion_completed',
      entityType: 'profile',
      entityId: user.id,
    });
  }

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'global' });

  const { error: deleteError } = await deleteSupabaseAuthUser(user.id);
  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  revalidatePath('/');
  return { success: true, error: null };
}
