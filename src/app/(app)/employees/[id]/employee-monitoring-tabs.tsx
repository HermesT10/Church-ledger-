import Link from 'next/link';
import type { ReactNode } from 'react';
import { Activity, CalendarDays, CreditCard, FileText, Landmark, ReceiptText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type {
  EmployeeBudgetUsageRow,
  EmployeeMonitoringActivityItem,
  EmployeeMonitoringCalendarItem,
  EmployeeMonitoringCard,
  EmployeeMonitoringData,
  EmployeeMonitoringSubmission,
  EmployeeMonitoringTransaction,
} from '@/lib/employees/monitoring-types';

function money(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value / 100);
}

function date(value: string | null) {
  if (!value) return 'Not dated';
  return new Date(value).toLocaleDateString('en-GB');
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const variant = normalized.includes('reject') || normalized.includes('over')
    ? 'destructive'
    : normalized.includes('approved') || normalized.includes('posted') || normalized.includes('paid') || normalized.includes('ok')
      ? 'default'
      : 'secondary';
  return <Badge variant={variant}>{value.replaceAll('_', ' ')}</Badge>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-5 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function EmployeeMonitoringSummaryCards({ data }: { data: EmployeeMonitoringData | null }) {
  if (!data) return null;
  const cards = [
    { label: 'Portal user', value: data.overview.monitoredUserId ? 'Linked' : 'Pending invite' },
    { label: 'Pages enabled', value: data.overview.enabledPageCount.toString() },
    { label: 'Budget assignments', value: data.overview.budgetAssignmentCount.toString() },
    { label: 'Cards assigned', value: data.overview.cardAssignmentCount.toString() },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="rounded-3xl border-border/70 bg-card shadow-card">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function EmployeeMonitoringBudgets({ rows }: { rows: EmployeeBudgetUsageRow[] }) {
  return (
    <Card className="rounded-3xl border-border/70 bg-card shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Landmark size={18} /> Budget Usage</CardTitle>
        <CardDescription>Assigned budget/category usage, pending submissions, remaining balance, and linked posted activity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? <EmptyState>No assigned budget usage found for this portal user.</EmptyState> : (
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Budget / category</TableHead>
                  <TableHead>Allocated</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.assignmentId}>
                    <TableCell>
                      <p className="font-medium">{row.budgetName}</p>
                      <p className="text-xs text-muted-foreground">{row.categoryName ?? 'All categories'}</p>
                    </TableCell>
                    <TableCell>{money(row.annualAllocationPence)}</TableCell>
                    <TableCell>{money(row.usedPence)}</TableCell>
                    <TableCell>{money(row.pendingPence)}</TableCell>
                    <TableCell>{money(row.remainingPence)}</TableCell>
                    <TableCell><StatusBadge value={row.overspendRisk} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <LinkedTransactions rows={rows.flatMap((row) => row.linkedTransactions)} />
      </CardContent>
    </Card>
  );
}

export function EmployeeMonitoringSubmissions({ rows }: { rows: EmployeeMonitoringSubmission[] }) {
  const groups = [
    { type: 'invoice', label: 'Invoices', href: '/workflows/invoices' },
    { type: 'expense', label: 'Expenses', href: '/workflows/portal-expenses' },
    { type: 'cash_collection', label: 'Cash Collections', href: '/cash/collection-submissions' },
  ] as const;
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {groups.map((group) => {
        const groupRows = rows.filter((row) => row.type === group.type);
        return (
          <Card key={group.type} className="rounded-3xl border-border/70 bg-card shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><FileText size={18} /> {group.label}</span>
                <Button asChild variant="outline" size="sm"><Link href={group.href}>Review queue</Link></Button>
              </CardTitle>
              <CardDescription>{groupRows.length} records submitted by this user.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {groupRows.length === 0 ? <EmptyState>No {group.label.toLowerCase()} found.</EmptyState> : groupRows.map((row) => (
                <div key={row.id} className="rounded-2xl border border-border/70 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{row.title}</p>
                      <p className="text-xs text-muted-foreground">{date(row.submittedAt)} · {money(row.amountPence)}</p>
                    </div>
                    <StatusBadge value={row.status} />
                  </div>
                  {row.note ? <p className="mt-2 text-xs text-muted-foreground">{row.note}</p> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function EmployeeMonitoringTransactions({ rows }: { rows: EmployeeMonitoringTransaction[] }) {
  return (
    <Card className="rounded-3xl border-border/70 bg-card shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ReceiptText size={18} /> Related Transactions</CardTitle>
        <CardDescription>Manual transactions, linked bank lines, and posted journal lines connected to the user.</CardDescription>
      </CardHeader>
      <CardContent>
        <TransactionTable rows={rows} emptyText="No related transactions found." />
      </CardContent>
    </Card>
  );
}

export function EmployeeMonitoringCards({ rows }: { rows: EmployeeMonitoringCard[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {rows.length === 0 ? <EmptyState>No assigned cards found for this portal user.</EmptyState> : rows.map((row) => (
        <Card key={row.id} className="rounded-3xl border-border/70 bg-card shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><CreditCard size={18} /> {row.cardName}</span>
              <StatusBadge value={row.status} />
            </CardTitle>
            <CardDescription>
              {row.bankAccountName ?? 'No linked bank account'} {row.lastFour ? `· ending ${row.lastFour}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Limit</p>
                <p className="font-semibold">{row.spendingLimitPence == null ? 'Not set' : money(row.spendingLimitPence)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Spent</p>
                <p className="font-semibold">{money(row.spentPence)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="font-semibold">{row.remainingPence == null ? 'N/A' : money(row.remainingPence)}</p>
              </div>
            </div>
            <TransactionTable rows={row.linkedTransactions} emptyText="No card-linked transactions found." compact />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function EmployeeMonitoringCalendar({ rows }: { rows: EmployeeMonitoringCalendarItem[] }) {
  return (
    <Card className="rounded-3xl border-border/70 bg-card shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarDays size={18} /> Calendar & Tasks</CardTitle>
        <CardDescription>Events created, events attended, and portal tasks assigned to the user.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? <EmptyState>No calendar events or tasks found.</EmptyState> : rows.map((row) => (
          <div key={`${row.type}:${row.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 p-3 text-sm">
            <div>
              <p className="font-semibold">{row.title}</p>
              <p className="text-xs text-muted-foreground">{row.type.replaceAll('_', ' ')} · {date(row.date)}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge value={row.status} />
              {row.href ? <Button asChild variant="outline" size="sm"><Link href={row.href}>Open</Link></Button> : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function EmployeeMonitoringActivity({ rows }: { rows: EmployeeMonitoringActivityItem[] }) {
  return (
    <Card className="rounded-3xl border-border/70 bg-card shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Activity size={18} /> Activity / Audit</CardTitle>
        <CardDescription>Invite, permission, submission, notification, calendar, task, and audit events.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? <EmptyState>No activity found for this user yet.</EmptyState> : rows.map((row) => (
          <div key={`${row.type}:${row.id}`} className="rounded-2xl border border-border/70 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold capitalize">{row.title}</p>
                <p className="text-xs text-muted-foreground">{row.type.replaceAll('_', ' ')} · {new Date(row.occurredAt).toLocaleString('en-GB')}</p>
              </div>
              <StatusBadge value={row.severity} />
            </div>
            {row.description ? <p className="mt-2 text-xs text-muted-foreground">{row.description}</p> : null}
            {row.href ? <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0"><Link href={row.href}>Open source record</Link></Button> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function LinkedTransactions({ rows }: { rows: EmployeeMonitoringTransaction[] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">Linked transactions</p>
      <TransactionTable rows={rows} emptyText="No posted transactions linked to these assignments yet." compact />
    </div>
  );
}

function TransactionTable({ rows, emptyText, compact = false }: { rows: EmployeeMonitoringTransaction[]; emptyText: string; compact?: boolean }) {
  if (rows.length === 0) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/70">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            {!compact ? <TableHead>Source</TableHead> : null}
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.type}:${row.id}`}>
              <TableCell>{date(row.date)}</TableCell>
              <TableCell>
                {row.href ? <Link href={row.href} className="font-medium text-primary hover:underline">{row.description}</Link> : row.description}
              </TableCell>
              {!compact ? <TableCell>{row.type.replaceAll('_', ' ')}</TableCell> : null}
              <TableCell>{money(row.amountPence)}</TableCell>
              <TableCell><StatusBadge value={row.reconciled ? 'reconciled' : row.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
