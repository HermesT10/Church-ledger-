import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { listBudgets } from '@/lib/budgets/actions';
import { BarChart3, Pencil, CheckCircle, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/stat-card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { WorkspaceEmptyState } from '@/components/workspace-empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CreateBudgetForm } from './create-budget-form';

const STATUS_BADGE_COLORS: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  archived: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default async function BudgetsPage() {
  const { orgId, role } = await getActiveOrg();
  const { data: budgets } = await listBudgets(orgId);
  const allBudgets = budgets ?? [];

  const canEdit = role === 'admin' || role === 'treasurer';

  const totalCount = allBudgets.length;
  const draftCount = allBudgets.filter((b) => b.status === 'draft').length;
  const activeCount = allBudgets.filter((b) => b.status === 'approved').length;
  const archivedCount = allBudgets.filter((b) => b.status === 'archived').length;

  return (
    <PageShell>
      {/* Header */}
      <PageHeader
        title="Budgets"
        subtitle="Create and manage annual budgets for income and expense accounts."
        actions={canEdit ? <CreateBudgetForm orgId={orgId} /> : undefined}
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Budgets"
          value={totalCount}
          subtitle="All years"
          href="/budgets"
          tint="rose"
          icon={<BarChart3 size={20} />}
        />
        <StatCard
          title="Draft"
          value={draftCount}
          subtitle="In preparation"
          href="/budgets"
          tint="amber"
          icon={<Pencil size={20} />}
        />
        <StatCard
          title="Approved"
          value={activeCount}
          subtitle="Current budgets"
          href="/budgets"
          tint="emerald"
          icon={<CheckCircle size={20} />}
        />
        <StatCard
          title="Archived"
          value={archivedCount}
          subtitle="Previous years"
          href="/budgets"
          tint="slate"
          icon={<Archive size={20} />}
        />
      </div>

      {/* Table */}
      {allBudgets.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/40 bg-white/70 shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allBudgets.map((budget) => (
                <TableRow key={budget.id}>
                  <TableCell className="font-medium">{budget.year}</TableCell>
                  <TableCell>{budget.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={budget.status} className={STATUS_BADGE_COLORS[budget.status] ?? ''} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(budget.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/budgets/${budget.id}`}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <WorkspaceEmptyState
          icon={<BarChart3 className="h-10 w-10" />}
          title="No budgets yet"
          description={
            canEdit
              ? 'Create your first annual budget so finance users and trustees can compare actuals against plan.'
              : 'Budgets will appear here once an admin or treasurer creates them.'
          }
          action={canEdit ? <CreateBudgetForm orgId={orgId} /> : undefined}
        />
      )}
    </PageShell>
  );
}
