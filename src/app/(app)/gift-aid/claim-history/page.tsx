import { getActiveOrg } from '@/lib/org';
import { listGiftAidClaims } from '@/lib/giftaid/actions';
import { GiftAidClaimHistoryTable } from '@/components/gift-aid/claim-history-table';

export default async function GiftAidClaimHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgId } = await getActiveOrg();
  const { status } = await searchParams;
  const { data } = await listGiftAidClaims(orgId);
  const claims = (data ?? []).filter((claim) =>
    status === 'draft' || status === 'submitted' || status === 'paid'
      ? claim.status === status
      : true
  );
  const description =
    status === 'draft'
      ? 'Showing draft claim batches that still need export or submission follow-up.'
      : status === 'submitted'
        ? 'Showing submitted claim batches that are awaiting HMRC settlement or audit follow-up.'
        : status === 'paid'
          ? 'Showing paid claim batches that have completed the HMRC reclaim cycle.'
          : 'Track each claim batch with its line count, export file, reclaim value, and submission timeline.';

  return (
    <GiftAidClaimHistoryTable
      claims={claims}
      title="Claim history"
      description={description}
    />
  );
}
