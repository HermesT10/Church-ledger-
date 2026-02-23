import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getCashCollection } from '@/lib/cash/actions';
import { CollectionDetailClient } from './collection-detail-client';

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { role } = await getActiveOrg();
  const { id } = await params;
  const canEdit = role === 'admin' || role === 'treasurer';

  const { data, error } = await getCashCollection(id);
  if (error || !data) notFound();

  return <CollectionDetailClient collection={data} canEdit={canEdit} />;
}
