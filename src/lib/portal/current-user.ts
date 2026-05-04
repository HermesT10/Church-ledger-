import 'server-only';
import { getActiveOrg } from '@/lib/org';
import {
  getPortalAccessContext,
  portalPermissionAllows,
  type PortalAccessContext,
} from '@/lib/portal-permissions';
import type { PortalActionKey, PortalPageKey, PortalScopeKey } from '@/lib/portal-permission-constants';

export async function getCurrentPortalAccess(): Promise<PortalAccessContext> {
  const ctx = await getActiveOrg();
  return getPortalAccessContext(ctx.user.id, ctx.orgId);
}

export async function requireCurrentPortalPage(pageKey: PortalPageKey, actionKey: PortalActionKey = 'view') {
  const context = await getCurrentPortalAccess();
  if (!portalPermissionAllows(context.permissions, pageKey, actionKey)) {
    throw new Error('You do not have permission to view this portal page.');
  }
  return context;
}

export function canUsePortalFeature(
  context: PortalAccessContext,
  pageKey: PortalPageKey,
  actionKey: PortalActionKey = 'view',
  scope?: PortalScopeKey,
) {
  return portalPermissionAllows(context.permissions, pageKey, actionKey, scope);
}
