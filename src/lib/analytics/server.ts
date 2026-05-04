import { createAdminClient } from '@/lib/supabase/admin';

export async function trackProductEvent(params: {
  organisationId: string | null;
  userId: string | null;
  eventType: string;
  moduleKey?: string | null;
  path?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { organisationId, userId, eventType, moduleKey, path, metadata } = params;

  if (!organisationId || !userId || !eventType) {
    return;
  }

  try {
    const admin = createAdminClient();
    await admin.from('product_events').insert({
      organisation_id: organisationId,
      user_id: userId,
      event_type: eventType,
      module_key: moduleKey ?? null,
      path: path ?? null,
      metadata: metadata ?? {},
    });
  } catch {
    // Product analytics should never break the user flow.
  }
}
