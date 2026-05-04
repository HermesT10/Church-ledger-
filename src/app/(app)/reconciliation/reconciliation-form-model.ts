import type { TransactionType } from '@/lib/transactions/types';

export type ReconciliationType =
  | 'donation'
  | 'income'
  | 'expense'
  | 'transfer'
  | 'lettings_income'
  | 'gift_aid_hmrc_payment'
  | 'payroll_payment'
  | 'adjustment'
  | 'exclude';

export type Option = { id: string; name: string };

export type DonorOption = Option & {
  email: string | null;
  hasActiveGiftAidDeclaration: boolean;
};

export function giftAidFollowUpState(params: {
  isDonation: boolean;
  hasDonor: boolean;
  donorHasActiveGiftAidDeclaration: boolean;
  donorEmail?: string | null;
  addGiftAidFollowUp: boolean;
}) {
  const show = params.isDonation && params.hasDonor;
  const canGenerateDeclarationLink = show && !params.donorHasActiveGiftAidDeclaration && Boolean(params.donorEmail?.trim());
  const defaultAddGiftAidFollowUp = show && !params.donorHasActiveGiftAidDeclaration;
  const declarationLinkDisabled = !params.addGiftAidFollowUp || !canGenerateDeclarationLink;

  const helperText = !show
    ? 'Anonymous donations cannot be added to Gift Aid follow-up until a donor is selected or created.'
    : params.donorHasActiveGiftAidDeclaration
      ? 'This donor already has an active Gift Aid declaration, so no follow-up is needed.'
      : canGenerateDeclarationLink
        ? 'This donor has no active declaration. You can add a follow-up and generate a declaration link now.'
        : 'This donor has no active declaration. Add an email address before generating a declaration link.';

  return {
    show,
    defaultAddGiftAidFollowUp,
    canGenerateDeclarationLink,
    declarationLinkDisabled,
    helperText,
  };
}

export function toManualTransactionType(type: ReconciliationType): TransactionType | null {
  if (type === 'income' || type === 'expense' || type === 'transfer' || type === 'adjustment') return type;
  return null;
}

export function resetDraftForType(type: ReconciliationType) {
  return {
    donorId: '',
    supplierId: '',
    incomeStreamId: '',
    quickCreateDonor: false,
    quickCreateSupplier: false,
    giftAidEligible: type === 'donation',
    addGiftAidFollowUp: type === 'donation',
    generateGiftAidDeclarationLink: false,
    rememberBankReference: type === 'donation' || type === 'income' || type === 'expense',
  };
}

export function reconciliationSummary(params: {
  type: ReconciliationType;
  amountLabel: string;
  donorName?: string | null;
  supplierName?: string | null;
  accountName?: string | null;
  fundName?: string | null;
  fromAccountName?: string | null;
  toAccountName?: string | null;
  /** Lettings Income create / pick flows */
  lettingsSubmode?: 'overview' | 'pick_charge' | 'create';
  lettingHirerName?: string | null;
}) {
  switch (params.type) {
    case 'donation':
      return `Create donation for ${params.amountLabel}, link to ${params.donorName ?? 'anonymous giving'}, post to ${params.accountName ?? 'the selected giving income account'}, fund ${params.fundName ?? 'selected fund'}.`;
    case 'income':
      return `Create income for ${params.amountLabel}, post to ${params.accountName ?? 'the selected income account'}, fund ${params.fundName ?? 'selected fund'}.`;
    case 'expense':
      return `Create expense for ${params.amountLabel}, supplier ${params.supplierName ?? 'not specified'}, post to ${params.accountName ?? 'the selected expense account'}, fund ${params.fundName ?? 'selected fund'}.`;
    case 'transfer':
      return `Move ${params.amountLabel} from ${params.fromAccountName ?? 'source account'} to ${params.toAccountName ?? 'destination account'}. This will not affect income or expenses.`;
    case 'exclude':
      return 'Exclude this bank line. No ledger posting will be created.';
    case 'gift_aid_hmrc_payment':
      return 'Match this receipt to an existing Gift Aid claim payment suggestion where available.';
    case 'lettings_income':
      if (params.lettingsSubmode === 'create') {
        return `Create lettings charge for ${params.lettingHirerName?.trim() || 'hirer'}, ${params.amountLabel}, post to ${params.accountName ?? 'the selected income account'}, fund ${params.fundName ?? 'selected fund'}, then reconcile.`;
      }
      if (params.lettingsSubmode === 'pick_charge') {
        return `Reconcile ${params.amountLabel} to the selected lettings charge (optional posting overrides below).`;
      }
      return `Match to a suggestion above, pick an existing charge, or create a new letting for ${params.amountLabel}.`;
    case 'payroll_payment':
      return 'Match this payment to payroll records where available.';
    default:
      return `Create an adjustment for ${params.amountLabel}.`;
  }
}
