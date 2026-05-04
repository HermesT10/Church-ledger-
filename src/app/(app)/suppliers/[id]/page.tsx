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
  ShieldCheck,
  ScrollText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MoneyAmount } from '@/components/money/money-amount';
import { formatMoney } from '@/lib/money/format-money';
import { getSupplier, getSupplierInvoices, getMatchRules, getSupplierExpenses } from '@/lib/suppliers/actions';
import { BILL_STATUS_LABELS } from '@/lib/suppliers/types';
import { MatchRulesSection } from './match-rules-client';

const SUPPLIER_TABS = ['overview', 'bills', 'payments', 'rules', 'documents', 'audit'] as const;
type SupplierTab = (typeof SUPPLIER_TABS)[number];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function parseTab(tab: string | undefined): SupplierTab {
  if (tab && (SUPPLIER_TABS as readonly string[]).includes(tab)) {
    return tab as SupplierTab;
  }
  return 'overview';
}

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const activeTab = parseTab(query?.tab);
  const { orgId, role } = await getActiveOrg();
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

  const supabase = await createClient();
  const [defaultAccountRes, defaultFundRes, auditRes] = await Promise.all([
    supplier.default_account_id
      ? supabase
          .from('accounts')
          .select('name')
          .eq('id', supplier.default_account_id)
          .single()
      : Promise.resolve({ data: null }),
    supplier.default_fund_id
      ? supabase.from('funds').select('name').eq('id', supplier.default_fund_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('audit_log')
      .select('id, action, entity_type, entity_id, user_id, metadata, created_at')
      .eq('organisation_id', orgId)
      .order('created_at', { ascending: false })
      .limit(320),
  ]);

  const defaultAccountName = defaultAccountRes.data?.name ?? null;
  const defaultFundName = defaultFundRes.data?.name ?? null;

  const billIdSet = new Set(invoices.map((inv) => inv.id));
  const supplierAuditEvents = (auditRes.data ?? []).filter((event) => {
    if (event.entity_id === id) return true;
    if (event.entity_type === 'bill' && event.entity_id && billIdSet.has(event.entity_id as string)) {
      return true;
    }
    const meta = (event.metadata ?? {}) as Record<string, unknown>;
    if (meta.supplier_id === id || meta.supplierId === id) return true;
    return false;
  }).slice(0, 80);

  const subtitleParts = [
    !supplier.is_active ? 'Archived' : null,
    supplier.contact_name,
    supplier.email,
  ].filter(Boolean);
  const headerSubtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : 'Supplier record';

  const tabHref = (tab: SupplierTab) =>
    tab === 'overview' ? `/suppliers/${id}` : `/suppliers/${id}?tab=${tab}`;

  return (
    <PageShell>
      <div>
        <Link
          href="/suppliers"
          className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Suppliers
        </Link>
      </div>

      <PageHeader
        title={supplier.name}
        subtitle={headerSubtitle}
        actions={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
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
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          title="Outstanding"
          value={formatMoney(supplier.outstanding_pence)}
          subtitle="Unpaid bills"
          href={tabHref('bills')}
          tint="amber"
          icon={<AlertCircle size={20} />}
        />
        <StatCard
          title="Paid This Year"
          value={formatMoney(supplier.paid_this_year_pence)}
          subtitle={`${new Date().getFullYear()} payments`}
          href={tabHref('payments')}
          tint="emerald"
          icon={<DollarSign size={20} />}
        />
        <StatCard
          title="Total Invoices"
          value={supplier.invoice_count}
          subtitle="All time"
          href={tabHref('bills')}
          tint="indigo"
          icon={<FileText size={20} />}
        />
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-card p-2 shadow-card">
        {(
          [
            ['overview', 'Overview'],
            ['bills', 'Bills'],
            ['payments', 'Payments'],
            ['rules', 'Bank Rules / Aliases'],
            ['documents', 'Documents'],
            ['audit', 'Audit History'],
          ] as const
        ).map(([value, label]) => (
          <Button key={value} asChild size="sm" variant={activeTab === value ? 'default' : 'ghost'}>
            <Link href={tabHref(value)} scroll={false}>
              {label}
            </Link>
          </Button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="rounded-2xl border border-border/70 shadow-card">
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
                    <a
                      href={`mailto:${supplier.email}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {supplier.email}
                    </a>
                  ) : (
                    '—'
                  )}
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

          <Card className="rounded-2xl border border-border/70 shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Default Settings</CardTitle>
              <CardDescription>Used to auto-fill when creating bills for this supplier.</CardDescription>
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
      )}

      {activeTab === 'bills' && (
        <Card className="rounded-2xl border border-border/70 shadow-card">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Bills ({invoices.length})</CardTitle>
                <CardDescription>Bills to pay from this supplier.</CardDescription>
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
              <div className="overflow-x-auto rounded-xl border border-border/60">
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
                        <TableCell className="whitespace-nowrap text-sm">{formatDate(inv.bill_date)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {inv.due_date ? formatDate(inv.due_date) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatMoney(inv.total_pence)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={inv.status}
                            label={BILL_STATUS_LABELS[inv.status] ?? inv.status}
                          />
                        </TableCell>
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
              <div className="rounded-xl border border-dashed border-border/70 py-10 text-center text-muted-foreground">
                <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm">No invoices yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'payments' && (
        <Card className="rounded-2xl border border-border/70 shadow-card">
          <CardHeader>
            <CardTitle>Payments &amp; tagged activity</CardTitle>
            <CardDescription>
              Bank allocations and journal lines tagged to this supplier (excluding bills listed under Bills).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {taggedAllocations.length === 0 && taggedJournalLines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 py-10 text-center text-muted-foreground">
                <DollarSign className="mx-auto mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm">No tagged bank allocations or journal entries for this supplier.</p>
              </div>
            ) : (
              <>
                {taggedAllocations.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">Bank allocations ({taggedAllocations.length})</h4>
                    <div className="overflow-x-auto rounded-xl border border-border/60">
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
                              <TableCell className="whitespace-nowrap font-mono text-sm">
                                {a.txn_date ? formatDate(a.txn_date) : '—'}
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate text-sm">
                                {a.description || '—'}
                              </TableCell>
                              <TableCell className="text-sm">{a.account_name}</TableCell>
                              <TableCell className="text-sm">{a.fund_name}</TableCell>
                              <TableCell className="text-right font-mono text-sm tabular-nums">
                                <MoneyAmount amountPence={a.amount_pence} showSign size="sm" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {taggedJournalLines.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">Journal entries ({taggedJournalLines.length})</h4>
                    <div className="overflow-x-auto rounded-xl border border-border/60">
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
                              <TableCell className="whitespace-nowrap font-mono text-sm">
                                {jl.journal_date ? formatDate(jl.journal_date) : '—'}
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate text-sm">
                                {jl.description || '—'}
                              </TableCell>
                              <TableCell className="text-sm">{jl.account_name}</TableCell>
                              <TableCell className="text-sm">{jl.fund_name}</TableCell>
                              <TableCell className="text-right font-mono text-sm tabular-nums">
                                {jl.debit_pence > 0 ? formatMoney(jl.debit_pence) : '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm tabular-nums">
                                {jl.credit_pence > 0 ? formatMoney(jl.credit_pence) : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'rules' && (
        <Card className="rounded-2xl border border-border/70 shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Auto-suggest match rules</CardTitle>
            <CardDescription>
              Suggest this supplier when a bank line description matches one of these patterns.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MatchRulesSection supplierId={id} rules={matchRules} canEdit={canEdit} />
          </CardContent>
        </Card>
      )}

      {activeTab === 'documents' && (
        <Card className="rounded-2xl border border-border/70 shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
            <CardDescription>Evidence and files linked to this supplier.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-dashed border-border/70 py-10 text-center text-muted-foreground">
              <ScrollText className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">Supplier-level document storage is not available here yet.</p>
              <p className="mt-2 text-xs">Attachments on individual bills remain on each bill record.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'audit' && (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
          {supplierAuditEvents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierAuditEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(event.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">{event.action.replaceAll('_', ' ')}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {event.entity_type ?? '—'}
                      {event.entity_id ? (
                        <span className="ml-1 font-mono text-xs">· {String(event.entity_id).slice(0, 8)}…</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {event.user_id ? String(event.user_id).slice(0, 8) + '…' : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-10 text-center">
              <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">No audit events matched this supplier yet.</p>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
