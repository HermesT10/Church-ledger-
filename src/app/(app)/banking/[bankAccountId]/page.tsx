import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getBankAccountStats, getBankLines } from '@/lib/banking/actions';
import { Landmark, CircleDollarSign, AlertCircle, CheckCircle2, Upload } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BankLineActions } from './bank-line-actions';

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function penceToPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

export default async function BankAccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankAccountId: string }>;
  searchParams: Promise<{
    page?: string;
    filter?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const { bankAccountId } = await params;
  const sp = await searchParams;
  const canEdit = role === 'admin' || role === 'treasurer';

  const supabase = await createClient();

  // Fetch bank account (exclude archived)
  const { data: bankAccount } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('id', bankAccountId)
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .single();

  if (!bankAccount) notFound();

  // Fetch active accounts, funds, and suppliers for the allocation dropdown
  const [{ data: accounts }, { data: funds }, { data: suppliers }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('code'),
    supabase
      .from('funds')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
  ]);

  // Fetch stats
  const { data: stats } = await getBankAccountStats(bankAccountId);

  // Fetch paginated lines
  const page = parseInt(sp.page || '1', 10);
  const filter = (sp.filter as 'all' | 'allocated' | 'unallocated') || 'all';

  const { data: paginatedData, error: linesError } = await getBankLines({
    bankAccountId,
    page,
    pageSize: 50,
    filter,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    search: sp.search,
  });

  const { lines, total, totalPages } = paginatedData;

  // Build filter URL helper
  function filterUrl(overrides: Record<string, string | undefined>) {
    const base: Record<string, string> = {};
    if (sp.filter && sp.filter !== 'all') base.filter = sp.filter;
    if (sp.dateFrom) base.dateFrom = sp.dateFrom;
    if (sp.dateTo) base.dateTo = sp.dateTo;
    if (sp.search) base.search = sp.search;
    if (sp.page && sp.page !== '1') base.page = sp.page;

    const merged = { ...base, ...overrides };
    // Remove undefined/empty
    const clean = Object.entries(merged).filter(([, v]) => v && v !== 'all');
    if (clean.length === 0) return `/banking/${bankAccountId}`;
    return `/banking/${bankAccountId}?${new URLSearchParams(clean as [string, string][]).toString()}`;
  }

  return (
    <PageShell className="max-w-7xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/banking" className="text-sm text-muted-foreground hover:underline">
            &larr; Back to Bank Accounts
          </Link>
        </div>
        {canEdit && (
          <Button asChild>
            <Link href={`/banking/${bankAccountId}/import`}>
              <Upload size={16} className="mr-1.5" />
              Import CSV
            </Link>
          </Button>
        )}
      </div>

      <div className="rounded-[1.75rem] border border-border/80 bg-white/98 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Banking workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{bankAccount.name}</h1>
          <p className="text-sm text-muted-foreground">
            Review imported lines, allocation status, and reconciliation readiness.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2 font-medium text-foreground">
            <Landmark size={18} className="text-muted-foreground" />
            Bank account
          </span>
          <div className="h-4 w-px bg-border/80" />
          {bankAccount.sort_code && (
            <span className="font-mono">{bankAccount.sort_code}</span>
          )}
          {bankAccount.account_number_last4 && (
            <span className="font-mono">****{bankAccount.account_number_last4}</span>
          )}
          <Badge variant="outline">{bankAccount.currency}</Badge>
          {!bankAccount.is_active && (
            <Badge variant="destructive">Inactive</Badge>
          )}
          {bankAccount.linked_account_id ? (
            <Badge variant="default">GL Linked</Badge>
          ) : (
            <Badge variant="secondary">No GL Account</Badge>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Current Balance"
            value={stats.currentBalancePence != null ? `£${penceToPounds(stats.currentBalancePence)}` : '—'}
            subtitle="Latest statement balance"
            href={`/banking/${bankAccountId}`}
            tint="blue"
            icon={<CircleDollarSign size={20} />}
          />
          <StatCard
            title="Total Transactions"
            value={stats.totalLines}
            subtitle="All imported lines"
            href={`/banking/${bankAccountId}`}
            tint="violet"
            icon={<Landmark size={20} />}
          />
          <StatCard
            title="Allocated"
            value={stats.allocatedCount}
            subtitle="Assigned to accounts"
            href={filterUrl({ filter: 'allocated', page: undefined })}
            tint="emerald"
            icon={<CheckCircle2 size={20} />}
          />
          <StatCard
            title="Unallocated"
            value={stats.unallocatedCount}
            subtitle={stats.unallocatedAmountPence > 0 ? `£${penceToPounds(stats.unallocatedAmountPence)} pending` : 'All clear'}
            href={filterUrl({ filter: 'unallocated', page: undefined })}
            tint="amber"
            icon={<AlertCircle size={20} />}
          />
        </div>
      )}

      {/* Filters */}
      <div className="app-filter-bar">
        <span className="text-sm font-medium text-muted-foreground mr-1">Filter:</span>
        {(['all', 'unallocated', 'allocated'] as const).map((f) => (
          <Button
            key={f}
            asChild
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
          >
            <Link href={filterUrl({ filter: f === 'all' ? undefined : f, page: undefined })}>
              {f === 'all' ? 'All' : f === 'allocated' ? 'Allocated' : 'Unallocated'}
            </Link>
          </Button>
        ))}

        {/* Search form */}
        <form
          action={`/banking/${bankAccountId}`}
          method="get"
          className="ml-auto flex items-center gap-1"
        >
          {sp.filter && sp.filter !== 'all' && (
            <input type="hidden" name="filter" value={sp.filter} />
          )}
          {sp.dateFrom && <input type="hidden" name="dateFrom" value={sp.dateFrom} />}
          {sp.dateTo && <input type="hidden" name="dateTo" value={sp.dateTo} />}
          <input
            type="text"
            name="search"
            defaultValue={sp.search ?? ''}
            placeholder="Search description or reference..."
            className="h-8 w-60 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
          {sp.search && (
            <Button asChild variant="ghost" size="sm">
              <Link href={filterUrl({ search: undefined })}>Clear</Link>
            </Button>
          )}
        </form>
      </div>

      {linesError && (
        <div className="rounded-[1.25rem] bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {linesError}
        </div>
      )}

      {/* Transactions Table */}
      {lines.length > 0 ? (
        <>
          <div className="app-table-shell">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.id} className={!line.allocated ? 'bg-amber-50/80' : ''}>
                    <TableCell className="whitespace-nowrap font-mono text-sm text-slate-500">
                      {formatDate(line.txn_date)}
                    </TableCell>
                    <TableCell className="max-w-[250px] truncate">
                      {line.description || '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {line.reference || '—'}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm ${
                        line.amount_pence < 0 ? 'app-table-amount-negative' : 'app-table-amount-positive'
                      }`}
                    >
                      {line.amount_pence < 0 ? '-' : ''}£{penceToPounds(Math.abs(line.amount_pence))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-slate-500">
                      {line.balance_pence != null
                        ? `£${penceToPounds(line.balance_pence)}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {line.allocated ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                            Allocated
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                            Unallocated
                          </Badge>
                        )}
                        {line.reconciled && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                            Reconciled
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <BankLineActions
                          line={line}
                          accounts={accounts ?? []}
                          funds={funds ?? []}
                          suppliers={suppliers ?? []}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total} transactions
              </span>
              <div className="flex gap-1">
                {page > 1 && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={filterUrl({ page: String(page - 1) })}>Previous</Link>
                  </Button>
                )}
                {page < totalPages && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={filterUrl({ page: String(page + 1) })}>Next</Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="app-empty-state p-8 text-center">
          <Landmark className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No transactions found.{' '}
            {canEdit && (
              <Link href={`/banking/${bankAccountId}/import`} className="text-primary hover:underline">
                Import a CSV statement
              </Link>
            )}
          </p>
        </div>
      )}
    </PageShell>
  );
}
