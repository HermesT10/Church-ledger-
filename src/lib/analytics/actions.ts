'use server';

import { getActiveOrg } from '@/lib/org';
import { trackProductEvent } from './server';
import { deriveProductEventFromPath } from './utils';

export async function trackPathView(pathname: string): Promise<void> {
  const descriptor = deriveProductEventFromPath(pathname);
  if (!descriptor) {
    return;
  }

  try {
    const { orgId, user } = await getActiveOrg();
    await trackProductEvent({
      organisationId: orgId,
      userId: user.id,
      eventType: descriptor.eventType,
      moduleKey: descriptor.moduleKey,
      path: descriptor.path,
      metadata: descriptor.metadata,
    });
  } catch {
    // Ignore auth and logging failures so navigation stays fast.
  }
}
