import { CHANNEL_LABELS, type DonationChannel } from './types';

export const GIVING_REGISTER_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export type GivingRegisterMonthIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export interface GivingRegisterFilters {
  year: number;
  fundId?: string;
  giftAidStatus?: string;
  paymentMethod?: string;
  search?: string;
  showAnonymous?: boolean;
  /** When true, include donations in voided or corrected (unreconciled) lifecycle states. */
  includeCorrectedVoided?: boolean;
}

export interface GivingRegisterDonation {
  id: string;
  donor_id: string | null;
  donor_name: string;
  donation_date: string;
  month: GivingRegisterMonthIndex;
  amount_pence: number;
  fund_id: string | null;
  fund_name: string | null;
  payment_method: string | null;
  payment_method_label: string;
  bank_transaction_id: string | null;
  reference: string | null;
  description: string | null;
  gift_aid_status: string | null;
  gift_aid_claim_batch_id: string | null;
  reconciliation_status: string;
}

export interface GivingRegisterRow {
  donor_id: string | null;
  donor_name: string;
  sort_name: string;
  is_anonymous: boolean;
  monthly_totals_pence: number[];
  monthly_gift_aid_issue_counts: number[];
  total_pence: number;
  gift_aid_status_label: string;
  last_donation_date: string | null;
  donations: GivingRegisterDonation[];
}

export interface GivingRegisterSummary {
  year: number;
  rows: GivingRegisterRow[];
  totals_by_month_pence: number[];
  total_pence: number;
  donation_count: number;
  donor_count: number;
  gift_aid_issue_count: number;
}

export interface GivingRegisterOption {
  id: string;
  label: string;
}

export interface GivingRegisterData {
  summary: GivingRegisterSummary;
  funds: GivingRegisterOption[];
  giftAidStatuses: GivingRegisterOption[];
  paymentMethods: GivingRegisterOption[];
}

export interface GivingRegisterDonorSourceRow {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  is_active: boolean;
}

export interface GivingRegisterDonationSourceRow {
  id: string;
  donor_id: string | null;
  donation_date: string;
  amount_pence: number | null;
  gross_amount_pence: number | null;
  net_amount_pence: number | null;
  fund_id: string | null;
  channel: string | null;
  provider_reference: string | null;
  gift_aid_status: string | null;
  gift_aid_claim_batch_id: string | null;
  bank_transaction_id: string | null;
  donors: { full_name: string | null; display_name: string | null } | null;
  funds: { name: string | null } | null;
}

const GIFT_AID_ISSUE_STATUSES = new Set([
  'missing_declaration',
  'matched_no_declaration',
  'invalid_donor_details',
  'needs_review',
  'not_assessed',
  'rejected',
]);

