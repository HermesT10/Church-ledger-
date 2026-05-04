import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import {
  getPayrollByFundMinistry,
  getPayrollEmployerCosts,
  getPayrollLiabilities,
  getPayrollLiabilityReport,
  getPayrollOverview,
  getPayrollPensionReport,
  getPayrollVsBudget,
  listPayrollRuns,
} from '@/lib/payroll/actions';
import {
  AlertCircle,
  Banknote,
  BarChart3,
  FileInput,
  FileText,
  Landmark,
  PiggyBank,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  reviewed: 'Reviewed',
  approved: 'Approved',
  posted: 'Posted',
  paid: 'Paid',
  reconciled: 'Reconciled',
  reversed: 'Reversed',
  archived: 'Archived',
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 border-amber-200',
  reviewed: 'bg-violet-100 text-violet-800 border-violet-200',
  approved: 'bg-blue-100 text-blue-800 border-blue-200',
  posted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  paid: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  reconciled: 'bg-slate-100 text-slate-800 border-slate-200',
  reversed: 'bg-rose-100 text-rose-800 border-rose-200',
  archived: 'bg-slate-100 text-slate-600 border-slate-200',
};

const PAYROLL_TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'runs', label: 'Payroll Runs', icon: FileText },
  { id: 'employees', label: 'Employees', icon: Users },
  { id: 'employer-costs', label: 'Employer Costs', icon: Banknote },
  { id: 'pension', label: 'Pension', icon: PiggyBank },
  { id: 'liabilities', label: 'Liabilities', icon: Landmark },
  { id: 'imports', label: 'Imports', icon: FileInput },
  { id: 'reports', label: 'Reports', icon: ShieldCheck },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function formatPounds(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tab?: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const params = await searchParams;
  const canEdit = role === 'admin' || role === 'treasurer';
  const activeTab = PAYROLL_TABS.some((tab) => tab.id === params.tab)
    ? params.tab
    : 'overview';

  const [
    allRuns,
    liabilitiesRes,
    overviewRes,
    employerCostsRes,
    pensionRes,
    liabilityReportRes,
    fundMinistryRes,
    budgetRes,
  ] = await Promise.all([
    listPayrollRuns(orgId),
    getPayrollLiabilities(),
    getPayrollOverview(),
    getPayrollEmployerCosts(),
    getPayrollPensionReport(),
    getPayrollLiabilityReport(),
    getPayrollByFundMinistry(),
    getPayrollVsBudget(),
  ]);

  const liabilities = liabilitiesRes.data;
  const overview = overviewRes.data;
  const employerCosts = employerCostsRes.data ?? [];
  const pensionRows = pensionRes.data ?? [];
  const liabilityRows = liabilityReportRes.data ?? [];
  const fundMinistryRows = fundMinistryRes.data ?? [];
  const budgetRows = budgetRes.data ?? [];

  const statusFilter = params.status;
  const filteredRuns =
    statusFilter && statusFilter !== 'all'
      ? allRuns.filter((r) => r.status === statusFilter)
      : allRuns;

  const totalCount = allRuns.length;
  const draftCount = allRuns.filter((r) => r.status === 'draft').length;
  const reviewedCount = allRuns.filter((r) => r.status === 'reviewed').length;
  const approvedCount = allRuns.filter((r) => r.status === 'approved').length;
  const postedCount = allRuns.filter((r) => r.status === 'posted').length;
  const outstandingLiabilities =
    (liabilities?.payeNicOwed ?? 0) +
    (liabilities?.pensionOwed ?? 0) +
    (liabilities?.netPayOwed ?? 0);

  return (
    <PageShell>
      <PageHeader
        title="Payroll"
        subtitle="Treasurer-grade payroll accounting, employer costs, liabilities, pensions, imports, and controls."
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/payroll/new">New Payroll Run</Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Current Payroll Run"
          value={overview?.currentRun ? formatMonth(overview.currentRun.payrollMonth) : 'None'}
          subtitle={
            overview?.currentRun
              ? STATUS_LABELS[overview.currentRun.status] ?? overview.currentRun.status
              : 'No current run'
          }
          href={overview?.currentRun ? `/payroll/${overview.currentRun.id}` : '/payroll/new'}
          tint="violet"
          icon={<FileText size={20} />}
        />
        <StatCard
          title="Employer Cost"
          value={formatPounds(overview?.totalEmployerCostThisMonth ?? 0)}
          subtitle="Current run total cost"
          href="/payroll?tab=employer-costs"
          tint="amber"
          icon={<Banknote size={20} />}
        />
        <StatCard
          title="Liabilities"
          value={formatPounds(outstandingLiabilities)}
          subtitle="PAYE/NIC, pension, net wages"
          href="/payroll?tab=liabilities"
          tint="blue"
          icon={<Landmark size={20} />}
        />
        <StatCard
          title="Pension Payable"
          value={formatPounds(overview?.pensionPayable ?? 0)}
          subtitle="Outstanding provider liability"
          href="/payroll?tab=pension"
          tint="emerald"
          icon={<PiggyBank size={20} />}
        />
        <StatCard
          title="Payroll Vs Budget"
          value={formatPounds(overview?.payrollVsBudget.actualPence ?? 0)}
          subtitle="Budget comparison ready"
          href="/payroll?tab=reports"
          tint="slate"
          icon={<BarChart3 size={20} />}
        />
      </div>

      {liabilities &&
        (liabilities.payeNicOwed > 0 ||
          liabilities.pensionOwed > 0 ||
          liabilities.netPayOwed > 0) && (
          <SoftAlert variant="warning" icon={<AlertCircle size={16} />}>
            <p className="font-medium">Outstanding Payroll Liabilities</p>
            <div className="grid grid-cols-3 gap-4 text-sm mt-2">
              <div>
                <span className="text-muted-foreground">PAYE/NIC Owed</span>
                <p className="font-medium">{formatPounds(liabilities.payeNicOwed)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Pension Owed</span>
                <p className="font-medium">{formatPounds(liabilities.pensionOwed)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Net Pay Owed</span>
                <p className="font-medium">{formatPounds(liabilities.netPayOwed)}</p>
              </div>
            </div>
          </SoftAlert>
        )}

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/70 p-2 shadow-sm">
        {PAYROLL_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <Button key={tab.id} asChild variant={active ? 'default' : 'ghost'} size="sm" className="shrink-0">
              <Link href={`/payroll?tab=${tab.id}`}>
                <Icon className="mr-2 h-4 w-4" />
                {tab.label}
              </Link>
            </Button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Payroll Control Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-5">
              {[
                ['Total runs', totalCount],
                ['Draft', draftCount],
                ['Reviewed', reviewedCount],
                ['Approved', approvedCount],
                ['Posted', postedCount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Required Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Runs move through draft, review, approval, posting, paid, and reconciliation states.</p>
              <p>Posted payroll is corrected by reversal rather than editing historical records.</p>
              <p>Net wages, HMRC, and pension provider payments are tracked as payroll liabilities.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'runs' && (
        <>
          <div className="flex gap-2 flex-wrap">
            <Button asChild variant={!statusFilter || statusFilter === 'all' ? 'default' : 'outline'} size="sm">
              <Link href="/payroll?tab=runs">All</Link>
            </Button>
            {['draft', 'reviewed', 'approved', 'posted', 'paid', 'reconciled'].map((s) => (
              <Button key={s} asChild variant={statusFilter === s ? 'default' : 'outline'} size="sm">
                <Link href={`/payroll?tab=runs&status=${s}`}>{STATUS_LABELS[s]}</Link>
              </Button>
            ))}
          </div>

          {filteredRuns.length > 0 ? (
            <div className="rounded-2xl border border-slate-200/40 bg-white/70 shadow-sm overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">PAYE</TableHead>
                    <TableHead className="text-right">NIC</TableHead>
                    <TableHead className="text-right">Pension</TableHead>
                    <TableHead className="text-right">Employer Cost</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRuns.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/payroll/${r.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                          {formatMonth(r.payrollMonth)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatPounds(r.totalGrossPence)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatPounds(r.totalNetPence)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatPounds(r.totalPayePence)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatPounds(r.totalEmployerNicPence ?? r.totalNicPence)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatPounds(r.totalEmployerPensionPence ?? r.totalPensionPence)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatPounds(r.totalEmployerCostPence ?? r.totalGrossPence + r.totalNicPence + r.totalPensionPence)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${STATUS_BADGE_COLORS[r.status] ?? ''}`}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/40 bg-slate-100/55 p-8 text-center shadow-sm">
              <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                No payroll runs found. {canEdit && 'Create one to generate payroll journal entries.'}
              </p>
              {canEdit && (
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/payroll/new">Create Payroll Run</Link>
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'employees' && (
        <Card>
          <CardHeader>
            <CardTitle>Employees</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>Employee payroll records now support ministry, start/end dates, payroll status, pension participation, and default allocations.</p>
            <Button asChild variant="outline">
              <Link href="/employees">Manage Employees</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === 'employer-costs' && (
        <PayrollSimpleTable
          headers={['Period', 'Gross', 'Employer NIC', 'Employer Pension', 'Total Cost']}
          rows={employerCosts.map((row) => [
            formatMonth(row.payrollMonth),
            formatPounds(row.grossPence),
            formatPounds(row.employerNicPence),
            formatPounds(row.employerPensionPence),
            formatPounds(row.totalEmployerCostPence),
          ])}
        />
      )}

      {activeTab === 'pension' && (
        <PayrollSimpleTable
          headers={['Period', 'Employee Pension', 'Employer Pension', 'Pension Payable']}
          rows={pensionRows.map((row) => [
            formatMonth(row.payrollMonth),
            formatPounds(row.employeePensionPence),
            formatPounds(row.employerPensionPence),
            formatPounds(row.pensionPayablePence),
          ])}
        />
      )}

      {activeTab === 'liabilities' && (
        <PayrollSimpleTable
          headers={['Type', 'Amount', 'Status', 'Payment Date', 'Reference']}
          rows={liabilityRows.map((row) => [
            row.liabilityType.replace('_', ' ').toUpperCase(),
            formatPounds(row.amountPence),
            row.status,
            row.paymentDate ?? 'Not set',
            row.paymentReference ?? 'Not set',
          ])}
        />
      )}

      {activeTab === 'imports' && (
        <Card>
          <CardHeader>
            <CardTitle>Payroll Provider Imports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>CSV/XLSX import services now support preview, validation, duplicate employee checks, raw row retention, and commit into draft payroll lines.</p>
            <p>Mapping covers employee, gross, net, PAYE, NIC, pension, employer costs, fund/account allocation, ministry, and notes.</p>
          </CardContent>
        </Card>
      )}

      {activeTab === 'reports' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <PayrollSimpleTable
            headers={['Fund/Ministry', 'Gross', 'Employer NIC', 'Employer Pension', 'Total Cost']}
            rows={fundMinistryRows.map((row) => [
              row.departmentMinistry ?? row.fundId ?? 'Unallocated',
              formatPounds(row.grossPence),
              formatPounds(row.employerNicPence),
              formatPounds(row.employerPensionPence),
              formatPounds(row.totalEmployerCostPence),
            ])}
          />
          <PayrollSimpleTable
            headers={['Budget Area', 'Actual', 'Budget', 'Variance']}
            rows={budgetRows.map((row) => [
              row.label,
              formatPounds(row.actualPence),
              formatPounds(row.budgetPence),
              formatPounds(row.variancePence),
            ])}
          />
        </div>
      )}

      {activeTab === 'settings' && (
        <Card>
          <CardHeader>
            <CardTitle>Payroll Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Payroll settings support default salaries, employer NIC, employer pension, PAYE/NIC liability, pension payable, and net wages liability accounts.</p>
            <p>Default fund/account allocations and pension provider metadata are stored workspace-wide for consistent posting and reporting.</p>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

function PayrollSimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return rows.length > 0 ? (
    <div className="rounded-2xl border border-slate-200/40 bg-white/70 shadow-sm overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={`${row[0]}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <TableCell
                  key={`${rowIndex}-${headers[cellIndex]}`}
                  className={cellIndex === 0 ? 'font-medium' : 'font-mono text-sm'}
                >
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ) : (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        No payroll data is available for this section yet.
      </CardContent>
    </Card>
  );
}
