import { canUsePortalFeature, getCurrentPortalAccess, requireCurrentPortalPage } from '@/lib/portal/current-user';
import {
  listPortalCashCollectionFormOptions,
  listPortalCashCollectionSubmissions,
} from '@/lib/portal/cash-collection-submissions';
import { PortalCashCollectionsClient } from './portal-cash-collections-client';

export default async function PortalCashCollectionsPage() {
  await requireCurrentPortalPage('cash_collections');
  const access = await getCurrentPortalAccess();
  const [submissionsRes, optionsRes] = await Promise.all([
    listPortalCashCollectionSubmissions(),
    listPortalCashCollectionFormOptions(),
  ]);

  return (
    <PortalCashCollectionsClient
      initialSubmissions={submissionsRes.data}
      options={optionsRes.data}
      canSubmit={canUsePortalFeature(access, 'cash_collections', 'submit')}
    />
  );
}
