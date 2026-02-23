/* ------------------------------------------------------------------ */
/*  Gift Aid Eligibility Engine – pure function (no 'use server')      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EligibilityDonation {
  donation_date: string;
  /** If set, the donation has already been included in a claim. */
  gift_aid_claim_id: string | null;
}

export interface EligibilityDonor {
  address: string | null;
  postcode: string | null;
}

export interface EligibilityDeclaration {
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

export interface EligibilityInput {
  donation: EligibilityDonation;
  donor: EligibilityDonor | null;
  declarations: EligibilityDeclaration[];
}

export interface EligibilityResult {
  eligible: boolean;
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

export function evaluateGiftAidEligibility(
  input: EligibilityInput
): EligibilityResult {
  const { donation, donor, declarations } = input;

  // 1. Donor must exist
  if (!donor) {
    return { eligible: false, reason: 'No donor linked to this donation.' };
  }

  // 2. Address + postcode required
  if (!donor.address || donor.address.trim().length === 0) {
    return { eligible: false, reason: 'Donor address or postcode is missing.' };
  }
  if (!donor.postcode || donor.postcode.trim().length === 0) {
    return { eligible: false, reason: 'Donor address or postcode is missing.' };
  }

  // 3. Valid declaration must cover the donation date
  const donationDate = new Date(donation.donation_date);
  if (isNaN(donationDate.getTime())) {
    return { eligible: false, reason: 'Invalid donation date.' };
  }

  let declarationCovers = false;

  for (const decl of declarations) {
    if (!decl.is_active) continue;

    const start = new Date(decl.start_date);
    if (donationDate < start) continue;

    if (decl.end_date) {
      const end = new Date(decl.end_date);
      if (donationDate > end) continue;
    }

    declarationCovers = true;
    break;
  }

  if (!declarationCovers) {
    return {
      eligible: false,
      reason: 'No valid Gift Aid declaration covers this donation date.',
    };
  }

  // 4. Not already claimed
  if (donation.gift_aid_claim_id) {
    return {
      eligible: false,
      reason: 'Donation has already been included in a Gift Aid claim.',
    };
  }

  return { eligible: true };
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
        gift_aid_claim_id: don.gift_aid_claim_id,
      },
      donor: don.donor
        ? { address: don.donor.address, postcode: don.donor.postcode }
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
  donorName: string;
  address: string;
  postcode: string;
  donationDate: string;
  amountPounds: string;   // e.g. "20.00"
  claimablePounds: string; // e.g. "5.00"
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
  'Donor Name,Address,Postcode,Donation Date,Amount,Gift Aid Claimable';

export function buildGiftAidCsv(rows: GiftAidCsvRow[]): string {
  const lines: string[] = [CSV_HEADER];

  for (const row of rows) {
    lines.push(
      [
        escapeCsvField(row.donorName),
        escapeCsvField(row.address),
        escapeCsvField(row.postcode),
        escapeCsvField(row.donationDate),
        escapeCsvField(row.amountPounds),
        escapeCsvField(row.claimablePounds),
      ].join(',')
    );
  }

  return lines.join('\n');
}

/** Convert integer pence to pounds string with 2 decimal places. */
export function penceToPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}
