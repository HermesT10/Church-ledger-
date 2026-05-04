export type FinanceLifecycleState =
  | 'draft'
  | 'approved'
  | 'posted'
  | 'reversed'
  | 'voided'
  | 'cancelled';

export type FinanceLifecycleModule =
  | 'journals'
  | 'bills'
  | 'payment_runs'
  | 'payroll'
  | 'banking'
  | 'cash'
  | 'donations'
  | 'giving_imports'
  | 'gift_aid'
  | 'budgets';

export type PostingControl = 'approval_required' | 'auto_post_allowed' | 'manual_review_required';

export interface FinanceLifecyclePolicy {
  module: FinanceLifecycleModule;
  states: readonly FinanceLifecycleState[];
  postingControl: PostingControl;
  reversalRequiredAfterPosting: boolean;
  evidenceRecommended: boolean;
}

export const FINANCE_LIFECYCLE_POLICIES: readonly FinanceLifecyclePolicy[] = [
  {
    module: 'journals',
    states: ['draft', 'approved', 'posted', 'reversed'],
    postingControl: 'approval_required',
    reversalRequiredAfterPosting: true,
    evidenceRecommended: true,
  },
  {
    module: 'bills',
    states: ['draft', 'approved', 'posted', 'voided'],
    postingControl: 'approval_required',
    reversalRequiredAfterPosting: true,
    evidenceRecommended: true,
  },
  {
    module: 'payment_runs',
    states: ['draft', 'approved', 'posted', 'voided'],
    postingControl: 'approval_required',
    reversalRequiredAfterPosting: true,
    evidenceRecommended: true,
  },
  {
    module: 'payroll',
    states: ['draft', 'approved', 'posted', 'reversed'],
    postingControl: 'approval_required',
    reversalRequiredAfterPosting: true,
    evidenceRecommended: true,
  },
  {
    module: 'banking',
    states: ['draft', 'posted', 'reversed'],
    postingControl: 'manual_review_required',
    reversalRequiredAfterPosting: true,
    evidenceRecommended: true,
  },
  {
    module: 'cash',
    states: ['draft', 'approved', 'posted', 'reversed'],
    postingControl: 'manual_review_required',
    reversalRequiredAfterPosting: true,
    evidenceRecommended: true,
  },
  {
    module: 'donations',
    states: ['draft', 'posted', 'reversed'],
    postingControl: 'auto_post_allowed',
    reversalRequiredAfterPosting: true,
    evidenceRecommended: false,
  },
  {
    module: 'giving_imports',
    states: ['draft', 'posted', 'reversed'],
    postingControl: 'manual_review_required',
    reversalRequiredAfterPosting: true,
    evidenceRecommended: true,
  },
  {
    module: 'gift_aid',
    states: ['draft', 'approved', 'posted', 'reversed'],
    postingControl: 'approval_required',
    reversalRequiredAfterPosting: true,
    evidenceRecommended: true,
  },
  {
    module: 'budgets',
    states: ['draft', 'approved', 'voided'],
    postingControl: 'approval_required',
    reversalRequiredAfterPosting: false,
    evidenceRecommended: false,
  },
];

export function getFinanceLifecyclePolicy(
  module: FinanceLifecycleModule,
): FinanceLifecyclePolicy {
  const policy = FINANCE_LIFECYCLE_POLICIES.find((item) => item.module === module);
  if (!policy) {
    throw new Error(`No finance lifecycle policy configured for ${module}.`);
  }

  return policy;
}

export function requiresReversalAfterPosting(module: FinanceLifecycleModule): boolean {
  return getFinanceLifecyclePolicy(module).reversalRequiredAfterPosting;
}
