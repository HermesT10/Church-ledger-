import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

describe('workspace data reset migration', () => {
  const migration = read('supabase/migrations/20260501113600_workspace_data_reset.sql');
  const repairMigration = read('supabase/migrations/20260501121200_workspace_data_reset_repair.sql');

  it('creates durable history and demo registry tables', () => {
    expect(migration).toContain('create table if not exists public.workspace_data_reset_runs');
    expect(migration).toContain('create table if not exists public.demo_seed_records');
    expect(migration).toContain('constraint demo_seed_records_unique_record');
    expect(migration).toContain('workspace_data_reset_runs_action_check');
  });

  it('adds preview, demo delete, and full reset RPCs', () => {
    expect(migration).toContain('preview_workspace_data_reset');
    expect(migration).toContain('delete_workspace_demo_data');
    expect(migration).toContain('reset_workspace_financial_data');
    expect(migration).toContain('run_workspace_data_delete');
  });

  it('keeps destructive RPCs server-only through execute revokes', () => {
    expect(migration).toContain('revoke all on function public.preview_workspace_data_reset');
    expect(migration).toContain('from anon, authenticated');
    expect(migration).toContain('revoke all on function public.reset_workspace_financial_data');
  });

  it('orders dependent data before parent financial records', () => {
    expect(migration.indexOf("'journal_lines', 'ledger'")).toBeLessThan(migration.indexOf("'journals', 'ledger'"));
    expect(migration.indexOf("'bill_lines', 'payables'")).toBeLessThan(migration.indexOf("'bills', 'payables'"));
    expect(migration.indexOf("'payment_run_items', 'payables'")).toBeLessThan(migration.indexOf("'payment_runs', 'payables'"));
    expect(migration.indexOf("'bank_reconciliation_matches', 'banking'")).toBeLessThan(migration.indexOf("'bank_lines', 'banking'"));
    expect(migration.indexOf("'accounts', 'accounts'")).toBeGreaterThan(migration.indexOf("'journals', 'ledger'"));
  });

  it('skips optional tables safely for older schemas', () => {
    expect(migration).toContain("to_regclass(format('public.%I', p_table))");
    expect(migration).toContain('if v_reg is null then');
    expect(migration).toContain('return 0;');
  });

  it('repairs full reset to clear financial references and setup state', () => {
    expect(repairMigration).toContain('workspace_reset_prepare_financial_references');
    expect(repairMigration).toContain('default_bank_account_id');
    expect(repairMigration).toContain('payroll_salaries_account_id');
    expect(repairMigration).toContain('gift_aid_default_fund_id');
    expect(repairMigration).toContain('workspace_reset_restore_blank_setup');
    expect(repairMigration).toContain("setup_type = 'blank'");
  });

  it('covers seeded bank account blockers in the repaired delete order', () => {
    expect(repairMigration).toContain("'cash_deposits', 'cash'");
    expect(repairMigration).toContain("'bank_statements', 'banking'");
    expect(repairMigration).toContain("'reconciliations', 'banking'");
    expect(repairMigration).toContain("'bank_reconciliation_certificates', 'banking'");
    expect(repairMigration.indexOf("'bank_lines', 'banking'")).toBeLessThan(repairMigration.indexOf("'bank_accounts', 'banking'"));
  });

  it('deletes child rows without direct organisation ids through parent joins', () => {
    expect(repairMigration).toContain("p_table = 'bill_lines'");
    expect(repairMigration).toContain('using public.bills b');
    expect(repairMigration).toContain("p_table = 'payment_run_items'");
    expect(repairMigration).toContain('using public.payment_runs pr');
    expect(repairMigration).toContain("p_table = 'payroll_run_splits'");
  });

  it('demo delete removes gift_aid_claim_lines tied to demo donations (FK safe)', () => {
    const m = read('supabase/migrations/20260502131000_workspace_demo_delete_gift_aid_claim_lines.sql');
    expect(m).toContain("p_table = 'gift_aid_claim_lines'");
    expect(m).toContain('d.demo_batch_id is not null');
    expect(m).toContain("dsr_d.table_name = %L");
    expect(m).toContain("'donations'");
    expect(m).toContain('public.workspace_reset_count_rows');
    expect(m).toContain('public.workspace_reset_delete_rows');
  });

  it('allows demo-tagged journal line cleanup when journal is posted (prevent_posted_journal_line)', () => {
    const m = read('supabase/migrations/20260502132000_prevent_posted_journal_line_demo_cleanup.sql');
    expect(m).toContain('prevent_posted_journal_line_mutation');
    expect(m).toContain('v_journal_demo_batch_id');
    expect(m).toContain("TG_OP in ('UPDATE', 'DELETE')");
    expect(m).toContain('old.demo_batch_id');
  });
});

