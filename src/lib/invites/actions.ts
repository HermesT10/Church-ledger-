'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError, ALL_ROLES } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';
import { logAuditEvent } from '@/lib/audit';
import type { InviteRow } from './types';

const INVITE_EXPIRY_DAYS = 7;

/* ------------------------------------------------------------------ */
/*  sendInvite                                                         */
/* ------------------------------------------------------------------ */

export async function sendInvite(params: {
  orgId: string;
  email: string;
  role: Role;
}): Promise<{ data: InviteRow | null; error: string | null }> {
  const { orgId, email, role: inviteRole } = params;
  const { role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'members');
  } catch (e) {
    return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  // Validate email
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes('@')) {
    return { data: null, error: 'A valid email address is required.' };
  }

  // Validate role
  if (!ALL_ROLES.includes(inviteRole)) {
    return { data: null, error: `Invalid role: ${inviteRole}` };
  }

  const supabase = await createClient();

  // Check for existing active membership with this email
  // We need to look up auth.users by email via admin client
  const adminClient = createAdminClient();
  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find(
    (u) => u.email?.toLowerCase() === trimmedEmail,
  );

  if (existingUser) {
    // Check if they already have an active membership in this org
    const { data: existingMembership } = await supabase
      .from('memberships')
      .select('id, status')
      .eq('organisation_id', orgId)
      .eq('user_id', existingUser.id)
      .maybeSingle();

    if (existingMembership) {
      if (existingMembership.status === 'active') {
        return { data: null, error: 'This user is already a member of this organisation.' };
      }
      if (existingMembership.status === 'disabled') {
        return { data: null, error: 'This user has a disabled membership. Re-enable them instead.' };
      }
    }
  }

  // Check for existing pending invite
  const { data: existingInvite } = await supabase
    .from('organisation_invites')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('email', trimmedEmail)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existingInvite) {
    return { data: null, error: 'An invite has already been sent to this email.' };
  }

  // Generate secure token
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Insert invite record (delete any expired ones for this email first)
  await supabase
    .from('organisation_invites')
    .delete()
    .eq('organisation_id', orgId)
    .eq('email', trimmedEmail);

  const { data: invite, error: insertErr } = await supabase
    .from('organisation_invites')
    .insert({
      organisation_id: orgId,
      email: trimmedEmail,
      role: inviteRole,
      token,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select()
    .single();

  if (insertErr) {
    return { data: null, error: insertErr.message };
  }

  // Send invite email via Supabase Auth
  // inviteUserByEmail creates the user if they don't exist and sends a magic link
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : 'http://localhost:3000';

  const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(`/accept-invite?token=${token}`)}`;

  const { error: authErr } = await adminClient.auth.admin.inviteUserByEmail(
    trimmedEmail,
    { redirectTo },
  );

  if (authErr) {
    // Clean up the invite record if email fails
    await supabase
      .from('organisation_invites')
      .delete()
      .eq('id', invite.id);

    return { data: null, error: `Failed to send invite email: ${authErr.message}` };
  }

  // Audit log
  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'invite_user',
    entityType: 'organisation_invite',
    entityId: invite.id,
    metadata: { email: trimmedEmail, role: inviteRole },
  });

  return {
    data: {
      id: invite.id,
      organisationId: invite.organisation_id,
      email: invite.email,
      role: invite.role as Role,
      token: invite.token,
      expiresAt: invite.expires_at,
      createdBy: invite.created_by,
      createdAt: invite.created_at,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  listInvites                                                        */
/* ------------------------------------------------------------------ */

export async function listInvites(
  orgId: string,
): Promise<{ data: InviteRow[]; error: string | null }> {
  await getActiveOrg();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('organisation_invites')
    .select('*')
    .eq('organisation_id', orgId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: error.message };

  const rows: InviteRow[] = (data ?? []).map((inv) => ({
    id: inv.id,
    organisationId: inv.organisation_id,
    email: inv.email,
    role: inv.role as Role,
    token: inv.token,
    expiresAt: inv.expires_at,
    createdBy: inv.created_by,
    createdAt: inv.created_at,
  }));

  return { data: rows, error: null };
}

/* ------------------------------------------------------------------ */
/*  revokeInvite                                                       */
/* ------------------------------------------------------------------ */

export async function revokeInvite(
  inviteId: string,
): Promise<{ error: string | null }> {
  const { role, user, orgId } = await getActiveOrg();

  try {
    assertCanPerform(role, 'delete', 'members');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('organisation_invites')
    .delete()
    .eq('id', inviteId);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'revoke_invite',
      entityType: 'organisation_invite',
      entityId: inviteId,
    });
  }

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  resendInvite                                                       */
/* ------------------------------------------------------------------ */

export async function resendInvite(
  inviteId: string,
): Promise<{ error: string | null }> {
  const { role, user, orgId } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'members');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  const supabase = await createClient();

  // Fetch the invite
  const { data: invite, error: fetchErr } = await supabase
    .from('organisation_invites')
    .select('*')
    .eq('id', inviteId)
    .single();

  if (fetchErr || !invite) {
    return { error: 'Invite not found.' };
  }

  // Regenerate token and reset expiry
  const newToken = crypto.randomUUID();
  const newExpiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: updateErr } = await supabase
    .from('organisation_invites')
    .update({ token: newToken, expires_at: newExpiresAt })
    .eq('id', inviteId);

  if (updateErr) return { error: updateErr.message };

  // Re-send invite email
  const adminClient = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : 'http://localhost:3000';

  const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(`/accept-invite?token=${newToken}`)}`;

  const { error: authErr } = await adminClient.auth.admin.inviteUserByEmail(
    invite.email,
    { redirectTo },
  );

  if (authErr) {
    return { error: `Failed to resend invite: ${authErr.message}` };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'resend_invite',
    entityType: 'organisation_invite',
    entityId: inviteId,
    metadata: { email: invite.email },
  });

  return { error: null };
}

