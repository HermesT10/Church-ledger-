'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { assertActiveOrgId, getActiveOrg } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSiteUrl } from '@/lib/env.server';
import { assertCanPerform, PermissionError, ALL_ROLES } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';
import { logAuditEvent } from '@/lib/audit';
import { trackProductEvent } from '@/lib/analytics/server';
import { normalizePortalPermissions } from '@/lib/portal-permissions';
import { createPortalNotification } from '@/lib/portal/notifications';
import type {
  EmployeePortalAccessData,
  InviteRow,
  PortalPermissionPreset,
  PortalUserPermission,
} from './types';

const INVITE_EXPIRY_DAYS = 7;
const DEFAULT_PORTAL_PERMISSIONS = {
  pages: {
    dashboard: true,
    calendar: true,
    reports: true,
    funds: false,
    budgets: false,
    invoices: false,
    cash: false,
    transactions: false,
  },
  actions: {
    read: true,
    create: false,
    update: false,
    approve: false,
    export: false,
  },
};

type InviteStatus = InviteRow['status'];

interface InviteRecord {
  id: string;
  organisation_id?: string | null;
  workspace_id?: string | null;
  email?: string | null;
  invited_email?: string | null;
  invited_full_name?: string | null;
  employee_id?: string | null;
  role: string;
  token?: string | null;
  invite_code: string;
  status: string;
  permission_preset_id?: string | null;
  expires_at: string;
  created_by?: string | null;
  accepted_by?: string | null;
  accepted_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}

interface PortalPermissionRecord {
  id: string;
  workspace_id: string;
  membership_id?: string | null;
  user_id?: string | null;
  employee_id?: string | null;
  permission_preset_id?: string | null;
  permissions?: Record<string, unknown> | null;
  assigned_budget_ids?: string[] | null;
  assigned_fund_ids?: string[] | null;
  linked_bank_account_ids?: string[] | null;
}

interface PortalPresetRecord {
  id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  role: string;
  permissions?: Record<string, unknown> | null;
  is_system_preset?: boolean | null;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function createInviteToken() {
  return randomBytes(32).toString('base64url');
}

function createInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const bytes = randomBytes(8);
  for (const byte of bytes) {
    suffix += alphabet[byte % alphabet.length];
    if (suffix.length === 6) break;
  }
  return `INV-${suffix}`;
}

function buildInviteUrl(token: string, code: string) {
  return `${getSiteUrl()}/invite/${encodeURIComponent(token)}?code=${encodeURIComponent(code)}`;
}

function mapInvite(row: InviteRecord, inviteUrl?: string): InviteRow {
  const workspaceId = row.workspace_id ?? row.organisation_id ?? '';
  const invitedEmail = row.invited_email ?? row.email ?? '';
  return {
    id: row.id,
    organisationId: row.organisation_id ?? workspaceId,
    workspaceId,
    email: invitedEmail,
    invitedEmail,
    invitedFullName: row.invited_full_name ?? null,
    employeeId: row.employee_id ?? null,
    role: row.role as Role,
    token: row.token ?? null,
    inviteCode: row.invite_code,
    inviteUrl,
    status: row.status as InviteStatus,
    permissionPresetId: row.permission_preset_id ?? null,
    expiresAt: row.expires_at,
    createdBy: row.created_by ?? null,
    acceptedBy: row.accepted_by ?? null,
    acceptedAt: row.accepted_at ?? null,
    revokedAt: row.revoked_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

function mapPermission(row: PortalPermissionRecord | null): PortalUserPermission | null {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    membershipId: row.membership_id ?? null,
    userId: row.user_id ?? null,
    employeeId: row.employee_id ?? null,
    permissionPresetId: row.permission_preset_id ?? null,
    permissions: row.permissions ?? {},
    assignedBudgetIds: row.assigned_budget_ids ?? [],
    assignedFundIds: row.assigned_fund_ids ?? [],
    linkedBankAccountIds: row.linked_bank_account_ids ?? [],
  };
}

function mapPreset(row: PortalPresetRecord): PortalPermissionPreset {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description ?? null,
    role: row.role as Role,
    permissions: row.permissions ?? {},
    isSystemPreset: row.is_system_preset ?? false,
  };
}

