import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { listIncomeStreams } from '@/lib/income-streams/actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { IncomeStreamsClient } from './income-streams-client';

export default async function IncomeStreamsPage() {
  const { role } = await getActiveOrg();
  const canManage = role === 'admin' || role === 'treasurer';
  const { data: streams, error } = await listIncomeStreams();

  return (
    <PageShell className="max-w-3xl">
      <PageHeader
        title="Income streams"
        subtitle="Separate how money arrives (Giving, Lettings, Grants) from where it sits in funds."
        actions={
          <Link href="/funds" className="text-sm text-muted-foreground hover:underline">
            Back to Funds
          </Link>
        }
      />
      <IncomeStreamsClient streams={streams} error={error} canManage={canManage} />
    </PageShell>
  );
}
