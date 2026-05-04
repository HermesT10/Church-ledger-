export type DonorAliasSource = 'bank_reference' | 'manual' | 'imported' | 'system';

export interface BankDonorMatchBankTransaction {
  id: string;
  workspace_id: string;
  reference: string | null;
  description: string | null;
  amount_pence: number;
}

export interface BankDonorMatchDonor {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  reference_code: string | null;
  donor_reference_code: string | null;
  is_active: boolean;
}

export interface BankDonorMatchAlias {
  donor_id: string;
  alias_text: string;
  normalized_alias: string;
  source: DonorAliasSource;
  confidence: number;
}

export interface BankDonorMatchHistoricalMatch {
  donor_id: string;
  confidence_score: number | null;
  review_status: string;
}

export interface BankDonorMatchHistoricalDonation {
  donor_id: string | null;
  amount_pence: number;
  provider_reference: string | null;
}

export interface BankDonorMatchRecurringHint {
  donor_id: string;
  expected_amount_pence: number;
  amount_tolerance_pence: number;
  normalized_bank_reference: string | null;
}

export interface BankDonorMatchCandidate {
  donor_id: string;
  donor_name: string;
  confidence_score: number;
  confidence_label: 'high' | 'medium' | 'low';
  reasons: string[];
}

export function normalizeDonorMatchText(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeDonorMatchAlias(value: string | null | undefined) {
  return normalizeDonorMatchText(value).replace(/\s+/g, '');
}

function bigrams(value: string) {
  if (value.length < 2) return value ? [value] : [];
  const result: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    result.push(value.slice(index, index + 2));
  }
  return result;
}

function diceCoefficient(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  const rightCounts = new Map<string, number>();
  for (const token of rightBigrams) {
    rightCounts.set(token, (rightCounts.get(token) ?? 0) + 1);
  }

  let overlap = 0;
  for (const token of leftBigrams) {
    const count = rightCounts.get(token) ?? 0;
    if (count > 0) {
      overlap += 1;
      rightCounts.set(token, count - 1);
    }
  }

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function confidenceLabel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.85) return 'high';
  if (score >= 0.6) return 'medium';
  return 'low';
}

function addReason(
  candidates: Map<string, BankDonorMatchCandidate>,
  donor: BankDonorMatchDonor,
  score: number,
  reason: string
) {
  const existing = candidates.get(donor.id);
  if (!existing) {
    candidates.set(donor.id, {
      donor_id: donor.id,
      donor_name: donor.display_name ?? donor.full_name,
      confidence_score: score,
      confidence_label: confidenceLabel(score),
      reasons: [reason],
    });
    return;
  }

  existing.confidence_score = Math.min(1, Math.max(existing.confidence_score, score));
  existing.confidence_label = confidenceLabel(existing.confidence_score);
  if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
}

function bankReferenceText(bankTransaction: BankDonorMatchBankTransaction) {
  return [bankTransaction.reference, bankTransaction.description]
    .filter(Boolean)
    .join(' ');
}

function surnameInitialMatch(bankText: string, donor: BankDonorMatchDonor) {
  const lastName = normalizeDonorMatchText(donor.last_name);
  if (!lastName) return false;
  const firstInitial = normalizeDonorMatchText(donor.first_name)?.charAt(0);
  const compact = normalizeDonorMatchAlias(bankText);
  if (firstInitial && compact.includes(`${firstInitial}${lastName}`)) return true;
  return compact.includes(lastName);
}

