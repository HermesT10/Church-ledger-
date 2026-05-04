'use server';

import { revalidatePath } from 'next/cache';
import { getActiveOrg } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateOrgReportCache } from '@/lib/cache';
import { logAuditEvent } from '@/lib/audit';

export type WorkspaceResetMode = 'demo' | 'financial';

export interface WorkspaceResetOptions {
  deleteDocuments: boolean;
  deleteReportExports: boolean;
}

export interface WorkspaceResetPreview {
  mode: WorkspaceResetMode;
  total: number;
  counts: Record<string, number>;
  modules: Record<string, number>;
  options: WorkspaceResetOptions;
  /** Set when preview_workspace_data_reset fails (e.g. invalid service role). */
  previewError?: string | null;
}

export interface WorkspaceResetResult {
  success: boolean;
  error: string | null;
  runId: string | null;
  total: number;
  counts: Record<string, number>;
  modules: Record<string, number>;
  /** Post-action preview still shows rows in scope — investigate or re-run. */
  warning?: string | null;
}

export interface WorkspaceResetHistoryItem {
  id: string;
  actionType: 'delete_demo_data' | 'reset_financial_data';
  status: 'requested' | 'completed' | 'failed';
  requestedBy: string | null;
  requestedByName: string | null;
  options: Record<string, unknown>;
  counts: Record<string, unknown>;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

type RawResetPayload = {
  mode?: WorkspaceResetMode;
  total?: number;
  counts?: Record<string, number>;
  modules?: Record<string, number>;
  options?: WorkspaceResetOptions;
  runId?: string;
};

const REVALIDATE_PATHS = [
  '/dashboard',
  '/banking',
  '/reports',
  '/funds',
  '/accounts',
  '/income/register',
  '/expenses/register',
  '/settings',
  '/settings/data-management',
  '/calendar',
  '/gift-aid',
  '/payroll',
  '/lettings',
  '/transactions',
  '/reconciliation',
  '/month-end',
];

function emptyPreview(mode: WorkspaceResetMode, options: WorkspaceResetOptions): WorkspaceResetPreview {
  return {
    mode,
    total: 0,
    counts: {},
    modules: {},
    options,
  };
}

function normalizeOptions(options?: Partial<WorkspaceResetOptions>): WorkspaceResetOptions {
  return {
    deleteDocuments: Boolean(options?.deleteDocuments),
    deleteReportExports: Boolean(options?.deleteReportExports),
  };
}

function asRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, raw]) => [key, Number(raw ?? 0)]),
  );
}

function normalizePreviewPayload(
  mode: WorkspaceResetMode,
  options: WorkspaceResetOptions,
  payload: unknown,
): WorkspaceResetPreview {
  const raw = (payload ?? {}) as RawResetPayload;
  return {
    mode: raw.mode ?? mode,
    total: Number(raw.total ?? 0),
    counts: asRecord(raw.counts),
    modules: asRecord(raw.modules),
    options: raw.options ?? options,
  };
}

function normalizeResultPayload(payload: unknown, warning?: string | null): WorkspaceResetResult {
  const raw = (payload ?? {}) as RawResetPayload;
  return {
    success: true,
    error: null,
    runId: raw.runId ?? null,
    total: Number(raw.total ?? 0),
    counts: asRecord(raw.counts),
    modules: asRecord(raw.modules),
    warning: warning ?? null,
  };
}

async function postResetPreviewWarning(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  mode: WorkspaceResetMode,
  options: WorkspaceResetOptions,
): Promise<string | null> {
  const { data, error } = await admin.rpc('preview_workspace_data_reset', {
    target_workspace_id: orgId,
    mode,
    delete_documents: options.deleteDocuments,
    delete_report_exports: options.deleteReportExports,
  });
  if (error) {
    return `Could not verify cleanup (preview failed: ${error.message}).`;
  }
  const preview = normalizePreviewPayload(mode, options, data);
  if (preview.total > 0) {
    return `Preview still reports ${preview.total} row(s) in this scope. If that is unexpected, refresh the page or check database connectivity.`;
  }
  return null;
}

async function requireWorkspaceAdmin() {
  const ctx = await getActiveOrg();
  if (ctx.role !== 'admin') {
    throw new Error('Only workspace admins can manage workspace data resets.');
  }
  return ctx;
}

