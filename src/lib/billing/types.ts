export interface SubscriptionFeature {
  code: string;
  enabled: boolean;
  limitValue: number | null;
}

export interface OrganisationSubscription {
  id: string;
  organisationId: string;
  status: 'trial' | 'active' | 'past_due' | 'grace_period' | 'cancelled' | 'suspended';
  billingEmail: string | null;
  seatCount: number;
  seatLimit: number | null;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
  currentPeriodEnd: string | null;
  plan: {
    code: string;
    name: string;
    description: string | null;
  } | null;
  features: SubscriptionFeature[];
}
