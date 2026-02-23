import { getActiveOrg } from '@/lib/org';
import { redirect } from 'next/navigation';
import { NewClaimClient } from './new-claim-client';

export default async function NewGiftAidClaimPage() {
  const { orgId, role } = await getActiveOrg();

  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/gift-aid');
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New Gift Aid Claim</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select a date range, preview eligibility, then create a claim.
        </p>
      </div>
      <NewClaimClient orgId={orgId} />
    </div>
  );
}
