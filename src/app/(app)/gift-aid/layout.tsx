import { PageShell } from '@/components/page-shell';
import { GiftAidWorkspaceShell } from '@/components/gift-aid/workspace-shell';
import { getActiveOrg } from '@/lib/org';
import { canExportGiftAid, canReviewGiftAid } from '@/lib/permissions';
import { getGiftAidWorkflowDashboard } from '@/lib/giftaid/actions';
import type { GiftAidWorkflowDashboard } from '@/lib/giftaid/types';

const EMPTY_DASHBOARD: GiftAidWorkflowDashboard = {
  kpis: [
    { id: 'eligible-donations', title: 'Eligible donations', value: 0, subtitle: 'Giving ready to be gathered into a claim batch', href: '/gift-aid/claim-builder' },
    { id: 'estimated-reclaim', title: 'Estimated reclaim value', value: 0, subtitle: 'Expected Gift Aid value from eligible giving', href: '/gift-aid/claim-builder' },
    { id: 'needs-review', title: 'Needs review', value: 0, subtitle: 'Donations still waiting for donor or validation review', href: '/gift-aid?stage=needs_review' },
    { id: 'missing-declarations', title: 'Missing declarations', value: 0, subtitle: 'Donations that still need declaration coverage', href: '/gift-aid?stage=validate' },
    { id: 'draft-claim-batches', title: 'Draft claim batches', value: 0, subtitle: 'Claim batches prepared but not yet submitted', href: '/gift-aid/claim-history?status=draft' },
    { id: 'submitted-claim-batches', title: 'Submitted claim batches', value: 0, subtitle: 'Batches already sent to HMRC and being tracked', href: '/gift-aid/claim-history?status=submitted' },
  ],
  stages: [
    { id: 'ingest', label: 'Donations imported', description: 'Donations received into Church Ledger', count: 0 },
    { id: 'match', label: 'Donors matched', description: 'Link donations to the right donor', count: 0 },
    { id: 'validate', label: 'Declarations checked', description: 'Check declaration coverage and donor details', count: 0 },
    { id: 'prepare_claim', label: 'Ready to claim', description: 'Validated donations ready for a claim pack', count: 0 },
    { id: 'export', label: 'Submitted to HMRC', description: 'Draft claims awaiting HMRC export/submission', count: 0 },
    { id: 'track_audit', label: 'Paid and reconciled', description: 'Submitted and paid claims with audit history', count: 0 },
  ],
};

export default async function GiftAidLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { orgId, role } = await getActiveOrg();
  const { data: dashboard } = await getGiftAidWorkflowDashboard(orgId);

  return (
    <PageShell>
      <GiftAidWorkspaceShell
        dashboard={dashboard ?? EMPTY_DASHBOARD}
        canReview={canReviewGiftAid(role).allowed}
        canExport={canExportGiftAid(role).allowed}
      >
        {children}
      </GiftAidWorkspaceShell>
    </PageShell>
  );
}
