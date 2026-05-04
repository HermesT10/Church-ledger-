import { getActiveOrg } from '@/lib/org';
import { canExportGiftAid } from '@/lib/permissions';
import { NewGasdsBatchClient } from './new-gasds-batch-client';

export default async function GiftAidNewGasdsBatchPage() {
  const { role } = await getActiveOrg();
  return <NewGasdsBatchClient canEdit={canExportGiftAid(role).allowed} />;
}
