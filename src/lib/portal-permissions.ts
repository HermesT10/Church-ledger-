import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  PORTAL_ACTION_KEYS,
  PORTAL_PAGE_KEYS,
  PORTAL_SCOPE_KEYS,
  type PortalActionKey,
  type PortalPageKey,
  type PortalScopeKey,
} from '@/lib/portal-permission-constants';

export {
  PORTAL_ACTION_KEYS,
  PORTAL_PAGE_KEYS,
  PORTAL_SCOPE_KEYS,
  type PortalActionKey,
  type PortalPageKey,
  type PortalScopeKey,
} from '@/lib/portal-permission-constants';

export interface PortalPermissionSet {
  pages: Record<PortalPageKey, boolean>;
  actions: Record<PortalActionKey, boolean>;
  scopes: Record<PortalScopeKey, boolean>;
}

export interface PortalPermissionScope {
  scope?: PortalScopeKey;
  budgetId?: string | null;
  budgetCategoryId?: string | null;
  fundId?: string | null;
  categoryId?: string | null;
  bankAccountId?: string | null;
  ownerUserId?: string | null;
  requireSubmit?: boolean;
}

export interface PortalPermissionContext {
  user: { id: string };
  orgId: string;
  role: string;
}

export interface PortalAccessContext extends PortalPermissionContext {
  permissions: PortalPermissionSet;
  isPrivilegedRole: boolean;
}

export class PortalPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortalPermissionError';
  }
}

export const DEFAULT_PORTAL_PERMISSION_SET: PortalPermissionSet = {
  pages: {
    dashboard: true,
    budgets: false,
    submit_invoices: false,
    cash_collections: false,
    expenses: false,
    calendar: true,
    restricted_funds: false,
    income_register: false,
    expense_register: false,
    documents: true,
  },
  actions: {
    view: true,
    create: false,
    edit_own: false,
    edit_all: false,
    submit: false,
    approve: false,
    upload: false,
    comment: false,
    delete_own: false,
  },
  scopes: {
    all_workspace: false,
    assigned_budgets: false,
    assigned_funds: false,
    assigned_categories: false,
    own_records: true,
  },
};

function readBooleanMap<T extends readonly string[]>(
  source: unknown,
  keys: T,
  fallback: Record<T[number], boolean>,
): Record<T[number], boolean> {
  const value = source && typeof source === 'object' ? source as Record<string, unknown> : {};
  return Object.fromEntries(
    keys.map((key) => {
      const typedKey = key as T[number];
      return [typedKey, typeof value[typedKey] === 'boolean' ? value[typedKey] : fallback[typedKey]];
    }),
  ) as Record<T[number], boolean>;
}

export function normalizePortalPermissions(input: unknown): PortalPermissionSet {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    pages: readBooleanMap(value.pages, PORTAL_PAGE_KEYS, DEFAULT_PORTAL_PERMISSION_SET.pages),
    actions: readBooleanMap(value.actions, PORTAL_ACTION_KEYS, DEFAULT_PORTAL_PERMISSION_SET.actions),
    scopes: readBooleanMap(value.scopes, PORTAL_SCOPE_KEYS, DEFAULT_PORTAL_PERMISSION_SET.scopes),
  };
}

export function mergePortalPermissions(
  preset: unknown,
  overrides: unknown,
): PortalPermissionSet {
  const base = normalizePortalPermissions(preset);
  const custom = normalizePortalPermissions(overrides);
  return {
    pages: { ...base.pages, ...custom.pages },
    actions: { ...base.actions, ...custom.actions },
    scopes: { ...base.scopes, ...custom.scopes },
  };
}

export function portalPermissionAllows(
  permissions: PortalPermissionSet,
  pageKey: PortalPageKey,
  actionKey: PortalActionKey,
  scope?: PortalScopeKey,
) {
  if (!permissions.pages[pageKey]) return false;
  if (!permissions.actions[actionKey]) return false;
  if (scope && !permissions.scopes[scope] && !permissions.scopes.all_workspace) return false;
  return true;
}

