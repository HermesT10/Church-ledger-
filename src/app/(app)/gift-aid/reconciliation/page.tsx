import { listGiftAidPaymentReconciliationCandidates } from '@/lib/giftaid/actions';
import { GiftAidReconciliationClient } from './reconciliation-client';

export default async function GiftAidReconciliationPage({
  searchParams,
}: {
  searchParams?: Promise<{ batch?: string }>;
}) {
  const params = await searchParams;
  const highlightBatchId = typeof params?.batch === 'string' ? params.batch : null;
  const { data, error } = await listGiftAidPaymentReconciliationCandidates();

  return (
    <div>
      {error ? (
        <p className="text-sm text-destructive mb-4">{error}</p>
      ) : null}
      <GiftAidReconciliationClient
        initialRows={data}
        highlightedBatchId={highlightBatchId}
      />
    </div>
  );
}
