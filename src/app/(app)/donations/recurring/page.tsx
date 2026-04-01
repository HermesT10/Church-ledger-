import { getActiveOrg } from '@/lib/org';
import { listRecurringDonations } from '@/lib/donations/actions';
import { FREQUENCY_LABELS, RECURRING_STATUS_LABELS, CHANNEL_LABELS } from '@/lib/donations/types';
import type { DonationChannel, RecurringFrequency, RecurringStatus } from '@/lib/donations/types';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { RecurringClient } from './recurring-client';

export default async function RecurringDonationsPage() {
  const { orgId, role } = await getActiveOrg();
  const canEdit = role === 'admin' || role === 'treasurer';

  const { data: recurring, error } = await listRecurringDonations(orgId);

  return (
    <PageShell className="max-w-6xl">
      <PageHeader
        title="Recurring Donations"
        subtitle="Track standing orders, direct debits, and other regular giving commitments in one place."
      />
      <RecurringClient
        recurring={recurring}
        canEdit={canEdit}
        orgId={orgId}
      />
    </PageShell>
  );
}
