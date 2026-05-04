import { getActiveOrg } from '@/lib/org';
import { canExportGiftAid, canReviewGiftAid } from '@/lib/permissions';
import { getGiftAidControlCentreData } from '@/lib/giftaid/actions';
import type { GiftAidControlCentreTab } from '@/lib/giftaid/types';
import { GiftAidOverviewClient } from './gift-aid-overview-client';

export default async function GiftAidPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const { tab } = await searchParams;
  const canReview = canReviewGiftAid(role).allowed;
  const canExport = canExportGiftAid(role).allowed;
  const validTabs = new Set<GiftAidControlCentreTab>([
    'overview',
    'donors',
    'declarations',
    'eligible-donations',
    'claim-batches',
    'schedule-builder',
    'exceptions',
    'small-donations',
    'settings',
  ]);
  const initialTab = validTabs.has(tab as GiftAidControlCentreTab)
    ? (tab as GiftAidControlCentreTab)
    : 'overview';

  const { data, error } = await getGiftAidControlCentreData(orgId);

  if (error || !data) {
    throw new Error(error ?? 'Unable to load Gift Aid overview.');
  }

  return (
    <GiftAidOverviewClient
      data={data}
      canReview={canReview}
      canExport={canExport}
      initialTab={initialTab}
    />
  );
}
