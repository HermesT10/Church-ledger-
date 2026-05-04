import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { Button } from '@/components/ui/button';
import { getYearEndCloseRun } from '@/lib/year-end-close/actions';
import { YearEndCloseClient } from './year-end-close-client';

export default async function YearEndCloseRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const { data, error } = await getYearEndCloseRun(runId);

  if (!data && !error) notFound();

  return (
    <PageShell>
      <PageHeader
        title={data ? `Year-End Close ${data.financialYear}` : 'Year-End Close'}
        subtitle="Complete the guided 23-step close, generate annual accounts, lock the year, export the filing pack, and record submission."
        actions={<Button variant="outline" asChild><Link href="/year-end-close">All close runs</Link></Button>}
      />

      {error && <SoftAlert variant="error">{error}</SoftAlert>}
      {data && <YearEndCloseClient initialRun={data} />}
    </PageShell>
  );
}
