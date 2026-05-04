import { canUsePortalFeature, getCurrentPortalAccess, requireCurrentPortalPage } from '@/lib/portal/current-user';
import { getActiveOrg } from '@/lib/org';
import { listInvoiceSubmissions, listPortalInvoiceFormOptions } from '@/lib/workflows/actions';
import { PortalInvoicesClient } from './portal-invoices-client';

export default async function PortalInvoicesPage() {
  await requireCurrentPortalPage('submit_invoices');
  const access = await getCurrentPortalAccess();
  const { orgId } = await getActiveOrg();
  const [invoicesRes, optionsRes] = await Promise.all([
    listInvoiceSubmissions(orgId),
    listPortalInvoiceFormOptions(),
  ]);

  return (
    <PortalInvoicesClient
      orgId={orgId}
      initialInvoices={invoicesRes.data}
      options={optionsRes.data}
      canSubmit={canUsePortalFeature(access, 'submit_invoices', 'submit')}
    />
  );
}
