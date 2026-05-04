import { describe, expect, it } from 'vitest';
import { evaluateFeatureGate } from '@/lib/billing/feature-gates';
import type { OrganisationSubscription } from '@/lib/billing/types';

const subscription: OrganisationSubscription = {
  id: 'sub-1',
  organisationId: 'org-1',
  status: 'active',
  billingEmail: 'finance@example.com',
  seatCount: 3,
  seatLimit: 5,
  trialEndsAt: null,
  gracePeriodEndsAt: null,
  currentPeriodEnd: null,
  plan: {
    code: 'growth',
    name: 'Growth',
    description: 'Growth plan',
  },
  features: [
    { code: 'branding', enabled: true, limitValue: null },
    { code: 'support_console', enabled: false, limitValue: null },
  ],
};

describe('evaluateFeatureGate', () => {
  it('allows enabled features for active subscriptions', () => {
    expect(
      evaluateFeatureGate({ subscription, featureCode: 'branding' }),
    ).toEqual({
      enabled: true,
      reason: 'enabled',
      limitValue: 5,
    });
  });

  it('blocks disabled features', () => {
    expect(
      evaluateFeatureGate({ subscription, featureCode: 'support_console' }),
    ).toEqual({
      enabled: false,
      reason: 'feature_disabled',
      limitValue: null,
    });
  });

  it('blocks when seat usage exceeds the plan limit', () => {
    expect(
      evaluateFeatureGate({ subscription, featureCode: 'branding', seatCount: 6 }),
    ).toEqual({
      enabled: false,
      reason: 'seat_limit',
      limitValue: 5,
    });
  });
});