describe('workspace data reset server actions', () => {
  const actions = read('src/app/(app)/settings/data-management/actions.ts');

  it('derives workspace context server-side and requires admins', () => {
    expect(actions).toContain('const ctx = await getActiveOrg();');
    expect(actions).toContain("ctx.role !== 'admin'");
    expect(actions).toContain('Only workspace admins can manage workspace data resets.');
  });

  it('does not accept a client workspace id for destructive actions', () => {
    expect(actions).toContain('deleteDemoDataAction(input:');
    expect(actions).not.toContain('deleteDemoDataAction(input: { workspaceId');
    expect(actions).toContain('target_workspace_id: ctx.orgId');
    expect(actions).toContain('requested_by: ctx.user.id');
  });

  it('requires exact typed confirmations on the server', () => {
    expect(actions).toContain("input.confirmation !== 'DELETE DEMO'");
    expect(actions).toContain("input.confirmation !== 'RESET'");
  });

  it('logs audit events and revalidates affected data surfaces', () => {
    expect(actions).toContain('logAuditEvent');
    expect(actions).toContain('invalidateOrgReportCache(orgId)');
    expect(actions).toContain("'/dashboard'");
    expect(actions).toContain("'/banking'");
    expect(actions).toContain("'/settings/data-management'");
  });
});

describe('workspace data reset UI', () => {
  const page = read('src/app/(app)/settings/data-management/page.tsx');
  const client = read('src/app/(app)/settings/data-management/data-management-client.tsx');
  const settingsClient = read('src/app/(app)/settings/settings-client.tsx');

  it('adds an admin-only settings route', () => {
    expect(page).toContain("redirect('/settings')");
    expect(page).toContain('getWorkspaceDataResetPreview');
    expect(page).toContain('DataManagementClient');
  });

  it('shows preview counts, confirmation inputs, summaries, and history', () => {
    expect(client).toContain('Largest affected tables');
    expect(client).toContain('DELETE DEMO');
    expect(client).toContain('RESET');
    expect(client).toContain('Reset History');
    expect(client).toContain('Completed.');
  });

  it('links settings users to data management', () => {
    expect(settingsClient).toContain('/settings/data-management');
    expect(settingsClient).toContain('Workspace Data Management');
    expect(settingsClient).not.toContain('Reset my workspace');
    expect(settingsClient).toContain('including bank accounts, accounts, funds, transactions, and setup progress');
  });
});

describe('global financial clean-slate RPC migration', () => {
  const migration = read('supabase/migrations/20260502130000_admin_global_clean_financial_data.sql');

  it('defines SECURITY DEFINER admin_global_clean_financial_data without top-level delete statements', () => {
    expect(migration).toContain('create or replace function public.admin_global_clean_financial_data');
    expect(migration).toContain('security definer');
    expect(migration).toContain('run_workspace_data_delete');
    expect(migration).not.toMatch(/^delete from /im);
  });

  it('revokes execute from application roles', () => {
    expect(migration).toContain(
      'revoke all on function public.admin_global_clean_financial_data(boolean, boolean) from anon',
    );
    expect(migration).toContain(
      'revoke all on function public.admin_global_clean_financial_data(boolean, boolean) from authenticated',
    );
  });
});

describe('demo and seed UI removal', () => {
  const settingsClient = read('src/app/(app)/settings/settings-client.tsx');
  const accountsPage = read('src/app/(app)/accounts/page.tsx');
  const fundsClient = read('src/app/(app)/funds/funds-client.tsx');
  const givingClient = read('src/app/(app)/giving-platforms/giving-platforms-client.tsx');

  it('does not expose removed demo or seed routes in settings navigation', () => {
    expect(settingsClient).not.toContain('/settings/demo-data');
    expect(settingsClient).not.toContain('/settings/seed');
    expect(settingsClient).not.toContain('Demo Data');
  });

  it('replaces seed links with onboarding or create flows', () => {
    expect(accountsPage).not.toContain('/settings/seed');
    expect(fundsClient).not.toContain('/settings/seed');
    expect(givingClient).not.toContain('/settings/seed');
  });
});

describe('dev-only seed entry points', () => {
  it('seed script is gated to development by default', () => {
    const seed = read('supabase/seed.ts');
    expect(seed).toContain('ALLOW_SUPABASE_SEED');
    expect(seed).toContain('NODE_ENV');
  });

  it('starter bank seed is disabled in production builds', () => {
    const banking = read('src/lib/banking/bankAccounts.ts');
    expect(banking).toContain("process.env.NODE_ENV === 'production'");
    expect(banking).toContain('Starter bank seed is only available in development.');
  });
});

describe('workspace data reset preview contract', () => {
  const actions = read('src/app/(app)/settings/data-management/actions.ts');

  it('surfaces preview_workspace_data_reset failures instead of silent empty preview', () => {
    expect(actions).toContain('previewError: error.message');
    expect(actions).not.toMatch(/if \(error\) \{\s*return emptyPreview/ms);
  });
});

describe('workspace data reset documentation', () => {
  it('documents the audit and implementation summaries', () => {
    const audit = read('docs/audits/workspace-data-reset-audit.md');
    const summary = read('docs/implementation/workspace-data-reset-summary.md');
    const globalSummary = read('docs/implementation/global-clean-slate-data-reset-summary.md');

    expect(audit).toContain('Current Security Risks');
    expect(audit).toContain('IDOR risk');
    expect(summary).toContain('Reset Scopes And Preserved Data');
    expect(summary).toContain('Troubleshooting');
    expect(globalSummary).toContain('admin_global_clean_financial_data');
    expect(globalSummary).toContain('Preflight');
  });
});