/* ------------------------------------------------------------------ */
/*  acceptInvite (called from the accept-invite page)                  */
/* ------------------------------------------------------------------ */

export async function acceptInvite(
  token: string,
): Promise<{ error: string | null; orgName?: string }> {
  const { requireSession } = await import('@/lib/auth');
  const user = await requireSession();

  // Use admin client to bypass RLS (user isn't a member yet)
  const adminClient = createAdminClient();

  // 1. Validate token
  const { data: invite, error: fetchErr } = await adminClient
    .from('organisation_invites')
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (fetchErr || !invite) {
    return { error: 'Invalid or expired invite link.' };
  }

  // 2. Check if user already has a membership in this org
  const { data: existingMembership } = await adminClient
    .from('memberships')
    .select('id, status')
    .eq('organisation_id', invite.organisation_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingMembership) {
    if (existingMembership.status === 'active') {
      // Already a member, just clean up invite and redirect
      await adminClient
        .from('organisation_invites')
        .delete()
        .eq('id', invite.id);
      return { error: null };
    }

    // Re-activate disabled membership
    if (existingMembership.status === 'disabled') {
      await adminClient
        .from('memberships')
        .update({
          status: 'active',
          role: invite.role,
          joined_at: new Date().toISOString(),
        })
        .eq('id', existingMembership.id);

      await adminClient
        .from('organisation_invites')
        .delete()
        .eq('id', invite.id);

      return { error: null };
    }
  }

  // 3. Create membership
  const { error: memberErr } = await adminClient
    .from('memberships')
    .insert({
      organisation_id: invite.organisation_id,
      user_id: user.id,
      role: invite.role,
      status: 'active',
      invited_by: invite.created_by,
      invited_at: invite.created_at,
      joined_at: new Date().toISOString(),
    });

  if (memberErr) {
    return { error: `Failed to join organisation: ${memberErr.message}` };
  }

  // 4. Fetch org name for the success message
  const { data: org } = await adminClient
    .from('organisations')
    .select('name')
    .eq('id', invite.organisation_id)
    .single();

  // 5. Delete the invite
  await adminClient
    .from('organisation_invites')
    .delete()
    .eq('id', invite.id);

  return { error: null, orgName: org?.name ?? undefined };
}
