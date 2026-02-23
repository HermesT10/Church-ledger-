import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import {
  getFund,
  getFundDetailStats,
  getFundAccountBreakdown,
  getFundTransactions,
} from '@/lib/funds/actions';
import { FUND_TYPE_LABELS } from '@/lib/funds/types';
import { FundDetailClient } from './fund-detail-client';

export default async function FundDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string; page?: string }>;
}) {
  const { role } = await getActiveOrg();
  const { id } = await params;
  const sp = await searchParams;
  const canEdit = role === 'admin' || role === 'treasurer';

  const fund = await getFund(id);
  if (!fund) notFound();

  // Determine period
  const now = new Date();
  const period = sp.period ?? 'ytd';
  let startDate: string;
  let endDate: string;

  if (period === 'this_month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    endDate = now.toISOString().slice(0, 10);
  } else if (period === 'last_month') {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    startDate = lm.toISOString().slice(0, 10);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
  } else if (period === 'custom' && sp.from && sp.to) {
    startDate = sp.from;
    endDate = sp.to;
  } else {
    // default to ytd
    startDate = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    endDate = now.toISOString().slice(0, 10);
  }

  const currentPage = parseInt(sp.page ?? '1', 10);

  const [statsResult, breakdownResult, txnResult] = await Promise.all([
    getFundDetailStats(id, startDate, endDate),
    getFundAccountBreakdown(id, startDate, endDate),
    getFundTransactions(id, startDate, endDate, currentPage, 25),
  ]);

  // Split breakdown into income and expense
  const incomeAccounts = breakdownResult.data.filter((a) => a.account_type === 'income');
  const expenseAccounts = breakdownResult.data.filter((a) => a.account_type === 'expense');

  return (
    <FundDetailClient
      fund={fund}
      fundTypeLabel={FUND_TYPE_LABELS[fund.type] ?? fund.type}
      canEdit={canEdit}
      stats={statsResult.data}
      incomeAccounts={incomeAccounts}
      expenseAccounts={expenseAccounts}
      transactions={txnResult.data}
      transactionTotal={txnResult.total}
      currentPage={currentPage}
      period={period}
      startDate={startDate}
      endDate={endDate}
    />
  );
}
