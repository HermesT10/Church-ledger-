import { getActiveOrg } from '@/lib/org';
import { PageShell } from '@/components/page-shell';
import { ReportsCommandCentre } from './reports-command-centre';

export default async function ReportsLandingPage() {
  await getActiveOrg();

  return (
    <PageShell>
      <ReportsCommandCentre />
    </PageShell>
  );
}