function permissionDenied(error: unknown) {
  return error instanceof PermissionError ? error.message : 'Permission denied.';
}

function assertAdminRole(role: string) {
  assertCanPerform(role, 'create', 'members');
}

async function ensureAdminContext() {
  const ctx = await getActiveOrg();
  assertAdminRole(ctx.role);
  return ctx;
}

async function assertEmployeeInActiveWorkspace(employeeId: string, workspaceId: string) {
  const admin = createAdminClient();
  const { data: employee } = await admin
    .from('employees')
    .select('id, organisation_id, full_name')
    .eq('id', employeeId)
    .eq('organisation_id', workspaceId)
    .maybeSingle();

  return employee as { id: string; organisation_id: string; full_name: string } | null;
}

async function createInviteRecord(params: {
  workspaceId: string;
  invitedEmail: string;
  invitedFullName?: string | null;
  employeeId?: string | null;
  role: Role;
  permissionPresetId?: string | null;
  createdBy: string;
  status: 'draft' | 'sent';
}) {
  const admin = createAdminClient();
  const token = createInviteToken();
  const inviteCode = createInviteCode();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await admin
    .from('organisation_invites')
    .update({ status: 'expired' })
    .eq('workspace_id', params.workspaceId)
    .eq('invited_email', params.invitedEmail)
    .in('status', ['draft', 'sent'])
    .lt('expires_at', new Date().toISOString());

  const { data: existingInvite } = await admin
    .from('organisation_invites')
    .select('id')
    .eq('workspace_id', params.workspaceId)
    .eq('invited_email', params.invitedEmail)
    .in('status', ['draft', 'sent'])
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existingInvite) {
    return { invite: null, token: null, error: 'An active invite already exists for this email.' };
  }

  const { data: invite, error } = await admin
    .from('organisation_invites')
    .insert({
      organisation_id: params.workspaceId,
      workspace_id: params.workspaceId,
      email: params.invitedEmail,
      invited_email: params.invitedEmail,
      invited_full_name: params.invitedFullName?.trim() || null,
      employee_id: params.employeeId ?? null,
      invite_code: inviteCode,
      token_hash: hashInviteToken(token),
      token: null,
      role: params.role,
      permission_preset_id: params.permissionPresetId ?? null,
      status: params.status,
      expires_at: expiresAt,
      created_by: params.createdBy,
    })
    .select('*')
    .single();

  if (error) {
    return { invite: null, token: null, error: error.message };
  }

  return { invite, token, error: null };
}

async function sendInviteEmail(params: {
  email: string;
  token: string;
  inviteCode: string;
}) {
  const redirectTo = `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(
    `/invite/${params.token}?code=${params.inviteCode}`,
  )}`;

  const { error } = await createAdminClient().auth.admin.inviteUserByEmail(
    params.email,
    { redirectTo },
  );

  return error?.message ?? null;
}

