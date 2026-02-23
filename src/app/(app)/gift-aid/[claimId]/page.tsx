import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getGiftAidClaim, getGiftAidApprovalHistory } from '@/lib/giftaid/actions';
import { ClaimDetailClient } from './claim-detail-client';

export default async function GiftAidClaimDetailPage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const { role } = await getActiveOrg();
  const { claimId } = await params;

  const canEdit = role === 'admin' || role === 'treasurer';

  const [{ data, error }, { data: approvalHistory }] = await Promise.all([
    getGiftAidClaim(claimId),
    getGiftAidApprovalHistory(claimId),
  ]);

  if (error || !data) {
    notFound();
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gift Aid Claim</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Claim {claimId.slice(0, 8)} — review donations and manage HMRC submission.
        </p>
      </div>
      <ClaimDetailClient
        claim={data.claim}
        donations={data.donations}
        canEdit={canEdit}
        approvalHistory={approvalHistory}
      />
    </div>
  );
}
