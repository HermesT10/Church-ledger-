import Link from 'next/link';
import { Plus, Upload, ArrowLeftRight, Download, AlertTriangle, CheckCircle2, FileText, Clock } from 'lucide-react';
import { getTransactionList } from '@/lib/transactions/actions';
import type { TransactionStatus } from '@/lib/transactions/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { FilterBar, FilterBarLabel } from '@/components/ui/filter-bar';
import { SearchInput } from '@/components/ui/search-input';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function pounds(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  return sign + '£' + (Math.abs(pence) / 100).toFixed(2);
}

function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const TABS: { id: string; label: string; status?: TransactionStatus; missingReceipt?: boolean }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft', status: 'draft' },
  { id: 'awaiting_match', label: 'Awaiting Match', status: 'awaiting_bank_match' },
  { id: 'matched', label: 'Matched', status: 'matched' },
  { id: 'reconciled', label: 'Reconciled', status: 'reconciled' },
  { id: 'missing_receipts', label: 'Missing Receipts', missingReceipt: true },
  { id: 'possible_duplicates', label: 'Possible Duplicates' },
];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const tab = TABS.find((item) => item.id === (params.tab ?? 'all')) ?? TABS[0];
  const page = Number.parseInt(params.page ?? '1', 10) || 1;
  const { data, error } = await getTransactionList({
    status: tab.status ?? 'all',
    type: params.type ?? 'all',
    missingReceipt: tab.missingReceipt,
    page,
    pageSize: 25,
  });

  const rows = data.rows;

  return (
    <PageShell>
      <PageHeader
        title="Transactions"
        subtitle="Record, explain, and match financial activity across your church."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link href="/transactions/new"><Plus size={14} className="mr-1" /> Add Transaction</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/transactions/new"><Upload size={14} className="mr-1" /> Upload Receipt</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/banking"><Upload size={14} className="mr-1" /> Import Bank Statement</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/reconciliation"><ArrowLeftRight size={14} className="mr-1" /> Match Transactions</Link>
            </Button>
            <Button variant="outline" disabled><Download size={14} className="mr-1" /> Export</Button>
          </div>
        }
      />

      <div className="rounded-2xl border border-border/70 bg-card p-4 text-sm leading-6 text-muted-foreground shadow-card">
        Manual transactions help explain income and spending before or during reconciliation. They are matched to bank statement lines so the same transaction is not counted twice.
      </div>

      {error ? <div className="rounded-2xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-5">
        <StatCard title="Awaiting Bank Match" value={data.summary.awaitingBankMatch.toString()} icon={<Clock size={20} />} tint="amber" href="/transactions?tab=awaiting_match" />
        <StatCard title="Draft Transactions" value={data.summary.drafts.toString()} icon={<FileText size={20} />} tint="slate" href="/transactions?tab=draft" />
        <StatCard title="Reconciled This Month" value={data.summary.reconciledThisMonth.toString()} icon={<CheckCircle2 size={20} />} tint="emerald" href="/transactions?tab=reconciled" />
        <StatCard title="Missing Receipts" value={data.summary.missingReceipts.toString()} icon={<AlertTriangle size={20} />} tint="rose" href="/transactions?tab=missing_receipts" />
        <StatCard title="Possible Duplicates" value={data.summary.possibleDuplicates.toString()} icon={<AlertTriangle size={20} />} tint="amber" href="/transactions?tab=possible_duplicates" />
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Button key={item.id} asChild size="sm" variant={item.id === tab.id ? 'default' : 'outline'}>
            <Link href={`/transactions?tab=${item.id}`}>{item.label}</Link>
          </Button>
        ))}
      </div>

      <FilterBar>
        <FilterBarLabel>Filters</FilterBarLabel>
        <SearchInput placeholder="Search is coming soon" disabled />
        <select className="h-9 rounded-md border bg-background px-3 text-sm" defaultValue={params.type ?? 'all'}>
          <option value="all">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
          <option value="transfer">Transfer</option>
          <option value="adjustment">Adjustment</option>
        </select>
      </FilterBar>

      <div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Fund</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Receipt</TableHead>
              <TableHead>Bank Match</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                  No transactions found.
                </TableCell>
              </TableRow>
            ) : rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatDate(row.transaction_date)}</TableCell>
                <TableCell><Badge variant="secondary">{row.type}</Badge></TableCell>
                <TableCell className="max-w-xs">
                  <div className="font-medium">{row.description}</div>
                  <div className="text-xs text-muted-foreground">{row.payee_payer_name ?? row.reference ?? 'No payee/reference'}</div>
                </TableCell>
                <TableCell className={row.amount_pence >= 0 ? 'font-mono tabular-nums text-success' : 'font-mono tabular-nums text-foreground'}>{pounds(row.amount_pence)}</TableCell>
                <TableCell>{row.fund_names.slice(0, 2).join(', ') || '-'}</TableCell>
                <TableCell>{row.account_names.slice(0, 2).join(', ') || '-'}</TableCell>
                <TableCell><StatusBadge status={row.status} /></TableCell>
                <TableCell>{row.attachment_count > 0 ? 'Attached' : <span className="text-warning">Missing</span>}</TableCell>
                <TableCell>{row.match_count > 0 || row.matched_bank_transaction_id ? 'Matched' : row.requires_bank_match ? 'Waiting' : 'Not required'}</TableCell>
                <TableCell>{row.created_by_name ?? '-'}</TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/transactions/${row.id}`}>View</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </PageShell>
  );
}
