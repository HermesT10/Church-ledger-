import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { canExportGiftAid } from '@/lib/permissions';
import { getGiftAidClaim, getGiftAidApprovalHistory } from '@/lib/giftaid/actions';
import { ClaimDetailClient } from './claim-detail-client';

export default async function GiftAidClaimDetailPage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const { role } = await getActiveOrg();
  const { claimId } = await params;

  const canEdit = canExportGiftAid(role).allowed;

  const [{ data, error }, { data: approvalHistory }] = await Promise.all([
    getGiftAidClaim(claimId),
    getGiftAidApprovalHistory(claimId),
  ]);

  if (error || !data) {
    notFound();
  }

  return (
    <ClaimDetailClient
      claim={data.claim}
      donations={data.donations}
      canEdit={canEdit}
      approvalHistory={approvalHistory}
    />
  );
}
