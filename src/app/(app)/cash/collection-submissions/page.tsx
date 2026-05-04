import { getActiveOrg } from '@/lib/org';
import { listPortalCashCollectionSubmissions } from '@/lib/portal/cash-collection-submissions';
import { CashCollectionSubmissionsAdminClient } from './submissions-admin-client';

export default async function CashCollectionSubmissionsPage() {
  const { role } = await getActiveOrg();
  const canReview = role === 'admin' || role === 'treasurer';
  const submissionsRes = canReview
    ? await listPortalCashCollectionSubmissions({ admin: true })
    : { data: [], error: null };

  return (
    <CashCollectionSubmissionsAdminClient
      submissions={submissionsRes.data}
      canReview={canReview}
    />
  );
}
