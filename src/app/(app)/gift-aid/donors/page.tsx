import { getActiveOrg } from '@/lib/org';
import { canReviewGiftAid } from '@/lib/permissions';
import { listGiftAidDonors } from '@/lib/giftaid/actions';
import { DonorsClient } from './donors-client';

export default async function GiftAidDonorsPage() {
  const { orgId, role } = await getActiveOrg();
  const { data } = await listGiftAidDonors(orgId);

  return (
    <DonorsClient
      donors={data ?? []}
      canEdit={canReviewGiftAid(role).allowed}
    />
  );
}
