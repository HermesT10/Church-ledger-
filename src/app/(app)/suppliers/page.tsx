import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import {
  Truck,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Plus,
} from 'lucide-react';
import { StatCard } from '@/components/stat-card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getSuppliersWithStats } from '@/lib/suppliers/actions';
import type { SupplierWithStats } from '@/lib/suppliers/types';

function penceToPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; active?: string }>;
}) {
  const { role } = await getActiveOrg();
  const params = await searchParams;
  const canEdit = role === 'admin' || role === 'treasurer';
  const activeOnly = params.active !== 'all';
  const outstandingOnly = params.filter === 'outstanding';

  const { data: allSuppliers, error } = await getSuppliersWithStats();

  let suppliers: SupplierWithStats[] = allSuppliers;

  if (activeOnly) {
    suppliers = suppliers.filter((s) => s.is_active);
  }
  if (outstandingOnly) {
    suppliers = suppliers.filter((s) => s.outstanding_pence > 0);
  }

  const totalCount = allSuppliers.length;
  const activeCount = allSuppliers.filter((s) => s.is_active).length;
  const totalOutstanding = allSuppliers.reduce((sum, s) => sum + s.outstanding_pence, 0);
  const totalPaidThisYear = allSuppliers.reduce((sum, s) => sum + s.paid_this_year_pence, 0);

  return (
    <PageShell>
      {/* Header */}
      <PageHeader
        title="Suppliers"
        subtitle="Manage your supplier directory, track outstanding payables, and view spending history."
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/suppliers/new">
                <Plus className="mr-2 h-4 w-4" />
                New Supplier
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
          title="Outstanding"
          value={penceToPounds(totalOutstanding)}
          subtitle="Unpaid bills"
          href="/suppliers?filter=outstanding"
          tint="amber"
          icon={<AlertCircle size={20} />}
        />
        <StatCard
          title="Paid This Year"
          value={penceToPounds(totalPaidThisYear)}
          subtitle={`${new Date().getFullYear()} payments`}
          href="/suppliers"
          tint="violet"
          icon={<DollarSign size={20} />}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/suppliers"
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !outstandingOnly && activeOnly
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          Active Only
        </Link>
        <Link
          href="/suppliers?active=all"
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !activeOnly && !outstandingOnly
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          All Suppliers
        </Link>
        <Link
          href="/suppliers?filter=outstanding"
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            outstandingOnly
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          Has Outstanding
        </Link>
      </div>

      {/* Error */}
      {error && <SoftAlert variant="error">{error}</SoftAlert>}

      {/* Table */}
      {suppliers.length > 0 ? (
        <Card className="border rounded-2xl shadow-sm bg-indigo-100/45 border-indigo-200/50">
          <CardHeader>
            <CardTitle>
              Suppliers ({suppliers.length})
            </CardTitle>
            <CardDescription>
              Click a supplier name to view details and invoices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Paid This Year</TableHead>
                    <TableHead className="text-center">Invoices</TableHead>
                    <TableHead>Status</TableHead>
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
                      <TableCell className="text-sm text-muted-foreground">
                        {s.contact_name ?? '—'}
                        {s.phone && (
                          <p className="text-xs mt-0.5">{s.phone}</p>
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${
                          s.outstanding_pence > 0 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'
                        }`}
                      >
                        {penceToPounds(s.outstanding_pence)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {penceToPounds(s.paid_this_year_pence)}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {s.invoice_count}
                      </TableCell>
                      <TableCell>
                        {s.is_active ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 text-xs">Archived</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border shadow-sm rounded-2xl bg-slate-100/55 border-slate-200/40">
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