export async function sendInvite(params: {
  orgId: string;
  email: string;
  role: Role;
  invitedFullName?: string;
  employeeId?: string | null;
  permissionPresetId?: string | null;
}): Promise<{ data: InviteRow | null; error: string | null }> {
  const { orgId, email, role: inviteRole } = params;
  const { role, user } = await assertActiveOrgId(orgId);

  try {
    assertAdminRole(role);
  } catch (error) {
    return { data: null, error: permissionDenied(error) };
  }

  const invitedEmail = normalizeEmail(email);
  if (!invitedEmail || !invitedEmail.includes('@')) {
    return { data: null, error: 'A valid email address is required.' };
  }
  if (!ALL_ROLES.includes(inviteRole)) {
    return { data: null, error: `Invalid role: ${inviteRole}` };
  }

  if (params.employeeId) {
    const employee = await assertEmployeeInActiveWorkspace(params.employeeId, orgId);
    if (!employee) return { data: null, error: 'Employee not found in this workspace.' };
  }

  const { invite, token, error } = await createInviteRecord({
    workspaceId: orgId,
    invitedEmail,
    invitedFullName: params.invitedFullName,
    employeeId: params.employeeId,
    role: inviteRole,
    permissionPresetId: params.permissionPresetId,
    createdBy: user.id,
    status: 'sent',
  });

  if (error || !invite || !token) {
    await trackProductEvent({
      organisationId: orgId,
      userId: user.id,
      eventType: 'invite_failed',
      moduleKey: 'members',
      path: '/settings',
      metadata: { email: invitedEmail, reason: error ?? 'insert_failed' },
    });
    return { data: null, error: error ?? 'Failed to create invite.' };
  }

  const emailError = await sendInviteEmail({
    email: invitedEmail,
    token,
    inviteCode: invite.invite_code,
  });

  if (emailError) {
    await createAdminClient().from('organisation_invites').delete().eq('id', invite.id);
    return { data: null, error: `Failed to send invite email: ${emailError}` };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'invite_user',
    entityType: 'organisation_invite',
    entityId: invite.id,
    metadata: { email: invitedEmail, role: inviteRole, employeeId: params.employeeId ?? null },
  });

  await trackProductEvent({
    organisationId: orgId,
    userId: user.id,
    eventType: 'invite_sent',
    moduleKey: 'members',
    path: '/settings',
    metadata: { email: invitedEmail, role: inviteRole },
  });

  return {
    data: mapInvite(invite, buildInviteUrl(token, invite.invite_code)),
    error: null,
  };
}

export async function generatePortalInvite(params: {
  employeeId?: string | null;
  invitedEmail: string;
  invitedFullName?: string | null;
  role: Role;
  permissionPresetId?: string | null;
}): Promise<{ data: InviteRow | null; error: string | null }> {
  let ctx;
  try {
    ctx = await ensureAdminContext();
  } catch (error) {
    return { data: null, error: permissionDenied(error) };
  }

  const invitedEmail = normalizeEmail(params.invitedEmail);
  if (!invitedEmail || !invitedEmail.includes('@')) {
    return { data: null, error: 'A valid email address is required.' };
  }
  if (!ALL_ROLES.includes(params.role)) {
    return { data: null, error: `Invalid role: ${params.role}` };
  }

  if (params.employeeId) {
    const employee = await assertEmployeeInActiveWorkspace(params.employeeId, ctx.orgId);
    if (!employee) return { data: null, error: 'Employee not found in this workspace.' };
  }

  const { invite, token, error } = await createInviteRecord({
    workspaceId: ctx.orgId,
    invitedEmail,
    invitedFullName: params.invitedFullName,
    employeeId: params.employeeId,
    role: params.role,
    permissionPresetId: params.permissionPresetId,
    createdBy: ctx.user.id,
    status: 'draft',
  });

  if (error || !invite || !token) {
    return { data: null, error: error ?? 'Failed to generate invite.' };
  }

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'generate_portal_invite',
    entityType: 'organisation_invite',
    entityId: invite.id,
    metadata: { email: invitedEmail, employeeId: params.employeeId ?? null },
  });

  revalidatePath('/employees');
  return {
    data: mapInvite(invite, buildInviteUrl(token, invite.invite_code)),
    error: null,
  };
}

export async function listInvites(
  orgId: string,
): Promise<{ data: InviteRow[]; error: string | null }> {
  await assertActiveOrgId(orgId);

  const { data, error } = await createAdminClient()
    .from('organisation_invites')
    .select('*')
    .eq('workspace_id', orgId)
    .in('status', ['draft', 'sent'])
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((row) => mapInvite(row)), error: null };
}

