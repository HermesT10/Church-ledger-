import { getActiveOrg } from '@/lib/org';
import { canExportGiftAid } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import {
  getGiftAidClaimBuilderData,
  listGiftAidClaimBuilderSources,
  listGiftAidDonors,
  listReadyGasdsBatchesForClaimBuilder,
} from '@/lib/giftaid/actions';
import {
  resolveGiftAidClaimDateRange,
  type GiftAidClaimDatePreset,
} from '@/lib/giftaid/claim-range';
import { getFundsList } from '@/lib/funds/actions';
import { listIncomeStreams } from '@/lib/income-streams/actions';
import { ClaimBuilderClient } from './claim-builder-client';

export default async function GiftAidClaimBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    startDate?: string;
    endDate?: string;
    donorId?: string;
    fundId?: string;
    incomeStreamId?: string;
    source?: string;
    eligibleOnly?: string;
    excludeClaimed?: string;
    includeExceptions?: string;
  }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('fiscal_year_start_month')
    .eq('organisation_id', orgId)
    .single();
  const fiscalYearStartMonth = settings?.fiscal_year_start_month ?? 1;
  const preset = (
    params.preset === 'last_month' ||
    params.preset === 'this_quarter' ||
    params.preset === 'last_quarter' ||
    params.preset === 'financial_year_to_date' ||
    params.preset === 'custom'
      ? params.preset
      : 'this_month'
  ) as GiftAidClaimDatePreset;
  const resolvedRange = resolveGiftAidClaimDateRange({
    preset,
    fiscalYearStartMonth,
    customStartDate: params.startDate ?? null,
    customEndDate: params.endDate ?? null,
  });
  const startDate = params.startDate ?? resolvedRange.startDate;
  const endDate = params.endDate ?? resolvedRange.endDate;
  const donorId = params.donorId ?? '';
  const fundId = params.fundId ?? '';
  const incomeStreamId = params.incomeStreamId ?? '';
  const source = params.source ?? '';
  const onlyEligibleUnclaimed = params.eligibleOnly !== 'false';
  const excludeAlreadyClaimed = params.excludeClaimed !== 'false';
  const includeExceptions = params.includeExceptions === 'true';
  const [{ data }, donors, funds, incomeStreams, sources, gasdsReady] =
    await Promise.all([
      getGiftAidClaimBuilderData({
        organisationId: orgId,
        startDate,
        endDate,
        donorId: donorId || null,
        fundId: fundId || null,
        incomeStreamId: incomeStreamId || null,
        source: source || null,
        onlyEligibleUnclaimed,
        excludeAlreadyClaimed,
        includeExceptions,
      }),
      listGiftAidDonors(orgId),
      getFundsList({ activeOnly: true }),
      listIncomeStreams({ activeOnly: true }),
      listGiftAidClaimBuilderSources({
        organisationId: orgId,
        startDate,
        endDate,
      }),
      listReadyGasdsBatchesForClaimBuilder(),
    ]);

  return (
    <ClaimBuilderClient
      orgId={orgId}
      canEdit={canExportGiftAid(role).allowed}
      data={data}
      donorOptions={(donors.data ?? []).map((donor) => ({
        id: donor.id,
        label: donor.display_name ?? donor.full_name,
      }))}
      fundOptions={funds.map((fund) => ({
        id: fund.id,
        label: fund.name,
      }))}
      incomeStreamOptions={(incomeStreams.data ?? []).map((stream) => ({
        id: stream.id,
        label: `${stream.code} ${stream.name}`,
      }))}
      sourceOptions={sources.data ?? []}
      preset={resolvedRange.preset}
      fiscalYearStartMonth={fiscalYearStartMonth}
      startDate={startDate}
      endDate={endDate}
      donorId={donorId}
      fundId={fundId}
      incomeStreamId={incomeStreamId}
      source={source}
      onlyEligibleUnclaimed={onlyEligibleUnclaimed}
      excludeAlreadyClaimed={excludeAlreadyClaimed}
      includeExceptions={includeExceptions}
      gasdsOptions={gasdsReady.data ?? []}
    />
  );
}
