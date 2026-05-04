import { requireCurrentPortalPage } from '@/lib/portal/current-user';
import { listPortalRestrictedFunds } from '@/lib/portal/funds';
import { PortalFundsClient } from './portal-funds-client';

export default async function PortalFundsPage() {
  await requireCurrentPortalPage('restricted_funds');
  const funds = await listPortalRestrictedFunds();
  return <PortalFundsClient funds={funds.data} />;
}
