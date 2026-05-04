/** Build statement lines and totals from posted donations (pure, testable). */

import { calculateClaimablePence } from './eligibility';

export interface DonationForStatementRow {
  id: string;
  donation_date: string;
  amount_pence: number;
  source: string | null;
  gift_aid_status: string | null;
  gift_aid_eligible: boolean | null;
  fund_name: string | null;
}

export interface DonorStatementComputedRow {
  donation_date: string;
  amount_pence: number;
  fund_name: string;
  source_label: string;
  gift_aid_label: string;
  gift_aid_reclaimable_pence: number;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  gocardless: 'GoCardless',
  sumup: 'SumUp',
  izettle: 'Zettle',
  stripe: 'Stripe',
  bank_import: 'Bank import',
};

export function formatDonationSourceForStatement(source: string | null | undefined): string {
  if (!source) return '—';
  return SOURCE_LABELS[source] ?? source.replace(/_/g, ' ');
}

/** Human-readable Gift Aid status for donor-facing statements. */
export function formatGiftAidStatusForStatement(
  status: string | null | undefined,
  giftAidEligible: boolean | null | undefined,
): string {
  if (!status) {
    return giftAidEligible ? 'Eligible' : '—';
  }
  switch (status) {
    case 'paid':
      return 'Gift Aid claimed (paid)';
    case 'submitted':
    case 'exported':
      return 'Gift Aid submitted';
    case 'included_in_claim':
    case 'included_in_draft_claim':
      return 'Included in HMRC claim';
    case 'eligible':
      return 'Eligible (not yet claimed)';
    case 'ineligible':
      return 'Not eligible';
    case 'needs_review':
    case 'unmatched':
    case 'matched_no_declaration':
      return 'Under review';
    default:
      return status.replace(/_/g, ' ');
  }
}

export function buildDonorStatementRows(donations: DonationForStatementRow[]): {
  rows: DonorStatementComputedRow[];
  total_donations_pence: number;
  total_gift_aid_reclaimable_pence: number;
} {
  let totalDon = 0;
  let totalGa = 0;
  const rows: DonorStatementComputedRow[] = [];

  const sorted = [...donations].sort((a, b) =>
    a.donation_date.localeCompare(b.donation_date),
  );

  for (const d of sorted) {
    const amount = Math.round(Number(d.amount_pence));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    totalDon += amount;
    const reclaimable =
      d.gift_aid_eligible === true ? calculateClaimablePence(amount) : 0;
    totalGa += reclaimable;

    rows.push({
      donation_date: d.donation_date,
      amount_pence: amount,
      fund_name: d.fund_name?.trim() || 'General',
      source_label: formatDonationSourceForStatement(d.source),
      gift_aid_label: formatGiftAidStatusForStatement(
        d.gift_aid_status,
        d.gift_aid_eligible,
      ),
      gift_aid_reclaimable_pence: reclaimable,
    });
  }

  return {
    rows,
    total_donations_pence: totalDon,
    total_gift_aid_reclaimable_pence: totalGa,
  };
}