export async function getPortalAccessContext(
  userId: string,
  workspaceId: string,
): Promise<PortalAccessContext> {
  const admin = createAdminClient();
  const { data: membership } = await admin
    .from('memberships')
    .select('id, role, status')
    .eq('organisation_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership || membership.status !== 'active') {
    throw new PortalPermissionError('Active workspace membership is required.');
  }

  const isPrivilegedRole = membership.role === 'admin' || membership.role === 'treasurer';
  if (isPrivilegedRole) {
    return {
      user: { id: userId },
      orgId: workspaceId,
      role: membership.role,
      permissions: normalizePortalPermissions({
        pages: Object.fromEntries(PORTAL_PAGE_KEYS.map((key) => [key, true])),
        actions: Object.fromEntries(PORTAL_ACTION_KEYS.map((key) => [key, true])),
        scopes: Object.fromEntries(PORTAL_SCOPE_KEYS.map((key) => [key, true])),
      }),
      isPrivilegedRole,
    };
  }

  const { data: permissionRow } = await admin
    .from('portal_user_permissions')
    .select('permissions, permission_preset_id, portal_permission_presets(permissions)')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!permissionRow) {
    throw new PortalPermissionError('Portal permissions have not been configured for this user.');
  }

  const presetRelation = permissionRow.portal_permission_presets;
  const preset = Array.isArray(presetRelation) ? presetRelation[0] : presetRelation;
  return {
    user: { id: userId },
    orgId: workspaceId,
    role: membership.role,
    permissions: mergePortalPermissions(preset?.permissions, permissionRow.permissions),
    isPrivilegedRole,
  };
}

export async function requirePortalPermission(
  userId: string,
  workspaceId: string,
  pageKey: PortalPageKey,
  actionKey: PortalActionKey,
  scope: PortalPermissionScope = {},
): Promise<void> {
  const context = await getPortalAccessContext(userId, workspaceId);
  if (context.isPrivilegedRole) {
    return;
  }
  const admin = createAdminClient();
  const permissions = context.permissions;
  const requestedScope = scope.scope;

  if (!portalPermissionAllows(permissions, pageKey, actionKey, requestedScope)) {
    throw new PortalPermissionError('You do not have permission to perform this portal action.');
  }

  if (permissions.scopes.all_workspace || !requestedScope) {
    return;
  }

  if (requestedScope === 'own_records') {
    if (!scope.ownerUserId || scope.ownerUserId !== userId) {
      throw new PortalPermissionError('This action is limited to your own records.');
    }
    return;
  }

  if (requestedScope === 'assigned_budgets') {
    if (!scope.budgetId) throw new PortalPermissionError('A budget assignment is required.');
    let query = admin
      .from('user_budget_assignments')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('budget_id', scope.budgetId)
      .eq(scope.requireSubmit ? 'can_submit_against' : 'can_view', true);
    if (scope.budgetCategoryId) {
      query = query.or(`budget_category_id.is.null,budget_category_id.eq.${scope.budgetCategoryId}`);
    }
    const { data } = await query.limit(1).maybeSingle();
    if (!data) throw new PortalPermissionError('This budget is not assigned to you.');
    return;
  }

  if (requestedScope === 'assigned_funds') {
    if (!scope.fundId) throw new PortalPermissionError('A fund assignment is required.');
    const { data } = await admin
      .from('user_fund_assignments')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('fund_id', scope.fundId)
      .eq(scope.requireSubmit ? 'can_submit_against' : 'can_view', true)
      .limit(1)
      .maybeSingle();
    if (!data) throw new PortalPermissionError('This fund is not assigned to you.');
    return;
  }

  if (requestedScope === 'assigned_categories') {
    if (!scope.categoryId) throw new PortalPermissionError('A category assignment is required.');
    const { data } = await admin
      .from('user_category_assignments')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('category_id', scope.categoryId)
      .eq(scope.requireSubmit ? 'can_submit_against' : 'can_view', true)
      .limit(1)
      .maybeSingle();
    if (!data) throw new PortalPermissionError('This category is not assigned to you.');
  }
}

export async function enforcePortalPermissionForContext(
  context: PortalPermissionContext,
  pageKey: PortalPageKey,
  actionKey: PortalActionKey,
  scope: PortalPermissionScope = {},
) {
  if (context.role === 'admin' || context.role === 'treasurer') {
    return;
  }

  await requirePortalPermission(
    context.user.id,
    context.orgId,
    pageKey,
    actionKey,
    scope,
  );
}