export async function revokeInvite(
  inviteId: string,
): Promise<{ error: string | null }> {
  let ctx;
  try {
    ctx = await ensureAdminContext();
  } catch (error) {
    return { error: permissionDenied(error) };
  }

  const { error } = await createAdminClient()
    .from('organisation_invites')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', inviteId)
    .eq('workspace_id', ctx.orgId)
    .in('status', ['draft', 'sent']);

  if (error) return { error: error.message };

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'revoke_invite',
    entityType: 'organisation_invite',
    entityId: inviteId,
  });

  revalidatePath('/employees');
  revalidatePath('/settings');
  return { error: null };
}

export async function resendInvite(
  inviteId: string,
): Promise<{ data?: InviteRow | null; error: string | null }> {
  let ctx;
  try {
    ctx = await ensureAdminContext();
  } catch (error) {
    return { error: permissionDenied(error) };
  }

  const admin = createAdminClient();
  const { data: invite, error: fetchErr } = await admin
    .from('organisation_invites')
    .select('*')
    .eq('id', inviteId)
    .eq('workspace_id', ctx.orgId)
    .in('status', ['draft', 'sent'])
    .maybeSingle();

  if (fetchErr || !invite) {
    return { error: 'Invite not found.' };
  }

  if (invite.revoked_at || invite.status === 'revoked') {
    return { error: 'Revoked invites cannot be resent.' };
  }
  if (invite.accepted_at || invite.status === 'accepted') {
    return { error: 'Accepted invites cannot be reused.' };
  }

  const token = createInviteToken();
  const inviteCode = createInviteCode();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: updatedInvite, error: updateErr } = await admin
    .from('organisation_invites')
    .update({
      token: null,
      token_hash: hashInviteToken(token),
      invite_code: inviteCode,
      expires_at: expiresAt,
      status: 'sent',
      revoked_at: null,
    })
    .eq('id', inviteId)
    .eq('workspace_id', ctx.orgId)
    .in('status', ['draft', 'sent'])
    .select('*')
    .single();

  if (updateErr || !updatedInvite) {
    return { error: updateErr?.message ?? 'Failed to refresh invite.' };
  }

  const emailError = await sendInviteEmail({
    email: updatedInvite.invited_email ?? updatedInvite.email,
    token,
    inviteCode,
  });

  if (emailError) {
    return { error: `Failed to resend invite: ${emailError}` };
  }

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'resend_invite',
    entityType: 'organisation_invite',
    entityId: inviteId,
    metadata: { email: updatedInvite.invited_email ?? updatedInvite.email },
  });

  revalidatePath('/employees');
  revalidatePath('/settings');
  return { data: mapInvite(updatedInvite, buildInviteUrl(token, inviteCode)), error: null };
}