export function scoreDonorMatchesForBankTransaction(params: {
  bankTransaction: BankDonorMatchBankTransaction;
  donors: BankDonorMatchDonor[];
  aliases: BankDonorMatchAlias[];
  historicalMatches?: BankDonorMatchHistoricalMatch[];
  historicalDonations?: BankDonorMatchHistoricalDonation[];
  recurringPatterns?: BankDonorMatchRecurringHint[];
  includeArchived?: boolean;
}): { candidates: BankDonorMatchCandidate[]; warning: string | null } {
  const activeDonors = params.donors.filter(
    (donor) => params.includeArchived || donor.is_active
  );
  const donorMap = new Map(activeDonors.map((donor) => [donor.id, donor]));
  const candidates = new Map<string, BankDonorMatchCandidate>();
  const rawBankText = bankReferenceText(params.bankTransaction);
  const normalizedBankText = normalizeDonorMatchText(rawBankText);
  const compactBankText = normalizeDonorMatchAlias(rawBankText);

  for (const alias of params.aliases) {
    const donor = donorMap.get(alias.donor_id);
    if (!donor) continue;
    if (!alias.normalized_alias) continue;
    const aliasMatches =
      Boolean(compactBankText) &&
      (compactBankText === alias.normalized_alias ||
        compactBankText.includes(alias.normalized_alias) ||
        alias.normalized_alias.includes(compactBankText));
    if (aliasMatches) {
      addReason(
        candidates,
        donor,
        Math.max(0.9, Number(alias.confidence)),
        `Exact alias match: ${alias.alias_text}`
      );
    }
  }

  for (const donor of activeDonors) {
    const donorName = normalizeDonorMatchText(donor.display_name ?? donor.full_name);
    const donorCompact = normalizeDonorMatchAlias(donorName);
    const referenceCode = normalizeDonorMatchAlias(
      donor.donor_reference_code ?? donor.reference_code
    );

    if (referenceCode && compactBankText.includes(referenceCode)) {
      addReason(candidates, donor, 0.92, 'Reference code appears in bank reference');
    }

    if (donorCompact && compactBankText.includes(donorCompact)) {
      addReason(candidates, donor, 0.88, 'Donor name appears in bank reference');
    } else {
      const fuzzy = diceCoefficient(
        normalizeDonorMatchAlias(normalizedBankText),
        donorCompact
      );
      if (fuzzy >= 0.55) {
        addReason(
          candidates,
          donor,
          Math.min(0.84, 0.45 + fuzzy * 0.45),
          'Bank reference is similar to donor name'
        );
      }
    }

    if (surnameInitialMatch(rawBankText, donor)) {
      addReason(candidates, donor, 0.72, 'Surname or initial matches bank reference');
    }
  }

  for (const match of params.historicalMatches ?? []) {
    const donor = donorMap.get(match.donor_id);
    if (!donor || match.review_status !== 'confirmed') continue;
    addReason(
      candidates,
      donor,
      Math.max(0.86, Number(match.confidence_score ?? 0.85)),
      'Previous confirmed match for this bank reference'
    );
  }

  const normalizedReference = normalizeDonorMatchAlias(rawBankText);
  for (const donation of params.historicalDonations ?? []) {
    if (!donation.donor_id) continue;
    const donor = donorMap.get(donation.donor_id);
    if (!donor) continue;
    const donationReference = normalizeDonorMatchAlias(donation.provider_reference);
    if (donationReference && donationReference === normalizedReference) {
      addReason(candidates, donor, 0.82, 'Repeated bank reference for this donor');
    }
    if (
      donation.amount_pence === params.bankTransaction.amount_pence &&
      donationReference &&
      normalizedReference &&
      (donationReference.includes(normalizedReference) ||
        normalizedReference.includes(donationReference))
    ) {
      addReason(candidates, donor, 0.76, 'Recurring amount and reference pattern');
    }
  }

  for (const pattern of params.recurringPatterns ?? []) {
    const donor = donorMap.get(pattern.donor_id);
    if (!donor) continue;
    const amountOk =
      Math.abs(params.bankTransaction.amount_pence - pattern.expected_amount_pence) <=
      pattern.amount_tolerance_pence;
    if (!amountOk) continue;
    const pref = pattern.normalized_bank_reference?.trim();
    const refOk =
      !pref ||
      (Boolean(compactBankText) &&
        (compactBankText === pref ||
          compactBankText.includes(pref) ||
          pref.includes(compactBankText)));
    if (!refOk) continue;
    addReason(
      candidates,
      donor,
      0.91,
      'Matches active recurring donor pattern (amount and bank reference)'
    );
  }

  const sorted = Array.from(candidates.values())
    .map((candidate) => ({
      ...candidate,
      confidence_score: Number(Math.min(1, candidate.confidence_score).toFixed(4)),
      confidence_label: confidenceLabel(candidate.confidence_score),
    }))
    .filter((candidate) => candidate.confidence_score >= 0.35)
    .sort((left, right) => right.confidence_score - left.confidence_score);

  const highConfidenceCount = sorted.filter(
    (candidate) => candidate.confidence_label === 'high'
  ).length;

  return {
    candidates: sorted.slice(0, 5),
    warning:
      highConfidenceCount > 1
        ? 'Multiple high-confidence donor matches found. Please review before confirming.'
        : null,
  };
}

