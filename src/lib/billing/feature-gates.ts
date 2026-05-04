import type { OrganisationSubscription } from './types';

export interface FeatureGateResult {
  enabled: boolean;
  reason: 'missing_subscription' | 'subscription_status' | 'feature_disabled' | 'seat_limit' | 'enabled';
  limitValue: number | null;
}

const ALLOWED_STATUSES = new Set<OrganisationSubscription['status']>([
  'trial',
  'active',
  'grace_period',
]);

export function evaluateFeatureGate(params: {
  subscription: OrganisationSubscription | null;
  featureCode: string;
  seatCount?: number;
}): FeatureGateResult {
  const { subscription, featureCode, seatCount } = params;

  if (!subscription) {
    return { enabled: false, reason: 'missing_subscription', limitValue: null };
  }

  if (!ALLOWED_STATUSES.has(subscription.status)) {
    return { enabled: false, reason: 'subscription_status', limitValue: null };
  }

  const feature = subscription.features.find((item) => item.code === featureCode);
  if (!feature?.enabled) {
    return { enabled: false, reason: 'feature_disabled', limitValue: feature?.limitValue ?? null };
  }

  if (
    typeof seatCount === 'number' &&
    typeof subscription.seatLimit === 'number' &&
    seatCount > subscription.seatLimit
  ) {
    return {
      enabled: false,
      reason: 'seat_limit',
      limitValue: subscription.seatLimit,
    };
  }

  return {
    enabled: true,
    reason: 'enabled',
    limitValue: feature.limitValue ?? subscription.seatLimit ?? null,
  };
}
