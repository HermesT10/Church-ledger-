import { getActiveOrg } from '@/lib/org';
import { listRecurringDonations } from '@/lib/donations/actions';
import { FREQUENCY_LABELS, RECURRING_STATUS_LABELS, CHANNEL_LABELS } from '@/lib/donations/types';
import type { DonationChannel, RecurringFrequency, RecurringStatus } from '@/lib/donations/types';
import { RecurringClient } from './recurring-client';

export default async function RecurringDonationsPage() {
  const { orgId, role } = await getActiveOrg();
  const canEdit = role === 'admin' || role === 'treasurer';

  const { data: recurring, error } = await listRecurringDonations(orgId);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recurring Donations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track standing orders, direct debits, and regular giving commitments.
          </p>
        </div>
      </div>

      <RecurringClient
        recurring={recurring}
        canEdit={canEdit}
        orgId={orgId}
      />
    </div>
  );
}
