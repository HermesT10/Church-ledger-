import type {
  GiftAidBatchStatus,
  GiftAidClaimLineModel,
  GiftAidDeclarationModel,
  GiftAidDeclarationStatus,
  GiftAidDonationModel,
  GiftAidDonationStatus,
} from './model';

export const GIFT_AID_STANDARD_CLAIM_RATE = 0.25;

export function resolveDeclarationStatus(
  declaration: Pick<GiftAidDeclarationModel, 'status' | 'endDate'>,
  asOf: Date = new Date()
): GiftAidDeclarationStatus {
  if (declaration.status === 'cancelled') {
    return 'cancelled';
  }
  if (declaration.endDate && new Date(declaration.endDate) < asOf) {
    return 'expired';
  }
  return 'active';
}

export function declarationCoversDonation(params: {
  donationDate: string;
  declaration: Pick<GiftAidDeclarationModel, 'status' | 'startDate' | 'endDate'>;
  /** Use the donation settlement date boundary (defaults to parsing donationDate). */
  asOf?: Date;
}): boolean {
  const donationDateBoundary = parseDateOnly(params.donationDate);
  const startDateBoundary = parseDateOnly(params.declaration.startDate);
  if (donationDateBoundary < startDateBoundary) {
    return false;
  }

  const declarationStatusRaw = params.declaration.status;

  if (declarationStatusRaw === 'cancelled') {
    if (!params.declaration.endDate) {
      return false;
    }
    const endBoundary = parseDateOnly(params.declaration.endDate);
    return donationDateBoundary <= endBoundary;
  }

  const effectiveStatus = resolveDeclarationStatus(
    {
      status: declarationStatusRaw,
      endDate: params.declaration.endDate,
    },
    params.asOf ?? new Date(params.donationDate)
  );

  if (effectiveStatus !== 'active') {
    return false;
  }

  if (!params.declaration.endDate) {
    return true;
  }
  return donationDateBoundary <= parseDateOnly(params.declaration.endDate);
}

function parseDateOnly(value: string): Date {
  const hasTime = value.includes('T');
  return new Date(hasTime ? value : `${value}T00:00:00.000Z`);
}

export function calculateGiftAidClaimPence(
  amountPence: number,
  rate: number = GIFT_AID_STANDARD_CLAIM_RATE
): number {
  return Math.round(amountPence * rate);
}

export function isClaimableDonation(
  donation: Pick<GiftAidDonationModel, 'giftAidStatus'>
): boolean {
  return donation.giftAidStatus === 'eligible';
}

export function isBatchMutable(
  batch: Pick<{ status: GiftAidBatchStatus }, 'status'>
): boolean {
  return batch.status === 'draft';
}

export function isBatchExportable(
  batch: Pick<{ status: GiftAidBatchStatus }, 'status'>
): boolean {
  return batch.status === 'draft' || batch.status === 'exported';
}

export function deriveDonationGiftAidStatus(params: {
  donorId: string | null;
  declarationStatus: GiftAidDeclarationStatus | null;
  manuallyIneligible?: boolean;
  claimBatchId?: string | null;
  batchStatus?: GiftAidBatchStatus | null;
  needsReview?: boolean;
}): GiftAidDonationStatus {
  if (params.claimBatchId && params.batchStatus === 'submitted') {
    return 'submitted';
  }
  if (params.claimBatchId) {
    return 'included_in_claim';
  }
  if (!params.donorId) {
    return 'unmatched';
  }
  if (!params.declarationStatus || params.declarationStatus !== 'active') {
    return 'matched_no_declaration';
  }
  if (params.manuallyIneligible) {
    return 'ineligible';
  }
  if (params.needsReview) {
    return 'needs_review';
  }
  return 'eligible';
}

export function buildClaimLineSnapshot(params: {
  workspaceId: string;
  claimBatchId: string;
  donation: Pick<
    GiftAidDonationModel,
    'id' | 'donationDate' | 'grossAmountPence'
  >;
  donor: Pick<
    GiftAidDeclarationModel,
    never
  > & {
    id: string;
    fullName: string;
    title?: string | null;
    firstNameOrInitial?: string | null;
    lastName?: string | null;
    houseNameOrNumber?: string | null;
    address: string | null;
    postcode: string | null;
  };
  declarationId: string | null;
  claimRate?: number;
}): Omit<GiftAidClaimLineModel, 'id' | 'createdAt'> {
  const claimRate = params.claimRate ?? GIFT_AID_STANDARD_CLAIM_RATE;
  return {
    workspaceId: params.workspaceId,
    claimBatchId: params.claimBatchId,
    donationId: params.donation.id,
    donorId: params.donor.id,
    claimItemType: 'standard_gift_aid' as const,
    gasdsBatchId: null,
    declarationId: params.declarationId,
    donationDate: params.donation.donationDate,
    donationAmountPence: params.donation.grossAmountPence,
    claimRate,
    claimAmountPence: calculateGiftAidClaimPence(
      params.donation.grossAmountPence,
      claimRate
    ),
    donorNameSnapshot: params.donor.fullName,
    donorAddressSnapshot: params.donor.address,
    donorPostcodeSnapshot: params.donor.postcode,
    donorTitleSnapshot: params.donor.title ?? null,
    donorFirstNameOrInitialSnapshot: params.donor.firstNameOrInitial ?? null,
    donorLastNameSnapshot: params.donor.lastName ?? null,
    donorHouseNameOrNumberSnapshot: params.donor.houseNameOrNumber ?? null,
  };
}
