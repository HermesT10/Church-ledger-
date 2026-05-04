import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { getFundsList } from '@/lib/funds/actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { MovementsClient } from './movements-client';

export default async function FundMovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  await getActiveOrg();
  const { kind } = await searchParams;

  const funds = await getFundsList({ activeOnly: true });

  return (
    <PageShell className="max-w-lg">
      <PageHeader
        title="Fund movements"
        subtitle="Record a transfer between funds or a controlled adjustment. Posting to the ledger is completed from your journal workflow when connected."
        actions={
          <Link href="/funds" className="text-sm text-muted-foreground hover:underline">
            Back to Funds
          </Link>
        }
      />
      <MovementsClient funds={funds} initialKind={kind === 'adjustment' ? 'adjustment' : 'transfer'} />
    </PageShell>
  );
}
