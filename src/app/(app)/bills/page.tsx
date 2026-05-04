import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { ArrowDownLeft, ArrowUpRight, AlertTriangle, Receipt, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { WorkspaceEmptyState } from '@/components/workspace-empty-state';
import { MoneyAmount } from '@/components/money/money-amount';
import { formatMoney } from '@/lib/money/format-money';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listInvoiceHubItems } from '@/lib/invoices/actions';
import type { InvoiceHubItem, InvoiceHubTab } from '@/lib/invoices/types';

const VALID_TABS: InvoiceHubTab[] = ['bills-to-pay', 'owed-to-us', 'all', 'drafts', 'overdue'];

const TAB_LABELS: Record<InvoiceHubTab, string> = {
  'bills-to-pay': 'Bills to Pay',
  'owed-to-us': 'Invoices Owed to Us',
  all: 'All',
  drafts: 'Drafts',
  overdue: 'Overdue',
};

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'paid' || status === 'sent' || status === 'posted') return 'default';
  if (status === 'voided') return 'destructive';
  if (status === 'draft') return 'secondary';
  return 'outline';
}

function directionLabel(item: InvoiceHubItem) {
  return item.direction === 'payable' ? 'Bill to Pay' : 'Owed to Us';
}

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { role } = await getActiveOrg();
  const params = await searchParams;
  const tab = VALID_TABS.includes(params.tab as InvoiceHubTab) ? (params.tab as InvoiceHubTab) : 'bills-to-pay';
  const [{ data: allItems, error }, { data: visibleItems }] = await Promise.all([
    listInvoiceHubItems('all'),
    listInvoiceHubItems(tab),
  ]);
  const all = allItems ?? [];
  const items = visibleItems ?? [];
  const canEdit = role === 'admin' || role === 'treasurer';
  const today = new Date().toISOString().slice(0, 10);

  const payableCount = all.filter((item) => item.direction === 'payable').length;
  const receivableCount = all.filter((item) => item.direction === 'receivable').length;
  const draftCount = all.filter((item) => item.status === 'draft').length;
  const overdueCount = all.filter(
    (item) => item.dueDate && item.dueDate < today && item.paymentStatus !== 'paid' && item.status !== 'voided',
  ).length;
  const outstandingPayable = all
    .filter((item) => item.direction === 'payable' && item.paymentStatus !== 'paid')
    .reduce((sum, item) => sum + item.totalPence, 0);
  const outstandingReceivable = all
    .filter((item) => item.direction === 'receivable' && item.paymentStatus !== 'paid')
    .reduce((sum, item) => sum + item.totalPence - ('paidPence' in item ? item.paidPence : 0), 0);

  return (
    <PageShell>
      <PageHeader
        title="Invoices"
        subtitle="Manage Bills to Pay and Invoices Owed to Us."
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/bills/new">New Invoice</Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Bills to Pay" value={payableCount} subtitle="Supplier bills" href="/bills" tint="violet" icon={<ArrowUpRight size={20} />} />
        <StatCard title="Owed to Us" value={receivableCount} subtitle="Customer/hirer invoices" href="/bills?tab=owed-to-us" tint="emerald" icon={<ArrowDownLeft size={20} />} />
        <StatCard title="Payables Outstanding" value={formatMoney(outstandingPayable)} subtitle="Bills not paid" href="/bills?tab=bills-to-pay" tint="amber" icon={<Wallet size={20} />} />
        <StatCard title="Receivables Outstanding" value={formatMoney(outstandingReceivable)} subtitle="Money owed to church" href="/bills?tab=owed-to-us" tint="blue" icon={<Receipt size={20} />} />
        <StatCard title="Overdue" value={overdueCount} subtitle={`${draftCount} draft${draftCount === 1 ? '' : 's'}`} href="/bills?tab=overdue" tint="red" icon={<AlertTriangle size={20} />} />
      </div>

      <div className="flex flex-wrap gap-2">
        {VALID_TABS.map((value) => (
          <Button key={value} asChild variant={tab === value ? 'default' : 'outline'} size="sm">
            <Link href={value === 'bills-to-pay' ? '/bills' : `/bills?tab=${value}`}>{TAB_LABELS[value]}</Link>
          </Button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/40 bg-white/70 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isOverdue = item.dueDate && item.dueDate < today && item.paymentStatus !== 'paid' && item.status !== 'voided';
                return (
                  <TableRow key={`${item.direction}-${item.id}`} className={isOverdue ? 'bg-red-100/55' : ''}>
                    <TableCell>
                      <Badge variant={item.direction === 'payable' ? 'secondary' : 'outline'}>{directionLabel(item)}</Badge>
                    </TableCell>
                    <TableCell>{item.counterpartyName}</TableCell>
                    <TableCell>
                      <Link href={item.href} className="font-medium text-primary underline-offset-4 hover:underline">
                        {item.invoiceNumber || item.id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(item.invoiceDate)}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        {item.dueDate ? formatDate(item.dueDate) : '—'}
                        {isOverdue && <Badge variant="destructive" className="px-1 py-0 text-[10px]">Overdue</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(item.status)} className="text-xs">{statusLabel(item.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{statusLabel(item.paymentStatus)}</TableCell>
                    <TableCell className="text-right">
                      <MoneyAmount amountPence={item.totalPence} semantic={item.direction === 'payable' ? 'expense' : 'income'} size="sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={item.href}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <WorkspaceEmptyState
          icon={<Receipt className="h-10 w-10" />}
          title="No invoices yet"
          description={canEdit ? 'Create a Bill to Pay or an Invoice Owed to Us to get started.' : 'Invoices will appear here once your finance team records them.'}
          action={canEdit ? <Button asChild><Link href="/bills/new">Create Invoice</Link></Button> : undefined}
        />
      )}
    </PageShell>
  );
}
