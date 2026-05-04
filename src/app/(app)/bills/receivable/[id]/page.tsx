import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MoneyAmount } from '@/components/money/money-amount';
import { markReceivableInvoiceSent } from '@/lib/invoices/actions';

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function ReceivableInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId, role } = await getActiveOrg();
  const canEdit = role === 'admin' || role === 'treasurer';
  const supabase = await createClient();

  const [{ data: invoice }, { data: lines }] = await Promise.all([
    supabase
      .from('receivable_invoices')
      .select('*, lettings_hirers(name, contact_name, email, phone, address)')
      .eq('organisation_id', orgId)
      .eq('id', id)
      .single(),
    supabase
      .from('receivable_invoice_lines')
      .select('id, description, amount_pence, accounts(code, name), funds(name)')
      .eq('invoice_id', id)
      .order('created_at'),
  ]);

  if (!invoice) notFound();
  const customer = Array.isArray(invoice.lettings_hirers)
    ? invoice.lettings_hirers[0]
    : invoice.lettings_hirers;
  async function sentAction() {
    'use server';
    await markReceivableInvoiceSent(id);
  }

  return (
    <PageShell className="max-w-6xl space-y-6">
      <PageHeader
        title={`Invoice ${invoice.invoice_number || invoice.id.slice(0, 8)}`}
        subtitle="Invoice owed to the church by a customer or hirer."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/bills">Back to Invoices</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/api/receivable-invoices/${id}/pdf`} target="_blank">Preview PDF</Link>
            </Button>
            <Button asChild>
              <Link href={`/api/receivable-invoices/${id}/pdf`} download>Download PDF</Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="rounded-3xl border-border/70 shadow-card">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Invoice details</CardTitle>
                <CardDescription>Receivable invoice record and delivery status.</CardDescription>
              </div>
              <Badge>{statusLabel(invoice.status)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Customer / Hirer</p>
              <p className="font-medium">{customer?.name ?? '—'}</p>
              {customer?.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
              {customer?.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Amount</p>
              <MoneyAmount amountPence={Number(invoice.total_pence ?? 0)} semantic="income" size="lg" />
              <p className="text-sm text-muted-foreground">
                Paid: <MoneyAmount amountPence={Number(invoice.paid_pence ?? 0)} semantic="income" size="sm" />
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Invoice date</p>
              <p>{formatDate(invoice.invoice_date)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Due date</p>
              <p>{formatDate(invoice.due_date)}</p>
            </div>
            {invoice.message && (
              <div className="sm:col-span-2">
                <p className="text-xs uppercase text-muted-foreground">Message</p>
                <p className="whitespace-pre-line text-sm">{invoice.message}</p>
              </div>
            )}
            {invoice.notes && (
              <div className="sm:col-span-2">
                <p className="text-xs uppercase text-muted-foreground">Internal notes</p>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{invoice.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 shadow-card">
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>Send status and document actions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {invoice.status === 'draft' && canEdit ? (
              <form action={sentAction}>
                <Button type="submit" className="w-full">Mark as sent</Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                {invoice.sent_at ? `Sent ${formatDate(String(invoice.sent_at).slice(0, 10))}` : 'No send action available.'}
              </p>
            )}
            <Button asChild variant="outline" className="w-full">
              <Link href={`/api/receivable-invoices/${id}/pdf`} target="_blank">Preview invoice PDF</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-3xl border-border/70 shadow-card">
        <CardHeader>
          <CardTitle>Income lines</CardTitle>
          <CardDescription>Income account and fund split for this receivable invoice.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lines ?? []).map((line) => {
                const account = Array.isArray(line.accounts) ? line.accounts[0] : line.accounts;
                const fund = Array.isArray(line.funds) ? line.funds[0] : line.funds;
                return (
                  <TableRow key={line.id}>
                    <TableCell>{line.description || 'Invoice line'}</TableCell>
                    <TableCell>{account ? `${account.code} - ${account.name}` : '—'}</TableCell>
                    <TableCell>{fund?.name ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <MoneyAmount amountPence={Number(line.amount_pence ?? 0)} semantic="income" size="sm" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
