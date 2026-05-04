import { getActiveOrg } from '@/lib/org';
import { canReviewGiftAid } from '@/lib/permissions';
import { listDeclarations } from '@/lib/giftaid/actions';
import { createClient } from '@/lib/supabase/server';
import { DeclarationsClient } from './declarations-client';

export default async function DeclarationsPage() {
  const { orgId, role } = await getActiveOrg();
  const canEdit = canReviewGiftAid(role).allowed;

  const supabase = await createClient();

  const [declarationsResult, donorsRes, orgRes] = await Promise.all([
    listDeclarations(orgId),
    supabase
      .from('donors')
      .select(
        'id, full_name, title, first_name, last_name, display_name, house_name_or_number, address, postcode, email, phone',
      )
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('full_name'),
    supabase.from('organisations').select('name').eq('id', orgId).maybeSingle(),
  ]);

  const declarations = declarationsResult.data ?? [];
  const charityNameDefault = orgRes.data?.name?.trim() ?? '';

  const activeDeclarationIdByDonorId: Record<string, string> = {};
  for (const row of declarations) {
    if (row.status === 'active' && !activeDeclarationIdByDonorId[row.donor_id]) {
      activeDeclarationIdByDonorId[row.donor_id] = row.id;
    }
  }

  const donors = (donorsRes.data ?? []) as {
    id: string;
    full_name: string;
    title: string | null;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    house_name_or_number: string | null;
    address: string | null;
    postcode: string | null;
    email: string | null;
    phone: string | null;
  }[];

  return (
    <DeclarationsClient
      declarations={declarations}
      donors={donors}
      charityNameDefault={charityNameDefault}
      activeDeclarationIdByDonorId={activeDeclarationIdByDonorId}
      canEdit={canEdit}
    />
  );
}
