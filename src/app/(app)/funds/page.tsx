import { getActiveOrg } from '@/lib/org';
import { getFundsWithStats } from '@/lib/funds/actions';
import type { FundType } from '@/lib/funds/types';
import { FundsClient } from './funds-client';

export default async function FundsPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    active?: string;
    period?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { role } = await getActiveOrg();
  const params = await searchParams;
  const canEdit = role === 'admin' || role === 'treasurer';

  const filterType = params.type && params.type !== 'all'
    ? (params.type as FundType)
    : undefined;
  const activeOnly = params.active === 'true';

  // Period calculation
  const now = new Date();
  let startDate: string | undefined;
  let endDate: string | undefined;
  const period = params.period ?? 'this_month';

  if (period === 'this_month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    endDate = now.toISOString().slice(0, 10);
  } else if (period === 'last_month') {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    startDate = lm.toISOString().slice(0, 10);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
  } else if (period === 'ytd') {
    startDate = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    endDate = now.toISOString().slice(0, 10);
  } else if (period === 'custom' && params.from && params.to) {
    startDate = params.from;
    endDate = params.to;
  }

  const { data: funds, error } = await getFundsWithStats({
    type: filterType,
    activeOnly,
    startDate,
    endDate,
  });

  return (
    <FundsClient
      funds={funds}
      error={error}
      canEdit={canEdit}
      filterType={filterType ?? null}
      activeOnly={activeOnly}
      period={period}
      startDate={startDate ?? ''}
      endDate={endDate ?? ''}
    />
  );
}
