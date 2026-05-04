import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getAccount, getAccountsList, hasLinkedTransactions } from '@/lib/accounts/actions';
import { EditAccountForm } from './edit-form';
import { getPostedAccountNetMap } from '@/lib/accounts/balances';
import { getAccountActivity, getAccountFundBreakdown } from '@/lib/accounts/balances';
import { PageShell } from '@/components/page-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createClient } from '@/lib/supabase/server';
import { MoneyAmount } from '@/components/money/money-amount';
import { AccountDetailActivityClient } from './account-detail-activity-client';

export default async function AccountDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { role, orgId } = await getActiveOrg();
  const { id } = await props.params;
  const searchParams = await props.searchParams;

  const account = await getAccount(id);
  if (!account) notFound();

  const canEdit = role === 'admin' || role === 'treasurer';

  const typeFilter = account.type === 'equity' ? ('fund_balance' as const) : account.type;

  const siblingAccounts = await getAccountsList({
    type:
      account.type === 'equity' || account.type === 'fund_balance'
        ? ['fund_balance', 'equity']
        : typeFilter,
    activeOnly: true,
  });
  const parentCandidates = siblingAccounts.filter(
    (a) => a.id !== account.id && !a.parent_id,
  );

  const hasTransactions = await hasLinkedTransactions(id);

  const netMap = await getPostedAccountNetMap(orgId, [account.id]);
  const netAgg = netMap.get(account.id) ?? { lineCount: 0, netPence: 0 };

  const { rows: activity, total: actTotal } = await getAccountActivity(orgId, id, { page: 1, pageSize: 100 });
  const breakdown = await getAccountFundBreakdown(orgId, id);

  const supabase = await createClient();
  const { data: auditRows } =
    role === 'admin' || role === 'treasurer'
      ? await supabase
          .from('audit_log')
          .select('created_at, action, user_id')
          .eq('organisation_id', orgId)
          .eq('entity_type', 'account')
          .eq('entity_id', id)
          .order('created_at', { ascending: false })
          .limit(20)
      : { data: null };

  return (
    <PageShell className="max-w-6xl space-y-6">
      <div>
        <Link href="/accounts" className="text-sm text-muted-foreground hover:underline">
          ← Back to Accounts
        </Link>
        <h1 className="text-2xl font-bold mt-2">{account.name}</h1>
        <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1 gap-y-1">
          <span className="font-mono">{account.code}</span>
          <span>·</span>
          <span>Posted lines: {netAgg.lineCount}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            Net balance:
            <MoneyAmount amountPence={netAgg.netPence} semantic="ledger_net" size="sm" className="font-mono" />
          </span>
        </p>
        {searchParams.error && (
          <p className="text-sm text-destructive mt-2">{searchParams.error}</p>
        )}
      </div>

      <EditAccountForm
        account={account}
        canEdit={canEdit}
        parentCandidates={parentCandidates}
        hasTransactions={hasTransactions}
      />

      <AccountDetailActivityClient accountType={account.type} activity={activity} totalLines={actTotal} />

      <Card>
        <CardHeader>
          <CardTitle>Fund breakdown</CardTitle>
          <CardDescription>Net movement split by posted fund tagging.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fund</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No fund-tagged posted lines yet.
                  </TableCell>
                </TableRow>
              ) : (
                breakdown.map((r) => (
                  <TableRow key={String(r.fund_id ?? '__null__')}>
                    <TableCell>{r.fund_name ?? '—'}</TableCell>
                    <TableCell className="text-right">{r.percent_of_total}%</TableCell>
                    <TableCell className="text-right">
                      <MoneyAmount amountPence={r.net_pence} semantic="ledger_net" size="sm" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {auditRows && auditRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Audit history</CardTitle>
            <CardDescription>Recent changes recorded on this account.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {auditRows.map((ev) => (
                <li key={`${ev.action}-${ev.created_at}`} className="flex justify-between gap-4 border-b pb-2">
                  <span>{ev.action}</span>
                  <span className="text-muted-foreground text-xs">{String(ev.created_at)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
