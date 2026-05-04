import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

describe('user account deletion lifecycle migration', () => {
  const migration = read('supabase/migrations/20260502140000_user_account_deletion_lifecycle.sql');

  it('adds profile, membership, and employee lifecycle fields', () => {
    expect(migration).toContain('add column if not exists status text not null default');
    expect(migration).toContain('add column if not exists deleted_at timestamptz');
    expect(migration).toContain('add column if not exists anonymised_at timestamptz');
    expect(migration).toContain('add column if not exists removed_at timestamptz');
    expect(migration).toContain('add column if not exists archived_at timestamptz');
    expect(migration).toContain('archive_reason');
  });

  it('preserves historical actor records with set-null foreign keys', () => {
    expect(migration).toContain("('audit_log', 'user_id')");
    expect(migration).toContain("('invoice_submissions', 'submitted_by')");
    expect(migration).toContain("('cash_collection_submissions', 'submitted_by')");
    expect(migration).toContain('references public.profiles(id) on delete set null');
  });

  it('defines server-only helper RPCs for anonymisation, removal, and staff dependency preview', () => {
    expect(migration).toContain('anonymise_user_personal_data');
    expect(migration).toContain('remove_user_from_workspace');
    expect(migration).toContain('get_employee_delete_dependency_preview');
    expect(migration).toContain('revoke all on function public.anonymise_user_personal_data');
    expect(migration).toContain('from anon, authenticated');
  });
});

describe('self-service account deletion', () => {
  const actions = read('src/lib/account-deletion/actions.ts');
  const profileClient = read('src/app/(app)/profile/profile-client.tsx');

  it('requires typed confirmation and blocks sole active admins', () => {
    expect(actions).toContain("const SELF_DELETE_CONFIRMATION = 'DELETE MY ACCOUNT'");
    expect(actions).toContain('account_deletion_blocked_sole_admin');
    expect(actions).toContain("role', 'admin'");
    expect(actions).toContain("status', 'active'");
  });

  it('uses server-only Supabase admin deleteUser and never exposes the service key', () => {
    expect(actions).toContain("'use server'");
    expect(actions).toContain('createAdminClient');
    expect(actions).toContain('auth.admin.deleteUser');
    expect(actions).not.toContain('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');
  });

  it('shows account danger zone copy and final confirmation UI', () => {
    expect(profileClient).toContain('Danger Zone');
    expect(profileClient).toContain('DELETE MY ACCOUNT');
    expect(profileClient).toContain('Historical accounting records will remain');
  });
});

describe('organisation user removal and staff archive/delete', () => {
  const settingsActions = read('src/app/(app)/settings/actions.ts');
  const settingsClient = read('src/app/(app)/settings/settings-client.tsx');
  const employeeActions = read('src/lib/employees/actions.ts');
  const employeeDetail = read('src/app/(app)/employees/[id]/employee-detail-client.tsx');

  it('soft-removes workspace users without deleting Supabase Auth users', () => {
    expect(settingsActions).toContain('remove_user_from_workspace');
    expect(settingsActions).toContain('admin_removed_user_from_organisation');
    expect(settingsActions).not.toContain('auth.admin.deleteUser(userId');
    expect(settingsClient).toContain('REMOVE USER');
    expect(settingsClient).toContain('Supabase login is not deleted');
  });

  it('archives staff with metadata and hard-deletes only after dependency preview', () => {
    expect(employeeActions).toContain('get_employee_delete_dependency_preview');
    expect(employeeActions).toContain('archive_reason');
    expect(employeeActions).toContain('deleteEmployeeIfSafe');
    expect(employeeDetail).toContain('Dependency preview');
    expect(employeeDetail).toContain('DELETE STAFF');
  });
});
