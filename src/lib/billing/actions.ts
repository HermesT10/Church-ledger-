'use server';

import { createClient } from '@/lib/supabase/server';
import type { OrganisationSubscription } from './types';

type SubscriptionRow = {
  id: string;
  organisation_id: string;
  plan_id: string | null;
  status: OrganisationSubscription['status'];
  billing_email: string | null;
  seat_count: number;
  seat_limit: number | null;
  trial_ends_at: string | null;
  grace_period_ends_at: string | null;
  current_period_end: string | null;
  subscription_plans:
    | {
        code: string;
        name: string;
        description: string | null;
      }
    | {
        code: string;
        name: string;
        description: string | null;
      }[]
    | null;
};

export async function getOrganisationSubscription(
  orgId: string,
): Promise<{ data: OrganisationSubscription | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organisation_subscriptions')
    .select(`
      id,
      organisation_id,
      plan_id,
      status,
      billing_email,
      seat_count,
      seat_limit,
      trial_ends_at,
      grace_period_ends_at,
      current_period_end,
      subscription_plans:plan_id (
        code,
        name,
        description
      )
    `)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  if (!data) {
    return { data: null, error: null };
  }

  const row = data as unknown as SubscriptionRow;
  const plan = Array.isArray(row.subscription_plans)
    ? row.subscription_plans[0] ?? null
    : row.subscription_plans;

  const { data: features } = await supabase
    .from('subscription_features')
    .select('feature_code, enabled, limit_value')
    .eq('plan_id', row.plan_id ?? '');

  return {
    data: {
      id: row.id,
      organisationId: row.organisation_id,
      status: row.status,
      billingEmail: row.billing_email,
      seatCount: row.seat_count,
      seatLimit: row.seat_limit,
      trialEndsAt: row.trial_ends_at,
      gracePeriodEndsAt: row.grace_period_ends_at,
      currentPeriodEnd: row.current_period_end,
      plan: plan
        ? {
            code: plan.code,
            name: plan.name,
            description: plan.description,
          }
        : null,
      features: (features ?? []).map((feature) => ({
        code: feature.feature_code,
        enabled: feature.enabled,
        limitValue: feature.limit_value,
      })),
    },
    error: null,
  };
}
