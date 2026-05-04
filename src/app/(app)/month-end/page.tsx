import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { getInsightSnapshot } from '@/lib/insights/actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { Button } from '@/components/ui/button';
import { MonthEndClient } from './month-end-client';

export default async function MonthEndPage() {
  const { orgId, role } = await getActiveOrg();
  const { data, error } = await getInsightSnapshot({
    organisationId: orgId,
    period: 'this_month',
  });

  return (
    <PageShell>
      <PageHeader
        title="Month-End Close"
        subtitle="Guided close review for reconciliation, posting discipline, finance workflows, and board-ready reporting."
        actions={<Button asChild variant="outline"><Link href="/year-end-close">Open year-end close</Link></Button>}
      />

      {error && <SoftAlert variant="error">{error}</SoftAlert>}

      {data ? (
        <MonthEndClient snapshot={data} role={role} />
      ) : (
        <SoftAlert variant="info">
          No month-end review data is available yet.
        </SoftAlert>
      )}
    </PageShell>
  );
}
