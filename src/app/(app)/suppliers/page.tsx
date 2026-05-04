import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import {
  Truck,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Plus,
  Upload,
  Download,
  Search,
} from 'lucide-react';
import { StatCard } from '@/components/stat-card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { FilterBar, FilterBarLabel } from '@/components/ui/filter-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getSuppliersWithStats } from '@/lib/suppliers/actions';
import type { SupplierWithStats } from '@/lib/suppliers/types';
import { MoneyAmount } from '@/components/money/money-amount';
import { formatMoney } from '@/lib/money/format-money';
import { createClient } from '@/lib/supabase/server';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; active?: string; q?: string; sort?: string }>;
}) {
  const { role, orgId } = await getActiveOrg();
  const params = await searchParams;
  const canEdit = role === 'admin' || role === 'treasurer';
  const activeOnly = params.active !== 'all';
  const outstandingOnly = params.filter === 'outstanding';
  const archivedOnly = params.filter === 'archived';
  const highSpendOnly = params.filter === 'high-spend';
  const query = (params.q ?? '').trim().toLowerCase();
  const sort = params.sort ?? 'name';

  const { data: allSuppliers, error } = await getSuppliersWithStats();

  let suppliers: SupplierWithStats[] = allSuppliers;

  if (activeOnly) {
    suppliers = suppliers.filter((s) => s.is_active);
  }
  if (archivedOnly) {
    suppliers = allSuppliers.filter((s) => !s.is_active);
  }
  if (outstandingOnly) {
    suppliers = suppliers.filter((s) => s.outstanding_pence > 0);
  }
  if (highSpendOnly) {
    suppliers = suppliers.filter((s) => s.paid_this_year_pence > 0).slice(0, 20);
  }
  if (query) {
    suppliers = suppliers.filter((s) =>
      [s.name, s.email, s.contact_name, s.phone].some((value) => value?.toLowerCase().includes(query)),
    );
  }
  suppliers = [...suppliers].sort((a, b) => {
    if (sort === 'spend') return b.paid_this_year_pence - a.paid_this_year_pence;
    if (sort === 'outstanding') return b.outstanding_pence - a.outstanding_pence;
    if (sort === 'last-payment') return String(b.last_payment_date ?? '').localeCompare(String(a.last_payment_date ?? ''));
    return a.name.localeCompare(b.name);
  });

  const totalCount = allSuppliers.length;
  const activeCount = allSuppliers.filter((s) => s.is_active).length;
  const totalOutstanding = allSuppliers.reduce((sum, s) => sum + s.outstanding_pence, 0);
  const totalPaidThisYear = allSuppliers.reduce((sum, s) => sum + s.paid_this_year_pence, 0);
  const overdueBills = allSuppliers.reduce((sum, s) => sum + (s.overdue_count ?? 0), 0);

  const defaultAccountIds = [...new Set(allSuppliers.map((s) => s.default_account_id).filter(Boolean))] as string[];
  const defaultFundIds = [...new Set(allSuppliers.map((s) => s.default_fund_id).filter(Boolean))] as string[];
  const supabase = await createClient();
  const [{ data: defaultAccounts }, { data: defaultFunds }] = await Promise.all([
    defaultAccountIds.length
      ? supabase.from('accounts').select('id, code, name').eq('organisation_id', orgId).in('id', defaultAccountIds)
      : Promise.resolve({ data: [] }),
    defaultFundIds.length
      ? supabase.from('funds').select('id, name').eq('organisation_id', orgId).in('id', defaultFundIds)
      : Promise.resolve({ data: [] }),
  ]);
  const accountName = new Map((defaultAccounts ?? []).map((a) => [a.id as string, `${a.code} - ${a.name}`]));
  const fundName = new Map((defaultFunds ?? []).map((f) => [f.id as string, f.name as string]));

  return (
    <PageShell>
      {/* Header */}
      <PageHeader
        title="Suppliers"
        subtitle="Manage organisations and people the church pays."
        actions={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/suppliers/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Supplier
                </Link>
              </Button>
              <Button variant="outline" disabled>
                <Upload className="mr-2 h-4 w-4" />
                Import Suppliers
              </Button>
              <Button variant="outline" disabled>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total Suppliers"
          value={totalCount}
          subtitle="In directory"
          href="/suppliers"
          tint="indigo"
          icon={<Truck size={20} />}
        />
        <StatCard
          title="Active"
          value={activeCount}
          subtitle="Currently active"
          href="/suppliers?active=all"
          tint="emerald"
          icon={<CheckCircle2 size={20} />}
        />
        <StatCard
          title="Spend This Year"
          value={formatMoney(totalPaidThisYear)}
          subtitle={`${new Date().getFullYear()} supplier spend`}
          href="/suppliers?sort=spend"
          tint="violet"
          icon={<DollarSign size={20} />}
        />
        <StatCard
          title="Outstanding Bills"
          value={formatMoney(totalOutstanding)}
          subtitle="Unpaid bills"
          href="/suppliers?filter=outstanding"
          tint="amber"
          icon={<AlertCircle size={20} />}
        />
        <StatCard
          title="Overdue Bills"
          value={overdueBills}
          subtitle="Past due date"
          href="/suppliers?filter=outstanding&sort=outstanding"
          tint="red"
          icon={<AlertCircle size={20} />}
        />
      </div>

      {/* Filters */}
      <FilterBar>
        <FilterBarLabel>Filter</FilterBarLabel>
        <Button asChild size="sm" variant={!outstandingOnly && activeOnly ? 'default' : 'outline'}>
          <Link href="/suppliers">Active Only</Link>
        </Button>
        <Button asChild size="sm" variant={!activeOnly && !outstandingOnly ? 'default' : 'outline'}>
          <Link href="/suppliers?active=all">All Suppliers</Link>
        </Button>
        <Button asChild size="sm" variant={outstandingOnly ? 'default' : 'outline'}>
          <Link href="/suppliers?filter=outstanding">Has Outstanding</Link>
        </Button>
        <Button asChild size="sm" variant={archivedOnly ? 'default' : 'outline'}>
          <Link href="/suppliers?active=all&filter=archived">Archived</Link>
        </Button>
        <Button asChild size="sm" variant={highSpendOnly ? 'default' : 'outline'}>
          <Link href="/suppliers?filter=high-spend&sort=spend">High Spend</Link>
        </Button>
      </FilterBar>

      <form className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-card sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Search suppliers by name, contact, email or phone"
            className="h-10 w-full rounded-xl border border-input bg-transparent pl-9 pr-3 text-sm"
          />
        </div>
        <select name="sort" defaultValue={sort} className="h-10 rounded-xl border border-input bg-transparent px-3 text-sm">
          <option value="name">Sort by name</option>
          <option value="spend">Sort by spend</option>
          <option value="outstanding">Sort by outstanding</option>
          <option value="last-payment">Sort by last payment</option>
        </select>
        <Button type="submit" variant="outline">Apply</Button>
      </form>

      {/* Error */}
      {error && <SoftAlert variant="error">{error}</SoftAlert>}

      {/* Table */}
      {suppliers.length > 0 ? (
        <Card className="gap-0 overflow-hidden rounded-3xl border-border/70 bg-card shadow-card">
          <CardHeader className="border-b border-border/60 px-5 pb-4 pt-5">
            <CardTitle className="text-base font-semibold">
              Suppliers ({suppliers.length})
            </CardTitle>
            <CardDescription>
              Click a supplier name to view details and invoices.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/35 hover:bg-muted/35">
                    <TableHead>Supplier Name</TableHead>
                    <TableHead>Default Account</TableHead>
                    <TableHead>Default Fund</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Spend YTD</TableHead>
                    <TableHead>Last Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link
                          href={`/suppliers/${s.id}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {s.name}
                        </Link>
                        {s.email && (
                          <p className="text-xs text-muted-foreground mt-0.5">{s.email}</p>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[12rem] text-sm text-muted-foreground">
                        {s.default_account_id ? accountName.get(s.default_account_id) ?? '—' : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.default_fund_id ? fundName.get(s.default_fund_id) ?? '—' : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyAmount amountPence={s.outstanding_pence} semantic="expense" size="sm" />
                        {(s.overdue_count ?? 0) > 0 && <p className="text-xs text-danger">{s.overdue_count} overdue</p>}
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyAmount amountPence={s.paid_this_year_pence} semantic="expense" size="sm" />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(s.last_payment_date)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={s.is_active ? 'active' : 'inactive'} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/suppliers/${s.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-3xl border-border/70 bg-card shadow-card">
          <CardContent className="py-12 text-center space-y-3">
            <Truck className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              No suppliers found.
            </p>
            {canEdit && (
              <Button asChild variant="outline">
                <Link href="/suppliers/new">Add Your First Supplier</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
