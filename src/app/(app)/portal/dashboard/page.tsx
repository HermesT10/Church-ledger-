import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getPortalDashboardData } from '@/lib/portal/dashboard';
import { enforcePortalPermissionForContext } from '@/lib/portal-permissions';
import { PortalDashboardClient } from './portal-dashboard-client';

export default async function PortalDashboardPage() {
  const ctx = await getActiveOrg();
  try {
    await enforcePortalPermissionForContext(ctx, 'dashboard', 'view');
  } catch {
    redirect('/dashboard');
  }

  const data = await getPortalDashboardData();
  return <PortalDashboardClient data={data} userId={ctx.user.id} workspaceId={ctx.orgId} />;
}
