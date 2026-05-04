import {
  declarationCoversDonation,
  resolveDeclarationStatus,
} from './helpers';
import type { GiftAidDeclarationStatus, GiftAidDonationStatus } from './model';

/* ------------------------------------------------------------------ */
/*  Gift Aid Eligibility Engine – pure function (no 'use server')      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EligibilityDonation {
  id?: string;
  donor_id?: string | null;
  donation_date: string | null;
  amount_pence: number | null;
  /** If set, the donation has already been included in a claim. */
  gift_aid_claim_id: string | null;
}

export interface EligibilityDonor {
  id?: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  house_name_or_number?: string | null;
  address: string | null;
  postcode: string | null;
}

export interface EligibilityDeclaration {
  id?: string;
  status?: GiftAidDeclarationStatus | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

export interface EligibilityInput {
  donation: EligibilityDonation;
  donor: EligibilityDonor | null;
  declarations: EligibilityDeclaration[];
}

export const GIFT_AID_VALIDATION_CODES = [
  'missing_donor',
  'missing_declaration',
  'declaration_not_active_for_donation_date',
  'missing_first_name_or_initial',
  'missing_last_name',
  'missing_house_name_or_number',
  'missing_postcode',
  'invalid_donation_date',
  'non_positive_amount',
  'already_claimed',
  'manual_exclusion',
] as const;

export type GiftAidValidationCode =
  (typeof GIFT_AID_VALIDATION_CODES)[number];

export type GiftAidValidationStatus = Extract<
  GiftAidDonationStatus,
  'unmatched' | 'needs_review' | 'matched_no_declaration' | 'eligible' | 'ineligible'
>;

export interface GiftAidValidationIssue {
  code: GiftAidValidationCode;
  field:
    | 'donor'
    | 'declaration'
    | 'donor.first_name'
    | 'donor.last_name'
    | 'donor.house_name_or_number'
    | 'donor.postcode'
    | 'donation.donation_date'
    | 'donation.amount_pence'
    | 'donation.gift_aid_claim_id';
  message: string;
  severity: 'error';
}

export interface EligibilityResult {
  eligible: boolean;
  status: GiftAidValidationStatus;
  matchedDeclarationId: string | null;
  issues: GiftAidValidationIssue[];
  summary: string | null;
  reason?: string;
}

/* ------------------------------------------------------------------ */
/*  evaluateGiftAidEligibility                                         */
/*                                                                     */
/*  Rules (checked in order; first failure returns):                    */
/*  1. Donor must exist                                                */
/*  2. Donor must have address AND postcode                            */
/*  3. At least one active declaration must cover the donation date     */
/*  4. Donation must not already be linked to a claim                  */
/* ------------------------------------------------------------------ */

function isBlank(value: string | null | undefined) {
  return !value || value.trim().length === 0;
}

export function getDonorFirstNameOrInitial(donor: EligibilityDonor) {
  if (!isBlank(donor.first_name)) {
    return donor.first_name!.trim();
  }

  const tokens = donor.full_name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return tokens.length >= 2 ? tokens[0] ?? null : null;
}

export function getDonorLastName(donor: EligibilityDonor) {
  if (!isBlank(donor.last_name)) {
    return donor.last_name!.trim();
  }

  const tokens = donor.full_name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return tokens.length >= 2 ? tokens[tokens.length - 1] ?? null : null;
}

export function getDonorHouseNameOrNumber(donor: EligibilityDonor) {
  if (!isBlank(donor.house_name_or_number)) {
    return donor.house_name_or_number!.trim();
  }
  if (!isBlank(donor.address)) {
    return donor.address!.trim();
  }
  return null;
}

function buildValidationResult(params: {
  issues: GiftAidValidationIssue[];
  matchedDeclarationId?: string | null;
}): EligibilityResult {
  const hardIneligible = params.issues.some((issue) =>
    ['invalid_donation_date', 'non_positive_amount', 'already_claimed', 'manual_exclusion'].includes(
      issue.code
    )
  );
  const hasMissingDonor = params.issues.some(
    (issue) => issue.code === 'missing_donor'
  );
  const hasDeclarationProblem = params.issues.some((issue) =>
    ['missing_declaration', 'declaration_not_active_for_donation_date'].includes(
      issue.code
    )
  );

  let status: GiftAidValidationStatus = 'eligible';
  if (hardIneligible) {
    status = 'ineligible';
  } else if (hasMissingDonor) {
    status = 'unmatched';
  } else if (hasDeclarationProblem) {
    status = 'matched_no_declaration';
  } else if (params.issues.length > 0) {
    status = 'needs_review';
  }

  const summary =
    params.issues.length === 0
      ? null
      : params.issues.length === 1
        ? params.issues[0]?.message ?? null
        : `${params.issues[0]?.message ?? 'Validation failed.'} ${params.issues.length - 1} more issue(s) need attention.`;

  return {
    eligible: params.issues.length === 0,
    status,
    matchedDeclarationId: params.matchedDeclarationId ?? null,
    issues: params.issues,
    summary,
    reason: summary ?? undefined,
  };
}

export function buildManualGiftAidIneligibleResult(
  reason: string
): EligibilityResult {
  return buildValidationResult({
    matchedDeclarationId: null,
    issues: [
      {
        code: 'manual_exclusion',
        field: 'donation.amount_pence',
        message: reason.trim() || 'Excluded from Gift Aid claim.',
        severity: 'error',
      },
    ],
  });
}

export function evaluateGiftAidEligibility(
  input: EligibilityInput
): EligibilityResult {
  const { donation, donor, declarations } = input;
  const issues: GiftAidValidationIssue[] = [];

  let donationDate: Date | null = null;
  if (isBlank(donation.donation_date)) {
    issues.push({
      code: 'invalid_donation_date',
      field: 'donation.donation_date',
      message: 'Donation date is required for Gift Aid validation.',
      severity: 'error',
    });
  } else {
    const parsed = new Date(donation.donation_date!);
    if (Number.isNaN(parsed.getTime())) {
      issues.push({
        code: 'invalid_donation_date',
        field: 'donation.donation_date',
        message: 'Donation date is invalid.',
        severity: 'error',
      });
    } else {
      donationDate = parsed;
    }
  }

  if (donation.amount_pence == null || donation.amount_pence <= 0) {
    issues.push({
      code: 'non_positive_amount',
      field: 'donation.amount_pence',
      message: 'Donation amount must be greater than zero for Gift Aid.',
      severity: 'error',
    });
  }

  if (donation.gift_aid_claim_id) {
    issues.push({
      code: 'already_claimed',
      field: 'donation.gift_aid_claim_id',
      message: 'Donation has already been included in a Gift Aid claim.',
      severity: 'error',
    });
  }

  if (!donor) {
    issues.push({
      code: 'missing_donor',
      field: 'donor',
      message: 'No donor linked to this donation.',
      severity: 'error',
    });
    return buildValidationResult({ issues, matchedDeclarationId: null });
  }

  if (isBlank(getDonorFirstNameOrInitial(donor))) {
    issues.push({
      code: 'missing_first_name_or_initial',
      field: 'donor.first_name',
      message: 'Donor first name or initial is required.',
      severity: 'error',
    });
  }

  if (isBlank(getDonorLastName(donor))) {
    issues.push({
      code: 'missing_last_name',
      field: 'donor.last_name',
      message: 'Donor last name is required.',
      severity: 'error',
    });
  }

  if (isBlank(getDonorHouseNameOrNumber(donor))) {
    issues.push({
      code: 'missing_house_name_or_number',
      field: 'donor.house_name_or_number',
      message: 'Donor house name or number is required.',
      severity: 'error',
    });
  }

  if (isBlank(donor.postcode)) {
    issues.push({
      code: 'missing_postcode',
      field: 'donor.postcode',
      message: 'Donor postcode is required.',
      severity: 'error',
    });
  }

  let matchedDeclarationId: string | null = null;

  if (!donationDate) {
    if (declarations.length === 0) {
      issues.push({
        code: 'missing_declaration',
        field: 'declaration',
        message: 'No Gift Aid declaration is on file for this donor.',
        severity: 'error',
      });
    }
    return buildValidationResult({ issues, matchedDeclarationId });
  }

  const matchedDeclaration =
    declarations.find((declaration) =>
      declarationCoversDonation({
        donationDate: donation.donation_date!,
        declaration: {
          status:
            declaration.status ??
            (declaration.is_active ? 'active' : 'cancelled'),
          startDate: declaration.start_date,
          endDate: declaration.end_date,
        },
        asOf: donationDate,
      })
    ) ?? null;

  matchedDeclarationId = matchedDeclaration?.id ?? null;

  if (!matchedDeclaration) {
    issues.push({
      code: declarations.length === 0 ? 'missing_declaration' : 'declaration_not_active_for_donation_date',
      field: 'declaration',
      message:
        declarations.length === 0
          ? 'No Gift Aid declaration is on file for this donor.'
          : 'No active Gift Aid declaration covers this donation date.',
      severity: 'error',
    });
  }

  return buildValidationResult({ issues, matchedDeclarationId });
}

/* ================================================================== */
/*  Claim Preview                                                      */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ClaimPreviewDonation {
  id: string;
  donation_date: string;
  amount_pence: number;
  gift_aid_claim_id: string | null;
  donor: {
    full_name: string;
    first_name?: string | null;
    last_name?: string | null;
    house_name_or_number?: string | null;
    address: string | null;
    postcode: string | null;
  } | null;
  declarations: EligibilityDeclaration[];
}

export interface EligibleDonation {
  donationId: string;
  donorName: string;
  amountPence: number;
  donationDate: string;
  claimablePence: number;
}

export interface IneligibleDonation {
  donationId: string;
  reason: string;
  status: GiftAidValidationStatus;
  issues: GiftAidValidationIssue[];
}

export interface ClaimPreviewTotals {
  eligibleCount: number;
  eligibleAmountPence: number;
  claimableTotalPence: number;
}

export interface ClaimPreviewResult {
  startDate: string;
  endDate: string;
  eligibleDonations: EligibleDonation[];
  ineligibleDonations: IneligibleDonation[];
  totals: ClaimPreviewTotals;
}

/* ------------------------------------------------------------------ */
/*  UK Gift Aid rate: 25% of donation amount                           */
/* ------------------------------------------------------------------ */

export function calculateClaimablePence(amountPence: number): number {
  return Math.round(amountPence * 0.25);
}

/* ------------------------------------------------------------------ */
/*  buildClaimPreview                                                  */
/*  Pure function: evaluates eligibility per donation, computes 25%    */
/*  claimable amounts, returns structured preview.                     */
/* ------------------------------------------------------------------ */

export function buildClaimPreview(
  donations: ClaimPreviewDonation[],
  startDate: string,
  endDate: string
): ClaimPreviewResult {
  const eligibleDonations: EligibleDonation[] = [];
  const ineligibleDonations: IneligibleDonation[] = [];

  for (const don of donations) {
    const result = evaluateGiftAidEligibility({
      donation: {
        donation_date: don.donation_date,
        amount_pence: don.amount_pence,
        gift_aid_claim_id: don.gift_aid_claim_id,
      },
      donor: don.donor
        ? {
            full_name: don.donor.full_name,
            first_name: don.donor.first_name ?? null,
            last_name: don.donor.last_name ?? null,
            house_name_or_number: don.donor.house_name_or_number ?? null,
            address: don.donor.address,
            postcode: don.donor.postcode,
          }
        : null,
      declarations: don.declarations,
    });

    if (result.eligible) {
      eligibleDonations.push({
        donationId: don.id,
        donorName: don.donor?.full_name ?? 'Anonymous',
        amountPence: don.amount_pence,
        donationDate: don.donation_date,
        claimablePence: calculateClaimablePence(don.amount_pence),
      });
    } else {
      ineligibleDonations.push({
        donationId: don.id,
        reason: result.reason ?? 'Unknown reason.',
        status: result.status,
        issues: result.issues,
      });
    }
  }

  // Compute totals
  let eligibleAmountPence = 0;
  let claimableTotalPence = 0;
  for (const e of eligibleDonations) {
    eligibleAmountPence += e.amountPence;
    claimableTotalPence += e.claimablePence;
  }

  return {
    startDate,
    endDate,
    eligibleDonations,
    ineligibleDonations,
    totals: {
      eligibleCount: eligibleDonations.length,
      eligibleAmountPence,
      claimableTotalPence,
    },
  };
}

/* ================================================================== */
/*  Gift Aid CSV Export                                                 */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface GiftAidCsvRow {
  title: string;
  firstNameOrInitial: string;
  lastName: string;
  houseNameOrNumber: string;
  postcode: string;
  donationDate: string;
  amountPounds: string;
}

export interface GiftAidHmrcLineInput {
  donor: {
    title?: string | null;
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    house_name_or_number?: string | null;
    address: string | null;
    postcode: string | null;
  };
  donationDate: string;
  amountPence: number;
}

export function buildGiftAidHmrcRow(
  input: GiftAidHmrcLineInput
): GiftAidCsvRow {
  const donor: EligibilityDonor = {
    full_name: input.donor.full_name ?? null,
    first_name: input.donor.first_name ?? null,
    last_name: input.donor.last_name ?? null,
    house_name_or_number: input.donor.house_name_or_number ?? null,
    address: input.donor.address,
    postcode: input.donor.postcode,
  };

  return {
    title: input.donor.title?.trim() ?? '',
    firstNameOrInitial: getDonorFirstNameOrInitial(donor) ?? '',
    lastName: getDonorLastName(donor) ?? '',
    houseNameOrNumber: getDonorHouseNameOrNumber(donor) ?? '',
    postcode: input.donor.postcode?.trim() ?? '',
    donationDate: input.donationDate,
    amountPounds: penceToPounds(input.amountPence),
  };
}

/* ------------------------------------------------------------------ */
/*  CSV helpers                                                        */
/* ------------------------------------------------------------------ */

/** Escape a CSV field: wrap in double quotes if it contains commas,   */
/** double quotes, or newlines. Internal quotes are doubled.           */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/* ------------------------------------------------------------------ */
/*  buildGiftAidCsv                                                    */
/*  Pure function: takes structured rows, returns a CSV string with    */
/*  HMRC-style columns.                                                */
/* ------------------------------------------------------------------ */

const CSV_HEADER =
  'Title,First Name or Initial,Last Name,House Name or Number,Postcode,Donation Date,Amount';

export function buildGiftAidCsv(rows: GiftAidCsvRow[]): string {
  const lines: string[] = [CSV_HEADER];

  for (const row of rows) {
    lines.push(
      [
        escapeCsvField(row.title),
        escapeCsvField(row.firstNameOrInitial),
        escapeCsvField(row.lastName),
        escapeCsvField(row.houseNameOrNumber),
        escapeCsvField(row.postcode),
        escapeCsvField(row.donationDate),
        escapeCsvField(row.amountPounds),
      ].join(',')
    );
  }

  return lines.join('\n');
}

/** Convert integer pence to pounds string with 2 decimal places. */
export function penceToPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}
