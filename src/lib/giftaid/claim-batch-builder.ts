import { calculateClaimablePence } from './eligibility';

export const GIFT_AID_CLAIM_BATCH_STATUSES = [
  'draft',
  'review',
  'approved',
  'exported',
  'submitted',
  'paid',
  'rejected',
  'voided',
] as const;

export type GiftAidClaimBatchStatus =
  (typeof GIFT_AID_CLAIM_BATCH_STATUSES)[number];

export const GIFT_AID_CLAIM_EXCEPTION_CODES = [
  'missing_declaration',
  'invalid_donor_details',
  'already_claimed',
  'missing_postcode',
  'donation_outside_declaration_period',
  'unreconciled_donation',
  'missing_bank_transaction',
  'non_positive_amount',
] as const;

export type GiftAidClaimExceptionCode =
  (typeof GIFT_AID_CLAIM_EXCEPTION_CODES)[number];

export interface ClaimBatchBuilderDonation {
  id: string;
  donorId: string | null;
  donorFullName: string | null;
  donorAddress: string | null;
  donorPostcode: string | null;
  donationDate: string | null;
  amountPence: number | null;
  giftAidClaimId?: string | null;
  giftAidClaimBatchId?: string | null;
  status: string | null;
  bankTransactionId?: string | null;
  bankTransactionReconciled?: boolean | null;
}

export interface ClaimBatchBuilderDeclaration {
  id: string;
  donorId: string;
  status: string | null;
  startDate: string;
  endDate: string | null;
}

export interface ClaimBatchValidationIssue {
  code: GiftAidClaimExceptionCode;
  message: string;
  blocking: boolean;
}

export interface ClaimBatchValidationResult {
  valid: boolean;
  validationStatus: 'valid' | 'blocking';
  declarationId: string | null;
  claimAmountPence: number;
  issues: ClaimBatchValidationIssue[];
}

function isBlank(value: string | null | undefined) {
  return !value || value.trim().length === 0;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function findDeclarationCoveringDonation(params: {
  donationDate: string | null;
  donorId: string | null;
  declarations: ClaimBatchBuilderDeclaration[];
}) {
  const donationDate = parseDate(params.donationDate);
  if (!donationDate || !params.donorId) return null;

  return (
    params.declarations.find((declaration) => {
      if (declaration.donorId !== params.donorId) return false;
      if (declaration.status !== 'active') return false;

      const startDate = parseDate(declaration.startDate);
      const endDate = parseDate(declaration.endDate);
      if (!startDate || donationDate < startDate) return false;
      if (endDate && donationDate > endDate) return false;
      return true;
    }) ?? null
  );
}

export function validateDonationForClaimBatch(params: {
  donation: ClaimBatchBuilderDonation;
  declarations: ClaimBatchBuilderDeclaration[];
  requireBankTransactionLink: boolean;
}): ClaimBatchValidationResult {
  const { donation } = params;
  const issues: ClaimBatchValidationIssue[] = [];
  const amountPence = donation.amountPence ?? 0;

  if (isBlank(donation.donorFullName)) {
    issues.push({
      code: 'invalid_donor_details',
      message: 'Donor has no full name.',
      blocking: true,
    });
  }

  if (isBlank(donation.donorAddress)) {
    issues.push({
      code: 'invalid_donor_details',
      message: 'Donor has no address.',
      blocking: true,
    });
  }

  if (isBlank(donation.donorPostcode)) {
    issues.push({
      code: 'missing_postcode',
      message: 'Donor postcode is missing.',
      blocking: true,
    });
  }

  if (donation.giftAidClaimId || donation.giftAidClaimBatchId) {
    issues.push({
      code: 'already_claimed',
      message: 'Donation is already linked to a Gift Aid claim.',
      blocking: true,
    });
  }

  if (amountPence <= 0) {
    issues.push({
      code: 'non_positive_amount',
      message: 'Donation amount must be positive.',
      blocking: true,
    });
  }

  if (donation.status === 'voided' || donation.status === 'corrected') {
    issues.push({
      code: 'unreconciled_donation',
      message: 'This donation was voided or corrected and cannot be included in a claim.',
      blocking: true,
    });
  } else if (donation.status !== 'posted') {
    issues.push({
      code: 'unreconciled_donation',
      message: 'Donation must be posted before it can be claimed.',
      blocking: true,
    });
  }

  if (params.requireBankTransactionLink && !donation.bankTransactionId) {
    issues.push({
      code: 'missing_bank_transaction',
      message: 'Donation must be linked to a bank transaction before it can be claimed.',
      blocking: true,
    });
  }

  if (
    params.requireBankTransactionLink &&
    donation.bankTransactionId &&
    donation.bankTransactionReconciled === false
  ) {
    issues.push({
      code: 'unreconciled_donation',
      message: 'Linked bank transaction must be reconciled before the donation can be claimed.',
      blocking: true,
    });
  }

  const donorDeclarations = params.declarations.filter(
    (declaration) => declaration.donorId === donation.donorId
  );
  const matchedDeclaration = findDeclarationCoveringDonation({
    donationDate: donation.donationDate,
    donorId: donation.donorId,
    declarations: params.declarations,
  });

  if (!matchedDeclaration) {
    issues.push({
      code:
        donorDeclarations.length === 0
          ? 'missing_declaration'
          : 'donation_outside_declaration_period',
      message:
        donorDeclarations.length === 0
          ? 'Gift Aid declaration is missing.'
          : 'Donation date is outside declaration coverage.',
      blocking: true,
    });
  }

  const hasBlocking = issues.some((issue) => issue.blocking);
  return {
    valid: !hasBlocking,
    validationStatus: hasBlocking ? 'blocking' : 'valid',
    declarationId: matchedDeclaration?.id ?? null,
    claimAmountPence: amountPence > 0 ? calculateClaimablePence(amountPence) : 0,
    issues,
  };
}

export function groupClaimBatchExceptions(
  results: Array<{ donationId: string; result: ClaimBatchValidationResult }>
) {
  const grouped = new Map<GiftAidClaimExceptionCode, string[]>();

  for (const entry of results) {
    for (const issue of entry.result.issues) {
      const current = grouped.get(issue.code) ?? [];
      current.push(entry.donationId);
      grouped.set(issue.code, current);
    }
  }

  return grouped;
}

export function buildManualClaimLineEdit(params: {
  fieldName: string;
  originalValue: unknown;
  editedValue: unknown;
  reason: string;
}) {
  const reason = params.reason.trim();
  if (!reason) {
    return {
      valid: false,
      error: 'A reason is required for manual claim item edits.',
    };
  }

  return {
    valid: true,
    error: null,
    edit: {
      fieldName: params.fieldName,
      originalValue: params.originalValue,
      editedValue: params.editedValue,
      reason,
    },
  };
}