export async function acceptInvite(
  token: string,
  inviteCode?: string | null,
): Promise<{ error: string | null; orgName?: string }> {
  const user = await requireSession();
  const admin = createAdminClient();
  const tokenHash = hashInviteToken(token);

  const { data: invite, error: fetchErr } = await admin
    .from('organisation_invites')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (fetchErr || !invite) {
    return { error: 'Invalid invite link.' };
  }

  const workspaceId = invite.workspace_id ?? invite.organisation_id;
  const invitedEmail = normalizeEmail(invite.invited_email ?? invite.email);

  if (invite.status === 'accepted' || invite.accepted_at) {
    return { error: 'This invite has already been accepted.' };
  }
  if (invite.status === 'revoked' || invite.revoked_at) {
    return { error: 'This invite has been revoked.' };
  }
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    await admin
      .from('organisation_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id);
    return { error: 'This invite has expired.' };
  }
  if (invite.invite_code && inviteCode && invite.invite_code.toUpperCase() !== inviteCode.toUpperCase()) {
    return { error: 'Invite code does not match this link.' };
  }
  if (invite.invite_code && !inviteCode && invite.token !== token) {
    return { error: 'Invite code is required.' };
  }
  if (normalizeEmail(user.email ?? '') !== invitedEmail) {
    return { error: `This invite was sent to ${invitedEmail}. Sign in with that email to accept it.` };
  }

  const { data: existingMembership } = await admin
    .from('memberships')
    .select('id, status')
    .eq('organisation_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  let membershipId = existingMembership?.id as string | undefined;
  if (existingMembership?.status === 'active') {
    membershipId = existingMembership.id;
  } else if (existingMembership?.status === 'disabled') {
    const { error } = await admin
      .from('memberships')
      .update({
        status: 'active',
        role: invite.role,
        joined_at: new Date().toISOString(),
        invited_by: invite.created_by,
        invited_at: invite.created_at,
      })
      .eq('id', existingMembership.id);
    if (error) return { error: `Failed to re-enable membership: ${error.message}` };
    membershipId = existingMembership.id;
  } else {
    const { data: membership, error } = await admin
      .from('memberships')
      .insert({
        organisation_id: workspaceId,
        user_id: user.id,
        role: invite.role,
        status: 'active',
        invited_by: invite.created_by,
        invited_at: invite.created_at,
        joined_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) return { error: `Failed to join workspace: ${error.message}` };
    membershipId = membership.id;
  }

  const { data: acceptedInvite, error: acceptErr } = await admin
    .from('organisation_invites')
    .update({
      status: 'accepted',
      accepted_by: user.id,
      accepted_at: new Date().toISOString(),
      token_hash: null,
      token: null,
    })
    .eq('id', invite.id)
    .eq('token_hash', tokenHash)
    .in('status', ['draft', 'sent'])
    .is('accepted_at', null)
    .select('id')
    .maybeSingle();

  if (acceptErr || !acceptedInvite) {
    return { error: 'This invite could not be accepted. It may already have been used.' };
  }

  await admin.from('profiles').update({ active_organisation_id: workspaceId }).eq('id', user.id);

  if (membershipId) {
    const { data: existingPermission } = await admin
      .from('portal_user_permissions')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('membership_id', membershipId)
      .maybeSingle();

  const { data: presetForInvite } = invite.permission_preset_id
    ? await admin
        .from('portal_permission_presets')
        .select('permissions')
        .eq('id', invite.permission_preset_id)
        .maybeSingle()
    : { data: null };

  const permissionPayload = {
      workspace_id: workspaceId,
      membership_id: membershipId,
      user_id: user.id,
      employee_id: invite.employee_id ?? null,
      permission_preset_id: invite.permission_preset_id ?? null,
      permissions: normalizePortalPermissions(presetForInvite?.permissions ?? DEFAULT_PORTAL_PERMISSIONS),
      updated_by: user.id,
    };

    if (existingPermission) {
      await admin
        .from('portal_user_permissions')
        .update(permissionPayload)
        .eq('id', existingPermission.id);
    } else {
      await admin
        .from('portal_user_permissions')
        .insert({ ...permissionPayload, created_by: invite.created_by ?? null });
    }
  }

  const { data: org } = await admin
    .from('organisations')
    .select('name')
    .eq('id', workspaceId)
    .single();

  await logAuditEvent({
    orgId: workspaceId,
    userId: user.id,
    action: 'accept_invite',
    entityType: 'organisation_invite',
    entityId: invite.id,
    metadata: { email: invitedEmail, employeeId: invite.employee_id ?? null },
  });

  await trackProductEvent({
    organisationId: workspaceId,
    userId: user.id,
    eventType: 'invite_accepted',
    moduleKey: 'members',
    path: '/invite',
    metadata: { orgName: org?.name ?? null },
  });

  return { error: null, orgName: org?.name ?? undefined };
}

export async function getEmployeePortalAccess(
  employeeId: string,
): Promise<{ data: EmployeePortalAccessData | null; error: string | null }> {
  let ctx;
  try {
    ctx = await ensureAdminContext();
  } catch (error) {
    return { data: null, error: permissionDenied(error) };
  }

  const employee = await assertEmployeeInActiveWorkspace(employeeId, ctx.orgId);
  if (!employee) return { data: null, error: 'Employee not found in this workspace.' };

  const admin = createAdminClient();
  const permissionRes = await admin
    .from('portal_user_permissions')
    .select('*')
    .eq('workspace_id', ctx.orgId)
    .eq('employee_id', employeeId)
    .order('user_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const assignmentUserId = permissionRes.data?.user_id ?? '00000000-0000-0000-0000-000000000000';
  const [
    invitesRes,
    presetsRes,
    budgetsRes,
    budgetCategoriesRes,
    fundsRes,
    categoriesRes,
    bankAccountsRes,
    budgetAssignmentsRes,
    fundAssignmentsRes,
    categoryAssignmentsRes,
    cardAssignmentsRes,
    auditRes,
  ] = await Promise.all([
    admin
      .from('organisation_invites')
      .select('*')
      .eq('workspace_id', ctx.orgId)
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false }),
    admin
      .from('portal_permission_presets')
      .select('*')
      .or(`workspace_id.eq.${ctx.orgId},is_system_preset.eq.true`)
      .order('name'),
    admin
      .from('budgets')
      .select('id, name')
      .eq('organisation_id', ctx.orgId)
      .order('created_at', { ascending: false }),
    admin
      .from('budget_lines')
      .select('account_id, accounts(name, code)')
      .eq('organisation_id', ctx.orgId)
      .limit(100),
    admin
      .from('funds')
      .select('id, name')
      .eq('organisation_id', ctx.orgId)
      .order('name'),
    admin
      .from('register_categories')
      .select('id, name, group_name')
      .eq('organisation_id', ctx.orgId)
      .order('name'),
    admin
      .from('bank_accounts')
      .select('id, name, account_number_last4')
      .eq('organisation_id', ctx.orgId)
      .order('name'),
    admin
      .from('user_budget_assignments')
      .select('*')
      .eq('workspace_id', ctx.orgId)
      .eq('user_id', assignmentUserId),
    admin
      .from('user_fund_assignments')
      .select('*')
      .eq('workspace_id', ctx.orgId)
      .eq('user_id', assignmentUserId),
    admin
      .from('user_category_assignments')
      .select('*')
      .eq('workspace_id', ctx.orgId)
      .eq('user_id', assignmentUserId),
    admin
      .from('user_card_assignments')
      .select('*')
      .eq('workspace_id', ctx.orgId)
      .eq('user_id', assignmentUserId)
      .order('created_at', { ascending: false }),
    admin
      .from('audit_log')
      .select('id, action, metadata, created_at')
      .eq('organisation_id', ctx.orgId)
      .eq('entity_type', 'organisation_invite')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  if (invitesRes.error) return { data: null, error: invitesRes.error.message };

  return {
    data: {
      invites: (invitesRes.data ?? []).map((row) => mapInvite(row)),
      permission: mapPermission(permissionRes.data),
      presets: (presetsRes.data ?? []).map((row) => mapPreset(row)),
      budgets: (budgetsRes.data ?? []).map((row) => ({ id: row.id, name: row.name })),
      budgetCategories: (budgetCategoriesRes.data ?? []).map((row) => {
        const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
        return {
          id: row.account_id,
          name: account?.name ?? row.account_id,
          label: account?.code ?? undefined,
        };
      }),
      funds: (fundsRes.data ?? []).map((row) => ({ id: row.id, name: row.name })),
      categories: (categoriesRes.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        label: row.group_name ?? undefined,
      })),
      bankAccounts: (bankAccountsRes.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        label: row.account_number_last4 ? `•••• ${row.account_number_last4}` : undefined,
      })),
      budgetAssignments: (budgetAssignmentsRes.data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        budgetId: row.budget_id,
        budgetCategoryId: row.budget_category_id ?? null,
        canView: row.can_view,
        canSubmitAgainst: row.can_submit_against,
        spendingLimit: row.spending_limit ?? null,
      })),
      fundAssignments: (fundAssignmentsRes.data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        fundId: row.fund_id,
        canView: row.can_view,
        canSubmitAgainst: row.can_submit_against,
      })),
      categoryAssignments: (categoryAssignmentsRes.data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        categoryId: row.category_id,
        canView: row.can_view,
        canSubmitAgainst: row.can_submit_against,
      })),
      cardAssignments: (cardAssignmentsRes.data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        bankAccountId: row.bank_account_id ?? null,
        cardName: row.card_name,
        lastFour: row.last_four ?? null,
        spendingLimit: row.spending_limit ?? null,
        status: row.status,
      })),
      recentActivity: (auditRes.data ?? []).map((row) => ({
        id: row.id,
        action: row.action,
        createdAt: row.created_at,
        metadata: row.metadata ?? {},
      })),
    },
    error: null,
  };
}

