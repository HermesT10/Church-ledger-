import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import {
  DollarSign,
  FileText,
  AlertCircle,
  ArrowLeft,
  Pencil,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getSupplier, getSupplierInvoices, getMatchRules, getSupplierExpenses } from '@/lib/suppliers/actions';
import { BILL_STATUS_LABELS } from '@/lib/suppliers/types';
import { MatchRulesSection } from './match-rules-client';

function penceToPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function statusBadge(status: string) {
  switch (status) {
    case 'paid':
      return <Badge className="bg-green-100 text-green-800 border-green-200">Paid</Badge>;
    case 'posted':
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Posted</Badge>;
    case 'approved':
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Approved</Badge>;
    default:
      return <Badge variant="outline">{BILL_STATUS_LABELS[status] ?? status}</Badge>;
  }
}

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { role } = await getActiveOrg();
  const canEdit = role === 'admin' || role === 'treasurer';

  const [supplierRes, invoicesRes, matchRulesRes, expensesRes] = await Promise.all([
    getSupplier(id),
    getSupplierInvoices(id),
    getMatchRules(id),
    getSupplierExpenses(id),
  ]);

  if (!supplierRes.data) {
    notFound();
  }

  const supplier = supplierRes.data;
  const invoices = invoicesRes.data;
  const matchRules = matchRulesRes.data;
  const { allocations: taggedAllocations, journalLines: taggedJournalLines } = expensesRes;

  // Fetch default account/fund names
  const supabase = await createClient();
  let defaultAccountName: string | null = null;
  let defaultFundName: string | null = null;

  if (supplier.default_account_id) {
    const { data } = await supabase
      .from('accounts')
      .select('name')
      .eq('id', supplier.default_account_id)
      .single();
    defaultAccountName = data?.name ?? null;
  }

  if (supplier.default_fund_id) {
    const { data } = await supabase
      .from('funds')
      .select('name')
      .eq('id', supplier.default_fund_id)
      .single();
    defaultFundName = data?.name ?? null;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-8">
      {/* Back + header */}
      <div className="space-y-2">
        <Link
          href="/suppliers"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Suppliers
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{supplier.name}</h1>
            {!supplier.is_active && (
              <Badge className="bg-gray-100 text-gray-600 border-gray-200">Archived</Badge>
            )}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href={`/suppliers/${id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/bills/new?supplier=${id}`}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Bill
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 p-5 text-white shadow-lg ring-1 ring-white/20">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium opacity-80">Outstanding</p>
            <AlertCircle className="h-5 w-5 opacity-60" />
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {penceToPounds(supplier.outstanding_pence)}
          </p>
          <p className="mt-1 text-xs opacity-70">Unpaid bills</p>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-5 text-white shadow-lg ring-1 ring-white/20">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium opacity-80">Paid This Year</p>
            <DollarSign className="h-5 w-5 opacity-60" />
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {penceToPounds(supplier.paid_this_year_pence)}
          </p>
          <p className="mt-1 text-xs opacity-70">{new Date().getFullYear()} payments</p>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 p-5 text-white shadow-lg ring-1 ring-white/20">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium opacity-80">Total Invoices</p>
            <FileText className="h-5 w-5 opacity-60" />
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {supplier.invoice_count}
          </p>
          <p className="mt-1 text-xs opacity-70">All time</p>
        </div>
      </div>

      {/* Contact & Defaults Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border shadow-sm rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-[100px_1fr] gap-1">
              <span className="text-muted-foreground">Contact</span>
              <span>{supplier.contact_name || '—'}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-1">
              <span className="text-muted-foreground">Email</span>
              <span>
                {supplier.email ? (
                  <a href={`mailto:${supplier.email}`} className="text-blue-600 hover:underline">
                    {supplier.email}
                  </a>
                ) : '—'}
              </span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-1">
              <span className="text-muted-foreground">Phone</span>
              <span>{supplier.phone || '—'}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-1">
              <span className="text-muted-foreground">Address</span>
              <span className="whitespace-pre-line">{supplier.address || '—'}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-1">
              <span className="text-muted-foreground">Bank</span>
              <span>{supplier.bank_details || '—'}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Default Settings</CardTitle>
            <CardDescription>
              Used to auto-fill when creating bills for this supplier.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-[120px_1fr] gap-1">
              <span className="text-muted-foreground">Account</span>
              <span>{defaultAccountName ?? '—'}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-1">
              <span className="text-muted-foreground">Fund</span>
              <span>{defaultFundName ?? '—'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Match Rules */}
      <Card className="border shadow-sm rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Auto-Suggest Match Rules</CardTitle>
          <CardDescription>
            Automatically suggest this supplier when a bank line description matches one of these patterns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MatchRulesSection
            supplierId={id}
            rules={matchRules}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card className="border shadow-sm rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Invoices ({invoices.length})</CardTitle>
              <CardDescription>All bills for this supplier.</CardDescription>
            </div>
            {canEdit && (
              <Button asChild size="sm">
                <Link href={`/bills/new?supplier=${id}`}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  New Bill
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">
                        {inv.bill_number || inv.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(inv.bill_date)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {inv.due_date ? formatDate(inv.due_date) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {penceToPounds(inv.total_pence)}
                      </TableCell>
                      <TableCell>{statusBadge(inv.status)}</TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/bills/${inv.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="mx-auto h-8 w-8 opacity-40 mb-2" />
              <p>No invoices yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tagged Expenses (Bank Allocations + Journal Lines) */}
      {(taggedAllocations.length > 0 || taggedJournalLines.length > 0) && (
        <Card className="border shadow-sm rounded-2xl">
          <CardHeader>
            <CardTitle>Tagged Expenses ({taggedAllocations.length + taggedJournalLines.length})</CardTitle>
            <CardDescription>
              Bank allocations and journal entries tagged to this supplier (not including bills above).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Bank Allocations */}
            {taggedAllocations.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Bank Allocations ({taggedAllocations.length})</h4>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Fund</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {taggedAllocations.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="whitespace-nowrap text-sm font-mono">
                            {a.txn_date ? formatDate(a.txn_date) : '—'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">
                            {a.description || '—'}
                          </TableCell>
                          <TableCell className="text-sm">{a.account_name}</TableCell>
                          <TableCell className="text-sm">{a.fund_name}</TableCell>
                          <TableCell className={`text-right font-mono text-sm ${a.amount_pence < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {a.amount_pence < 0 ? '-' : ''}£{(Math.abs(a.amount_pence) / 100).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Journal Lines */}
            {taggedJournalLines.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Journal Entries ({taggedJournalLines.length})</h4>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Fund</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {taggedJournalLines.map((jl) => (
                        <TableRow key={jl.id}>
                          <TableCell className="whitespace-nowrap text-sm font-mono">
                            {jl.journal_date ? formatDate(jl.journal_date) : '—'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">
                            {jl.description || '—'}
                          </TableCell>
                          <TableCell className="text-sm">{jl.account_name}</TableCell>
                          <TableCell className="text-sm">{jl.fund_name}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {jl.debit_pence > 0 ? `£${(jl.debit_pence / 100).toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {jl.credit_pence > 0 ? `£${(jl.credit_pence / 100).toFixed(2)}` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
