import Link from 'next/link';
import { listPeriods } from '@/lib/periods/actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { Button } from '@/components/ui/button';
import { PeriodsClient } from './periods-client';

export default async function PeriodsPage() {
  const { data: periods, error } = await listPeriods();

  return (
    <PageShell>
      <PageHeader
        title="Financial Periods"
        subtitle="Manage accounting periods. Lock periods to prevent changes to posted transactions within that date range."
        actions={<Button asChild variant="outline"><Link href="/year-end-close">Year-end close</Link></Button>}
      />

      {error && <SoftAlert variant="error">{error}</SoftAlert>}

      <PeriodsClient initialPeriods={periods} />
    </PageShell>
  );
}
