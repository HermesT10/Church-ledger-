import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260429195000_user_portal_invites_permissions.sql', import.meta.url),
  'utf8',
);
const inviteActions = readFileSync(
  new URL('../src/lib/invites/actions.ts', import.meta.url),
  'utf8',
);
const inviteRoute = readFileSync(
  new URL('../src/app/invite/[token]/page.tsx', import.meta.url),
  'utf8',
);
const employeeDetail = readFileSync(
  new URL('../src/app/(app)/employees/[id]/employee-detail-client.tsx', import.meta.url),
  'utf8',
);
const audit = readFileSync(
  new URL('../docs/audits/user-portal-invites-permissions-audit.md', import.meta.url),
  'utf8',
);

describe('user portal invite and permission foundation', () => {
  it('stores secure invite metadata without requiring raw tokens', () => {
    expect(migration).toContain('token_hash text');
    expect(migration).toContain('invite_code text');
    expect(migration).toContain("status in ('draft', 'sent', 'accepted', 'expired', 'revoked')");
    expect(migration).toContain('alter column token drop not null');
    expect(migration).toContain('idx_organisation_invites_token_hash');
    expect(inviteActions).toContain('randomBytes(32)');
    expect(inviteActions).toContain("createHash('sha256')");
  });

  it('enforces admin-only create, send, resend, and revoke paths', () => {
    expect(inviteActions).toContain("assertCanPerform(role, 'create', 'members')");
    expect(inviteActions).toContain('ensureAdminContext');
    expect(migration).toContain('public.is_org_admin(workspace_id)');
    expect(migration).toContain('invites_update_admin');
  });

  it('blocks expired, revoked, reused, wrong-code, and cross-user acceptance', () => {
    expect(inviteActions).toContain("invite.status === 'accepted'");
    expect(inviteActions).toContain("invite.status === 'revoked'");
    expect(inviteActions).toContain("status: 'expired'");
    expect(inviteActions).toContain('Invite code does not match this link.');
    expect(inviteActions).toContain('Invite code is required.');
    expect(inviteActions).toContain("normalizeEmail(user.email ?? '') !== invitedEmail");
    expect(inviteActions).toContain('.is(\'accepted_at\', null)');
  });

  it('connects users to the server-resolved workspace and records portal scope', () => {
    expect(inviteActions).toContain('workspaceId = invite.workspace_id ?? invite.organisation_id');
    expect(inviteActions).toContain("from('memberships')");
    expect(inviteActions).toContain("from('portal_user_permissions')");
    expect(inviteActions).toContain("eq('workspace_id', ctx.orgId)");
    expect(inviteActions).toContain('assertEmployeeInActiveWorkspace');
  });

  it('surfaces portal access on employee detail with required controls', () => {
    expect(employeeDetail).toContain('Portal Access');
    expect(employeeDetail).toContain('Generate invite');
    expect(employeeDetail).toContain('Copy invite link');
    expect(employeeDetail).toContain('Send invite email');
    expect(employeeDetail).toContain('Budget assignment table');
    expect(employeeDetail).toContain('Fund assignment table');
    expect(employeeDetail).toContain('Card assignment table');
    expect(inviteRoute).toContain('acceptInvite(token, code)');
  });

  it('documents audit findings and logs invite events', () => {
    expect(audit).toContain('Schema Gaps');
    expect(audit).toContain('RLS Risks');
    expect(audit).toContain('Implementation Sequence');
    expect(inviteActions).toContain("action: 'generate_portal_invite'");
    expect(inviteActions).toContain("action: 'accept_invite'");
    expect(inviteActions).toContain("action: 'revoke_invite'");
  });
});