export async function saveEmployeePortalPermissions(params: {
  employeeId: string;
  permissionPresetId?: string | null;
  permissions: Record<string, unknown>;
  assignedBudgetIds?: string[];
  assignedFundIds?: string[];
  linkedBankAccountIds?: string[];
  budgetAssignments?: {
    budgetId: string;
    budgetCategoryId?: string | null;
    canView: boolean;
    canSubmitAgainst: boolean;
    spendingLimit?: number | null;
  }[];
  fundAssignments?: {
    fundId: string;
    canView: boolean;
    canSubmitAgainst: boolean;
  }[];
  categoryAssignments?: {
    categoryId: string;
    canView: boolean;
    canSubmitAgainst: boolean;
  }[];
  cardAssignments?: {
    bankAccountId?: string | null;
    cardName: string;
    lastFour?: string | null;
    spendingLimit?: number | null;
    status: 'active' | 'inactive' | 'archived';
  }[];
}): Promise<{ error: string | null }> {
  let ctx;
  try {
    ctx = await ensureAdminContext();
  } catch (error) {
    return { error: permissionDenied(error) };
  }

  const employee = await assertEmployeeInActiveWorkspace(params.employeeId, ctx.orgId);
  if (!employee) return { error: 'Employee not found in this workspace.' };

  const admin = createAdminClient();
  const { data: existingRows } = await admin
    .from('portal_user_permissions')
    .select('id, user_id')
    .eq('workspace_id', ctx.orgId)
    .eq('employee_id', params.employeeId)
    .limit(5);
  const existing = (existingRows ?? []).find((row) => row.user_id) ?? existingRows?.[0] ?? null;

  const payload = {
    workspace_id: ctx.orgId,
    employee_id: params.employeeId,
    permission_preset_id: params.permissionPresetId || null,
    permissions: params.permissions,
    assigned_budget_ids: params.assignedBudgetIds ?? params.budgetAssignments?.map((assignment) => assignment.budgetId) ?? [],
    assigned_fund_ids: params.assignedFundIds ?? params.fundAssignments?.map((assignment) => assignment.fundId) ?? [],
    linked_bank_account_ids: params.linkedBankAccountIds ?? params.cardAssignments?.flatMap((assignment) => assignment.bankAccountId ? [assignment.bankAccountId] : []) ?? [],
    updated_by: ctx.user.id,
  };

  const { error } = existing
    ? await admin
        .from('portal_user_permissions')
        .update(payload)
        .eq('id', existing.id)
        .eq('workspace_id', ctx.orgId)
    : await admin
        .from('portal_user_permissions')
        .insert({ ...payload, created_by: ctx.user.id });

  if (error) return { error: error.message };

  const targetUserId = existing?.user_id ?? null;
  if (targetUserId) {
    await Promise.all([
      admin.from('user_budget_assignments').delete().eq('workspace_id', ctx.orgId).eq('user_id', targetUserId),
      admin.from('user_fund_assignments').delete().eq('workspace_id', ctx.orgId).eq('user_id', targetUserId),
      admin.from('user_category_assignments').delete().eq('workspace_id', ctx.orgId).eq('user_id', targetUserId),
      admin.from('user_card_assignments').delete().eq('workspace_id', ctx.orgId).eq('user_id', targetUserId),
    ]);

    const budgetAssignments = params.budgetAssignments ?? (params.assignedBudgetIds ?? []).map((budgetId) => ({
      budgetId,
      budgetCategoryId: null,
      canView: true,
      canSubmitAgainst: false,
      spendingLimit: null,
    }));
    const fundAssignments = params.fundAssignments ?? (params.assignedFundIds ?? []).map((fundId) => ({
      fundId,
      canView: true,
      canSubmitAgainst: false,
    }));
    const cardAssignments = params.cardAssignments ?? [];

    await Promise.all([
      budgetAssignments.length
        ? admin.from('user_budget_assignments').insert(budgetAssignments.map((assignment) => ({
            workspace_id: ctx.orgId,
            user_id: targetUserId,
            budget_id: assignment.budgetId,
            budget_category_id: assignment.budgetCategoryId ?? null,
            can_view: assignment.canView,
            can_submit_against: assignment.canSubmitAgainst,
            spending_limit: assignment.spendingLimit ?? null,
            created_by: ctx.user.id,
          })))
        : Promise.resolve({ error: null }),
      fundAssignments.length
        ? admin.from('user_fund_assignments').insert(fundAssignments.map((assignment) => ({
            workspace_id: ctx.orgId,
            user_id: targetUserId,
            fund_id: assignment.fundId,
            can_view: assignment.canView,
            can_submit_against: assignment.canSubmitAgainst,
            created_by: ctx.user.id,
          })))
        : Promise.resolve({ error: null }),
      (params.categoryAssignments ?? []).length
        ? admin.from('user_category_assignments').insert((params.categoryAssignments ?? []).map((assignment) => ({
            workspace_id: ctx.orgId,
            user_id: targetUserId,
            category_id: assignment.categoryId,
            can_view: assignment.canView,
            can_submit_against: assignment.canSubmitAgainst,
            created_by: ctx.user.id,
          })))
        : Promise.resolve({ error: null }),
      cardAssignments.length
        ? admin.from('user_card_assignments').insert(cardAssignments.map((assignment) => ({
            workspace_id: ctx.orgId,
            user_id: targetUserId,
            bank_account_id: assignment.bankAccountId ?? null,
            card_name: assignment.cardName,
            last_four: assignment.lastFour ?? null,
            spending_limit: assignment.spendingLimit ?? null,
            status: assignment.status,
            created_by: ctx.user.id,
          })))
        : Promise.resolve({ error: null }),
    ]);
    await createPortalNotification({
      workspaceId: ctx.orgId,
      userId: targetUserId,
      type: 'budget_changed',
      title: 'Portal access updated',
      body: 'Your budget, fund, or portal permissions were updated by an admin.',
      sourceType: 'employee',
      sourceId: params.employeeId,
      href: '/portal/dashboard',
    });
  }

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'update_portal_permissions',
    entityType: 'employee',
    entityId: params.employeeId,
    metadata: {
      permissionPresetId: params.permissionPresetId ?? null,
      assignedBudgetCount: params.budgetAssignments?.length ?? params.assignedBudgetIds?.length ?? 0,
      assignedFundCount: params.fundAssignments?.length ?? params.assignedFundIds?.length ?? 0,
      linkedBankAccountCount: params.cardAssignments?.length ?? params.linkedBankAccountIds?.length ?? 0,
    },
  });

  revalidatePath(`/employees/${params.employeeId}`);
  return { error: null };
}
