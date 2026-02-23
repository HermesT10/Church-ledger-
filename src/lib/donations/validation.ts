/* ------------------------------------------------------------------ */
/*  Donations validation – pure functions (no 'use server')            */
/* ------------------------------------------------------------------ */

import { DONATION_CHANNELS } from './types';
import type { DonationChannel } from './types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface GiftAidDeclaration {
  id: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

export interface DonationInput {
  gross_amount_pence: number;
  fee_amount_pence: number;
  net_amount_pence: number;
  fund_id?: string | null;
  donor_id?: string | null;
  donation_date: string;
  channel: DonationChannel;
  source: string;
  provider_reference?: string | null;
  gift_aid_eligible?: boolean;
}

export interface JournalLineOutput {
  account_id: string;
  fund_id: string | null;
  description: string | null;
  debit_pence: number;
  credit_pence: number;
}

/* ------------------------------------------------------------------ */
/*  isGiftAidEligible                                                  */
/* ------------------------------------------------------------------ */

export function isGiftAidEligible(
  declarations: GiftAidDeclaration[],
  donationDate: string
): boolean {
  const d = new Date(donationDate);
  if (isNaN(d.getTime())) return false;

  for (const decl of declarations) {
    if (!decl.is_active) continue;

    const start = new Date(decl.start_date);
    if (d < start) continue;

    if (decl.end_date) {
      const end = new Date(decl.end_date);
      if (d > end) continue;
    }

    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  validateDonation                                                   */
/* ------------------------------------------------------------------ */

export interface DonationValidation {
  valid: boolean;
  errors: string[];
}

const VALID_SOURCES = ['manual', 'gocardless', 'sumup', 'izettle', 'stripe', 'paypal', 'churchsuite', 'other'];

export function validateDonation(input: DonationInput): DonationValidation {
  const errors: string[] = [];

  if (!input.gross_amount_pence || input.gross_amount_pence <= 0) {
    errors.push('Gross donation amount must be greater than zero.');
  }

  if (input.fee_amount_pence < 0) {
    errors.push('Fee amount cannot be negative.');
  }

  if (input.net_amount_pence <= 0) {
    errors.push('Net amount must be greater than zero.');
  }

  if (!input.donation_date) {
    errors.push('Donation date is required.');
  }

  if (!DONATION_CHANNELS.includes(input.channel)) {
    errors.push(`Invalid channel: ${input.channel}.`);
  }

  if (!VALID_SOURCES.includes(input.source)) {
    errors.push(`Invalid source: ${input.source}.`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/* ------------------------------------------------------------------ */
/*  buildDonationJournalLines                                          */
/*  Creates balanced GL entries for a donation:                        */
/*  - Debit Bank (net_amount)                                          */
/*  - Debit Fees Expense (fee_amount, if > 0)                         */
/*  - Credit Donations Income (gross_amount, fund-tagged)              */
/* ------------------------------------------------------------------ */

export function buildDonationJournalLines(params: {
  grossAmountPence: number;
  feeAmountPence: number;
  netAmountPence: number;
  bankAccountId: string;
  donationsIncomeAccountId: string;
  feeAccountId: string | null;
  fundId: string | null;
  description: string;
}): JournalLineOutput[] {
  const {
    grossAmountPence,
    feeAmountPence,
    netAmountPence,
    bankAccountId,
    donationsIncomeAccountId,
    feeAccountId,
    fundId,
    description,
  } = params;

  const lines: JournalLineOutput[] = [];

  // Dr Bank (net amount received)
  lines.push({
    account_id: bankAccountId,
    fund_id: null,
    description: `Donation received – ${description}`,
    debit_pence: netAmountPence,
    credit_pence: 0,
  });

  // Dr Fees Expense (if fee > 0)
  if (feeAmountPence > 0 && feeAccountId) {
    lines.push({
      account_id: feeAccountId,
      fund_id: null,
      description: `Platform fee – ${description}`,
      debit_pence: feeAmountPence,
      credit_pence: 0,
    });
  }

  // Cr Donations Income (gross amount, fund-tagged)
  lines.push({
    account_id: donationsIncomeAccountId,
    fund_id: fundId,
    description: `Donation income – ${description}`,
    debit_pence: 0,
    credit_pence: grossAmountPence,
  });

  return lines;
}

/* ------------------------------------------------------------------ */
/*  Donation fingerprint for duplicate prevention                      */
/* ------------------------------------------------------------------ */

export function donationFingerprint(params: {
  donorId: string | null;
  donationDate: string;
  grossAmountPence: number;
  providerReference: string | null;
}): string {
  const parts = [
    params.donorId ?? 'anon',
    params.donationDate,
    String(params.grossAmountPence),
    params.providerReference ?? '',
  ];
  // Simple hash-like fingerprint (deterministic string)
  return parts.join('|');
}