function normaliseSearch(value: string | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function penceAmount(row: GivingRegisterDonationSourceRow) {
  return Number(row.gross_amount_pence ?? row.amount_pence ?? row.net_amount_pence ?? 0);
}

function displayDonorName(donor: GivingRegisterDonorSourceRow) {
  return donor.display_name || donor.full_name || [donor.first_name, donor.last_name].filter(Boolean).join(' ');
}

function sortNameForDonor(donor: GivingRegisterDonorSourceRow) {
  const lastName = donor.last_name?.trim();
  const firstName = donor.first_name?.trim();
  if (lastName || firstName) return [lastName, firstName].filter(Boolean).join(', ').toLowerCase();
  return displayDonorName(donor).toLowerCase();
}

function giftAidIssueCount(donations: GivingRegisterDonation[]) {
  return donations.filter((donation) =>
    donation.gift_aid_status ? GIFT_AID_ISSUE_STATUSES.has(donation.gift_aid_status) : false
  ).length;
}

function giftAidStatusLabel(donations: GivingRegisterDonation[]) {
  if (donations.length === 0) return 'No giving this year';
  const statuses = new Set(
    donations
      .map((donation) => donation.gift_aid_status)
      .filter((status): status is string => Boolean(status))
  );
  if (statuses.size === 0) return 'Not assessed';
  if ([...statuses].some((status) => GIFT_AID_ISSUE_STATUSES.has(status))) return 'Needs attention';
  if ([...statuses].every((status) => status === 'claimed' || status === 'paid')) return 'Fully claimed';
  if ([...statuses].some((status) => status === 'eligible')) return 'Eligible';
  if ([...statuses].some((status) => status === 'included_in_draft_claim' || status === 'included_in_claim')) {
    return 'In draft claim';
  }
  return [...statuses].join(', ').replaceAll('_', ' ');
}

function paymentMethodLabel(value: string | null) {
  if (!value) return 'Unknown';
  return CHANNEL_LABELS[value as DonationChannel] ?? value.replaceAll('_', ' ');
}

function createEmptyRow(params: {
  donorId: string | null;
  donorName: string;
  sortName: string;
  isAnonymous: boolean;
}): GivingRegisterRow {
  return {
    donor_id: params.donorId,
    donor_name: params.donorName,
    sort_name: params.sortName,
    is_anonymous: params.isAnonymous,
    monthly_totals_pence: Array(12).fill(0),
    monthly_gift_aid_issue_counts: Array(12).fill(0),
    total_pence: 0,
    gift_aid_status_label: 'No giving this year',
    last_donation_date: null,
    donations: [],
  };
}

export function buildGivingRegisterSummary(params: {
  year: number;
  donors: GivingRegisterDonorSourceRow[];
  donations: GivingRegisterDonationSourceRow[];
  filters?: Omit<GivingRegisterFilters, 'year'>;
}): GivingRegisterSummary {
  const search = normaliseSearch(params.filters?.search);
  const showAnonymous = params.filters?.showAnonymous ?? true;
  const rows = new Map<string, GivingRegisterRow>();

  for (const donor of params.donors) {
    const donorName = displayDonorName(donor);
    if (search && !donorName.toLowerCase().includes(search)) continue;
    rows.set(
      donor.id,
      createEmptyRow({
        donorId: donor.id,
        donorName,
        sortName: sortNameForDonor(donor),
        isAnonymous: false,
      })
    );
  }

  if (showAnonymous && !search) {
    rows.set(
      'anonymous',
      createEmptyRow({
        donorId: null,
        donorName: 'Anonymous giving',
        sortName: 'zzzz anonymous giving',
        isAnonymous: true,
      })
    );
  }

  for (const source of params.donations) {
    const month = new Date(`${source.donation_date}T00:00:00`).getMonth() as GivingRegisterMonthIndex;
    const donorId = source.donor_id;
    const donorName =
      source.donors?.display_name || source.donors?.full_name || (donorId ? 'Unknown donor' : 'Anonymous giving');
    const rowKey = donorId ?? 'anonymous';

    if (!donorId && (!showAnonymous || search)) continue;
    if (!rows.has(rowKey)) {
      if (search && !donorName.toLowerCase().includes(search)) continue;
      rows.set(
        rowKey,
        createEmptyRow({
          donorId,
          donorName,
          sortName: donorName.toLowerCase(),
          isAnonymous: !donorId,
        })
      );
    }

    const amount = penceAmount(source);
    const donation: GivingRegisterDonation = {
      id: source.id,
      donor_id: donorId,
      donor_name: donorName,
      donation_date: source.donation_date,
      month,
      amount_pence: amount,
      fund_id: source.fund_id,
      fund_name: source.funds?.name ?? null,
      payment_method: source.channel,
      payment_method_label: paymentMethodLabel(source.channel),
      bank_transaction_id: source.bank_transaction_id,
      reference: source.provider_reference,
      description: null,
      gift_aid_status: source.gift_aid_status,
      gift_aid_claim_batch_id: source.gift_aid_claim_batch_id,
      reconciliation_status: source.bank_transaction_id ? 'Linked to bank transaction' : 'Not bank-linked',
    };

    const row = rows.get(rowKey);
    if (!row) continue;
    row.donations.push(donation);
    row.monthly_totals_pence[month] += amount;
    if (donation.gift_aid_status && GIFT_AID_ISSUE_STATUSES.has(donation.gift_aid_status)) {
      row.monthly_gift_aid_issue_counts[month] += 1;
    }
    row.total_pence += amount;
    if (!row.last_donation_date || source.donation_date > row.last_donation_date) {
      row.last_donation_date = source.donation_date;
    }
  }

  const resultRows = [...rows.values()]
    .map((row) => ({
      ...row,
      gift_aid_status_label: giftAidStatusLabel(row.donations),
    }))
    .filter((row) => row.total_pence > 0 || (!params.filters?.fundId && !params.filters?.giftAidStatus && !params.filters?.paymentMethod))
    .sort((left, right) => left.sort_name.localeCompare(right.sort_name));

  const totalsByMonth = Array(12).fill(0);
  let totalPence = 0;
  let donationCount = 0;
  let giftAidIssues = 0;

  for (const row of resultRows) {
    donationCount += row.donations.length;
    giftAidIssues += giftAidIssueCount(row.donations);
    row.monthly_totals_pence.forEach((value, index) => {
      totalsByMonth[index] += value;
      totalPence += value;
    });
  }

  return {
    year: params.year,
    rows: resultRows,
    totals_by_month_pence: totalsByMonth,
    total_pence: totalPence,
    donation_count: donationCount,
    donor_count: resultRows.filter((row) => !row.is_anonymous && row.total_pence > 0).length,
    gift_aid_issue_count: giftAidIssues,
  };
}
