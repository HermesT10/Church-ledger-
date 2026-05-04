import 'server-only';

import { createClient } from '@/lib/supabase/server';
import {
  buildGivingRegisterSummary,
  type GivingRegisterData,
  type GivingRegisterDonationSourceRow,
  type GivingRegisterDonorSourceRow,
  type GivingRegisterFilters,
} from './giving-register-summary';
import { CHANNEL_LABELS, type DonationChannel } from './types';

export type {
  GivingRegisterData,
  GivingRegisterDonation,
  GivingRegisterFilters,
  GivingRegisterMonthIndex,
  GivingRegisterOption,
  GivingRegisterRow,
  GivingRegisterSummary,
} from './giving-register-summary';

function paymentMethodLabel(value: string | null) {
  if (!value) return 'Unknown';
  return CHANNEL_LABELS[value as DonationChannel] ?? value.replaceAll('_', ' ');
}

export async function getGivingRegisterData(
  orgId: string,
  filters: GivingRegisterFilters
): Promise<{ data: GivingRegisterData | null; error: string | null }> {
  const supabase = await createClient();
  const startDate = `${filters.year}-01-01`;
  const endDate = `${filters.year}-12-31`;

  const donorsPromise = supabase
    .from('donors')
    .select('id, full_name, first_name, last_name, display_name, is_active')
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .order('last_name', { ascending: true, nullsFirst: false })
    .order('first_name', { ascending: true, nullsFirst: false })
    .order('full_name', { ascending: true });

  let donationsQuery = supabase
    .from('donations')
    .select(
      'id, donor_id, donation_date, amount_pence, gross_amount_pence, net_amount_pence, fund_id, channel, provider_reference, gift_aid_status, gift_aid_claim_batch_id, bank_transaction_id, donors(full_name, display_name), funds(name)'
    )
    .eq('organisation_id', orgId)
    .gte('donation_date', startDate)
    .lte('donation_date', endDate);
  if (!filters.includeCorrectedVoided) {
    donationsQuery = donationsQuery.not('status', 'eq', 'voided').not('status', 'eq', 'corrected');
  } else {
    donationsQuery = donationsQuery.not('status', 'eq', 'voided');
  }
  donationsQuery = donationsQuery.order('donation_date', { ascending: true });

  if (filters.fundId) donationsQuery = donationsQuery.eq('fund_id', filters.fundId);
  if (filters.giftAidStatus) donationsQuery = donationsQuery.eq('gift_aid_status', filters.giftAidStatus);
  if (filters.paymentMethod) donationsQuery = donationsQuery.eq('channel', filters.paymentMethod);

  const fundsPromise = supabase
    .from('funds')
    .select('id, name')
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  const [donorsResult, donationsResult, fundsResult] = await Promise.all([
    donorsPromise,
    donationsQuery,
    fundsPromise,
  ]);

  if (donorsResult.error) return { data: null, error: donorsResult.error.message };
  if (donationsResult.error) return { data: null, error: donationsResult.error.message };
  if (fundsResult.error) return { data: null, error: fundsResult.error.message };

  const donations = (donationsResult.data ?? []) as unknown as GivingRegisterDonationSourceRow[];
  const summary = buildGivingRegisterSummary({
    year: filters.year,
    donors: (donorsResult.data ?? []) as GivingRegisterDonorSourceRow[],
    donations,
    filters,
  });

  const giftAidStatuses = [...new Set(donations.map((donation) => donation.gift_aid_status).filter(Boolean))]
    .sort()
    .map((status) => ({
      id: status as string,
      label: (status as string).replaceAll('_', ' '),
    }));

  const paymentMethods = [...new Set(donations.map((donation) => donation.channel).filter(Boolean))]
    .sort()
    .map((channel) => ({
      id: channel as string,
      label: paymentMethodLabel(channel as string),
    }));

  return {
    data: {
      summary,
      funds: (fundsResult.data ?? []).map((fund) => ({ id: fund.id, label: fund.name })),
      giftAidStatuses,
      paymentMethods,
    },
    error: null,
  };
}
