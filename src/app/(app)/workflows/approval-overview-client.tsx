'use client';

import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  ApprovalCounts,
  InvoiceSubmissionRow,
  ExpenseRequestRow,
  ConversationRow,
} from '@/lib/workflows/types';

function formatPence(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function statusBadgeVariant(
  status: 'pending' | 'approved' | 'rejected' | 'converted',
): 'secondary' | 'default' | 'destructive' | 'outline' {
  switch (status) {
    case 'pending':
      return 'secondary';
    case 'approved':
      return 'default';
    case 'rejected':
      return 'destructive';
    case 'converted':
      return 'outline';
    default:
      return 'secondary';
  }
}

interface ApprovalOverviewClientProps {
  role: string;
  counts: ApprovalCounts;
  recentInvoices: InvoiceSubmissionRow[];
  recentExpenses: ExpenseRequestRow[];
  conversations: ConversationRow[];
}

export function ApprovalOverviewClient({
  role,
  counts,
  recentInvoices,
  recentExpenses,
  conversations,
}: ApprovalOverviewClientProps) {
  const isAdminOrTreasurer = role === 'admin' || role === 'treasurer';

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.pendingInvoices}</div>
            <Button variant="link" className="h-auto p-0 text-xs" asChild>
              <Link href="/workflows/invoices?status=pending">View all</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.pendingExpenses}</div>
            <Button variant="link" className="h-auto p-0 text-xs" asChild>
              <Link href="/workflows/expenses?status=pending">View all</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Late Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.lateReceipts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unread Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{counts.unreadMessages}</div>
            <Button variant="link" className="h-auto p-0 text-xs" asChild>
              <Link href="/workflows/messages">View all</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Tables for admin/treasurer */}
      {isAdminOrTreasurer ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Recent Pending Invoices</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/workflows/invoices">View all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending invoices.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.supplierName}</TableCell>
                        <TableCell>{formatPence(inv.amountPence)}</TableCell>
                        <TableCell>{formatDate(inv.invoiceDate)}</TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(inv.status)}>
                            {inv.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Recent Pending Expenses</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/workflows/expenses">View all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending expenses.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentExpenses.map((exp) => (
                      <TableRow key={exp.id}>
                        <TableCell className="font-medium">
                          {exp.description}
                          {exp.receiptLate && (
                            <Badge variant="destructive" className="ml-2">
                              Late receipt
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{formatPence(exp.amountPence)}</TableCell>
                        <TableCell>{formatDate(exp.spendDate)}</TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(exp.status)}>
                            {exp.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>My Pending Invoices</CardTitle>
              <p className="text-sm text-muted-foreground">
                Invoices you have submitted awaiting approval.
              </p>
            </CardHeader>
            <CardContent>
              {recentInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending invoices.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.supplierName}</TableCell>
                        <TableCell>{formatPence(inv.amountPence)}</TableCell>
                        <TableCell>{formatDate(inv.invoiceDate)}</TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(inv.status)}>
                            {inv.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My Pending Expenses</CardTitle>
              <p className="text-sm text-muted-foreground">
                Expense requests you have submitted awaiting approval.
              </p>
            </CardHeader>
            <CardContent>
              {recentExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending expenses.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentExpenses.map((exp) => (
                      <TableRow key={exp.id}>
                        <TableCell className="font-medium">
                          {exp.description}
                          {exp.receiptLate && (
                            <Badge variant="destructive" className="ml-2">
                              Late receipt
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{formatPence(exp.amountPence)}</TableCell>
                        <TableCell>{formatDate(exp.spendDate)}</TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(exp.status)}>
                            {exp.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent conversations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Recent Conversations</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link href="/workflows/messages">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead>Unread</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversations.slice(0, 5).map((conv) => (
                  <TableRow key={conv.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/workflows/messages/${conv.id}`}
                        className="hover:underline"
                      >
                        {conv.subject || '(No subject)'}
                      </Link>
                    </TableCell>
                    <TableCell>{conv.creatorName ?? 'Unknown'}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {conv.lastMessagePreview ?? '—'}
                    </TableCell>
                    <TableCell>
                      {conv.unreadCount > 0 ? (
                        <Badge variant="secondary">{conv.unreadCount}</Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
