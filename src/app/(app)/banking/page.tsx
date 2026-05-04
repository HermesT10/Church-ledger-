import { getActiveOrg } from '@/lib/org';
import {
  getBankingHubData,
  getBankingMonthlyStats,
  getRecentBankDeposits,
} from '@/lib/banking/actions';
import { PageShell } from '@/components/page-shell';
import { BankingHubClient } from './banking-hub-client';

export default async function BankingPage() {
  const { orgId, role, orgName } = await getActiveOrg();

  const [hubResult, monthlyResult, depositsResult] = await Promise.all([
    getBankingHubData(),
    getBankingMonthlyStats(12),
    getRecentBankDeposits(8),
  ]);

  const data = hubResult.data ?? { summary: {
    statement_balance_pence: null,
    book_balance_pence: null,
    difference_pence: null,
    unreconciled_transactions: 0,
    statements_imported_this_month: 0,
    stale_bank_imports: 0,
    possible_duplicates: 0,
    last_reconciled_date: null,
    month_end_ready: false,
  }, accounts: [] };

  return (
    <PageShell>
      <BankingHubClient
        orgName={orgName}
        role={role}
        orgId={orgId}
        data={data}
        monthlyStats={monthlyResult.data}
        recentDeposits={depositsResult.data}
        error={hubResult.error}
      />
    </PageShell>
  );
}
