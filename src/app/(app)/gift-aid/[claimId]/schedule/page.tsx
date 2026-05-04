import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { canExportGiftAid } from '@/lib/permissions';
import { getGiftAidSchedulePreview } from '@/lib/giftaid/actions';
import { GiftAidScheduleClient } from './schedule-client';

export default async function GiftAidSchedulePage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const { claimId } = await params;
  const { role } = await getActiveOrg();
  const { data, error } = await getGiftAidSchedulePreview({ batchId: claimId });

  if (error || !data) {
    notFound();
  }

  return (
    <GiftAidScheduleClient
      batchId={claimId}
      canEdit={canExportGiftAid(role).allowed}
      preview={data}
    />
  );
}