function revalidateWorkspaceData(orgId: string) {
  invalidateOrgReportCache(orgId);
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

export async function getWorkspaceDataResetPreview(
  mode: WorkspaceResetMode,
  options?: Partial<WorkspaceResetOptions>,
): Promise<WorkspaceResetPreview> {
  const ctx = await requireWorkspaceAdmin();
  const safeOptions = normalizeOptions(options);
  const admin = createAdminClient();

  const { data, error } = await admin.rpc('preview_workspace_data_reset', {
    target_workspace_id: ctx.orgId,
    mode,
    delete_documents: safeOptions.deleteDocuments,
    delete_report_exports: safeOptions.deleteReportExports,
  });

  if (error) {
    return {
      ...emptyPreview(mode, safeOptions),
      previewError: error.message,
    };
  }

  return normalizePreviewPayload(mode, safeOptions, data);
}

export async function getWorkspaceDataResetHistory(): Promise<WorkspaceResetHistoryItem[]> {
  const ctx = await requireWorkspaceAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from('workspace_data_reset_runs')
    .select('id, action_type, status, requested_by, options, counts, error, created_at, completed_at, profiles(full_name)')
    .eq('workspace_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(12);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles as { full_name?: string | null } | null;
    return {
      id: String(row.id),
      actionType: row.action_type as WorkspaceResetHistoryItem['actionType'],
      status: row.status as WorkspaceResetHistoryItem['status'],
      requestedBy: (row.requested_by as string | null) ?? null,
      requestedByName: profile?.full_name ?? null,
      options: (row.options as Record<string, unknown>) ?? {},
      counts: (row.counts as Record<string, unknown>) ?? {},
      error: (row.error as string | null) ?? null,
      createdAt: String(row.created_at),
      completedAt: (row.completed_at as string | null) ?? null,
    };
  });
}

export async function deleteDemoDataAction(input: {
  confirmation: string;
  deleteDocuments?: boolean;
  deleteReportExports?: boolean;
}): Promise<WorkspaceResetResult> {
  const ctx = await requireWorkspaceAdmin();
  if (input.confirmation !== 'DELETE DEMO') {
    return { success: false, error: 'Type DELETE DEMO to confirm.', runId: null, total: 0, counts: {}, modules: {} };
  }

  const options = normalizeOptions(input);
  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'delete_demo_data_requested',
    entityType: 'workspace_data_reset',
    metadata: { options },
  });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('delete_workspace_demo_data', {
    target_workspace_id: ctx.orgId,
    delete_documents: options.deleteDocuments,
    delete_report_exports: options.deleteReportExports,
    requested_by: ctx.user.id,
  });

  if (error) {
    await logAuditEvent({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'delete_demo_data_failed',
      entityType: 'workspace_data_reset',
      metadata: { options, error: error.message },
    });
    return { success: false, error: error.message, runId: null, total: 0, counts: {}, modules: {} };
  }

  const warning = await postResetPreviewWarning(admin, ctx.orgId, 'demo', options);
  const result = normalizeResultPayload(data, warning);
  revalidateWorkspaceData(ctx.orgId);
  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'delete_demo_data_completed',
    entityType: 'workspace_data_reset',
    entityId: result.runId ?? undefined,
    metadata: { options, total: result.total, counts: result.counts, modules: result.modules, warning },
  });
  return result;
}

export async function resetFinancialDataAction(input: {
  confirmation: string;
  deleteDocuments?: boolean;
  deleteReportExports?: boolean;
}): Promise<WorkspaceResetResult> {
  const ctx = await requireWorkspaceAdmin();
  if (input.confirmation !== 'RESET') {
    return { success: false, error: 'Type RESET to confirm.', runId: null, total: 0, counts: {}, modules: {} };
  }

  const options = normalizeOptions(input);
  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'workspace_financial_reset_requested',
    entityType: 'workspace_data_reset',
    metadata: { options },
  });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('reset_workspace_financial_data', {
    target_workspace_id: ctx.orgId,
    delete_documents: options.deleteDocuments,
    delete_report_exports: options.deleteReportExports,
    requested_by: ctx.user.id,
  });

  if (error) {
    await logAuditEvent({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'workspace_financial_reset_failed',
      entityType: 'workspace_data_reset',
      metadata: { options, error: error.message },
    });
    return { success: false, error: error.message, runId: null, total: 0, counts: {}, modules: {} };
  }

  const warning = await postResetPreviewWarning(admin, ctx.orgId, 'financial', options);
  const result = normalizeResultPayload(data, warning);
  revalidateWorkspaceData(ctx.orgId);
  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'workspace_financial_reset_completed',
    entityType: 'workspace_data_reset',
    entityId: result.runId ?? undefined,
    metadata: { options, total: result.total, counts: result.counts, modules: result.modules, warning },
  });
  return result;
}
