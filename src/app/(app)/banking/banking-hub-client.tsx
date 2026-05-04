'use client';

import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Landmark,
  AlertCircle,
  CircleDollarSign,
  Upload,
  Eye,
  ClipboardCheck,
  Download,
  GitCompareArrows,
  ListChecks,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkspaceEmptyState } from '@/components/workspace-empty-state';
import { cn } from '@/lib/utils';
import { resolveBankCardAppearance } from '@/lib/banking/cardAppearance';
import type {
  BankingHubData,
  MonthlyBankingStat,
  BankLineWithAllocation,
  BankingAccountSummary,
} from '@/lib/banking/types';
import { BankAccountForm } from './bank-account-form';
import { BankRuleForm } from './bank-rule-form';
import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatPounds(pence: number | null): string {
  if (pence == null) return 'Not linked';
  const sign = pence < 0 ? '-' : '';
  return `${sign}£${(Math.abs(pence) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPoundsShort(pence: number): string {
  const abs = Math.abs(pence) / 100;
  const sign = pence < 0 ? '-' : '+';
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(1)}k`;
  return `${sign}£${abs.toFixed(2)}`;
}

function formatDate(date: string | null): string {
  if (!date) return 'Not yet';
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateShort(date: string | null): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
}

function accountTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case 'savings':
      return 'Savings';
    case 'credit_card':
      return 'Credit card';
    case 'loan':
      return 'Loan';
    case 'cash':
      return 'Cash';
    case 'clearing':
      return 'Clearing';
    default:
      return 'Current';
  }
}

function differenceClass(value: number | null): string {
  if (value == null || value === 0) return 'text-success';
  return value > 0 ? 'text-warning' : 'text-danger';
}

function monthLabel(iso: string): string {
  const [year, month] = iso.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'short' });
}

/* ------------------------------------------------------------------ */
/*  Metric strip                                                        */
/* ------------------------------------------------------------------ */

interface MetricItem {
  label: string;
  value: string | number;
  icon: ReactNode;
  href: string;
  description?: string;
  tone?: 'success' | 'info' | 'warning' | 'danger' | 'muted';
  valueClass?: string;
}

function MetricOverview({
  primaryMetrics,
  statusMetrics,
}: {
  primaryMetrics: MetricItem[];
  statusMetrics: MetricItem[];
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {primaryMetrics.map((m) => (
          <Link
            key={m.label}
            href={m.href}
            className="group flex min-h-[112px] flex-col justify-between rounded-2xl border border-border/70 bg-card p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {m.label}
                </p>
                <p
                  className={cn(
                    'mt-2 truncate text-xl font-bold tracking-tight text-foreground',
                    m.valueClass
                  )}
                >
                  {m.value}
                </p>
              </div>
              <span
                className={cn(
                  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                  m.tone === 'success' && 'bg-success-soft text-success',
                  m.tone === 'info' && 'bg-info-soft text-info',
                  m.tone === 'warning' && 'bg-warning-soft text-warning',
                  m.tone === 'danger' && 'bg-danger-soft text-danger',
                  (!m.tone || m.tone === 'muted') &&
                    'bg-surface-muted text-muted-foreground'
                )}
                aria-hidden="true"
              >
                {m.icon}
              </span>
            </div>
            {m.description ? (
              <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {m.description}
              </p>
            ) : null}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-card p-2 shadow-card">
        {statusMetrics.map((m) => (
          <Link
            key={m.label}
            href={m.href}
            className="group flex min-w-[150px] flex-1 items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted/45"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-muted-foreground/70" aria-hidden="true">
                {m.icon}
              </span>
              <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {m.label}
              </span>
            </span>
            <span
              className={cn(
                'shrink-0 text-sm font-bold tabular-nums text-foreground',
                m.valueClass
              )}
            >
              {m.value}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Account card with donut                                             */
/* ------------------------------------------------------------------ */

function AccountCard({
  account,
  canEdit,
}: {
  account: BankingAccountSummary;
  canEdit: boolean;
}) {
  const hasDiff =
    account.difference_pence != null && account.difference_pence !== 0;
  const maskedNumber =
    account.masked_account_number ||
    (account.account_number_last4
      ? `•••• ${account.account_number_last4}`
      : 'No account number');
  const statusTone = hasDiff
    ? 'border-warning/20 bg-warning-soft text-warning'
    : 'border-success/20 bg-success-soft text-success';
  const cardAppearance = resolveBankCardAppearance(account);

  return (
    <div className="rounded-3xl border border-border/70 bg-card p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-soft group/card">
      <Link
        href={`/banking/${account.id}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          className="relative mx-auto min-h-[190px] max-w-[360px] overflow-hidden rounded-2xl p-5 shadow-soft"
          data-bank-card-theme={cardAppearance.theme}
          style={{
            backgroundColor: cardAppearance.background,
            color: cardAppearance.foreground,
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.16),transparent_28%),radial-gradient(circle_at_90%_90%,rgba(255,255,255,0.12),transparent_34%)]" />
          <div
            className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center"
            aria-hidden="true"
          >
            <span className="absolute h-4 w-4 rounded-r-full border-r-2 border-current opacity-80" />
            <span className="absolute h-6 w-6 rounded-r-full border-r-2 border-current opacity-70" />
            <span className="absolute h-8 w-8 rounded-r-full border-r-2 border-current opacity-60" />
          </div>
          <div className="relative flex min-h-[150px] flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold opacity-95">
                  Church Ledger
                </p>
                <p className="mt-1 truncate text-xs font-medium opacity-70">
                  {account.name}
                </p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
                {account.bank_name || accountTypeLabel(account.account_type)}
              </p>
              <p className="mt-2 font-mono text-lg font-semibold tracking-[0.18em]">
                {maskedNumber}
              </p>
            </div>

            <div className="flex items-end justify-between gap-3 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
                  Balance
                </p>
                <p className="mt-1 font-semibold">
                  {formatPounds(account.statement_balance_pence)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
                  Currency
                </p>
                <p className="font-semibold">{account.currency ?? 'GBP'}</p>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-5 right-5 h-8 w-12 rounded-lg bg-white/15"
            aria-hidden="true"
          >
            <span className="absolute left-2 top-2 h-4 w-4 rounded-full bg-warning/90" />
            <span className="absolute left-5 top-2 h-4 w-4 rounded-full bg-danger/90 mix-blend-screen" />
          </div>
        </div>
        <div className="px-1 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {accountTypeLabel(account.account_type)}
            </Badge>
            <Badge className={cn('border text-[10px]', statusTone)}>
              {hasDiff ? 'Needs review' : 'Balanced'}
            </Badge>
            {account.is_active || account.status === 'active' ? (
              <Badge
                variant="outline"
                className="border-success/20 bg-success-soft text-[10px] text-success"
              >
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                Inactive
              </Badge>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Book balance</p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatPounds(account.book_balance_pence)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Difference</p>
              <p
                className={cn(
                  'mt-1 font-semibold tabular-nums',
                  differenceClass(account.difference_pence)
                )}
              >
                {formatPounds(account.difference_pence)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Unreconciled</p>
              <p
                className={cn(
                  'mt-1 font-semibold tabular-nums',
                  account.unreconciled_count > 0
                    ? 'text-warning'
                    : 'text-success'
                )}
              >
                {account.unreconciled_count}
              </p>
            </div>
          </div>
        </div>
      </Link>

      {/* Footer outside account Link so Upload is not nested inside <a> */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-2.5">
        <p className="text-xs text-muted-foreground">
          Last import:{' '}
          <span className="text-foreground font-medium">
            {formatDate(account.last_import_at)}
          </span>
        </p>
        {canEdit && (
          <Link
            href={`/banking/${account.id}/import`}
            className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
          >
            <Upload size={12} />
            Upload
          </Link>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Balance bar chart                                                   */
/* ------------------------------------------------------------------ */

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {formatPounds(p.value)}
        </p>
      ))}
    </div>
  );
};

function BalanceBarChart({ stats }: { stats: MonthlyBankingStat[] }) {
  if (stats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
        <CircleDollarSign size={28} className="opacity-30" />
        <p>No transaction data yet</p>
        <p className="text-xs">
          Import a bank statement to see your cash flow.
        </p>
      </div>
    );
  }

  const chartData = stats.map((s) => ({
    month: monthLabel(s.month),
    'Money In': Math.max(s.money_in_pence - s.money_out_pence, 0),
    'Money Out': s.money_out_pence,
    Reserve: Math.max(s.money_in_pence, s.money_out_pence) * 0.22,
  }));

  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart
        data={chartData}
        barGap={4}
        barCategoryGap="38%"
        margin={{ top: 22, right: 18, left: 8, bottom: 8 }}
      >
        <CartesianGrid
          vertical={false}
          stroke="hsl(var(--border))"
          strokeOpacity={0.35}
        />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          dy={8}
        />
        <YAxis
          tickFormatter={(v) => formatPoundsShort(v)}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          width={58}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: 'hsl(var(--muted) / 0.22)' }}
        />
        <Bar
          dataKey="Money In"
          stackId="a"
          fill="hsl(var(--primary))"
          radius={[0, 0, 5, 5]}
        />
        <Bar
          dataKey="Money Out"
          stackId="a"
          fill="hsl(var(--primary) / 0.68)"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="Reserve"
          stackId="a"
          fill="hsl(var(--muted))"
          radius={[7, 7, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent transactions panel                                           */
/* ------------------------------------------------------------------ */

function RecentTransactionsPanel({
  deposits,
}: {
  deposits: BankLineWithAllocation[];
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="divide-y divide-border/50">
        {deposits.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <Landmark size={24} className="opacity-30" />
            <p>No recent transactions</p>
          </div>
        )}
        {deposits.map((line) => {
          const description =
            line.display_description?.trim() ||
            line.description?.trim() ||
            line.reference?.trim() ||
            'Bank transaction';
          const amountPence = Math.abs(line.amount_pence);
          return (
            <Link
              key={line.id}
              href={`/banking/${line.bank_account_id}?tab=transactions`}
              className="flex items-center gap-3 px-1 py-3 hover:bg-muted/40 transition-colors rounded-lg"
            >
              {/* Icon */}
              <div className="w-9 h-9 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
                <Landmark size={15} className="text-primary" />
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate leading-tight">
                  {description}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {formatDateShort(line.txn_date)}
                  {line.reference ? ` · ${line.reference}` : ''}
                </p>
              </div>

              {/* Amount */}
              <span className="text-sm font-semibold text-success shrink-0">
                +{formatPounds(amountPence)}
              </span>
            </Link>
          );
        })}
      </div>

      {deposits.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <Link
            href="/banking?status=needs_matching"
            className="flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            View all transactions
            <ArrowRight size={12} />
          </Link>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main client component                                               */
/* ------------------------------------------------------------------ */

interface BankingHubClientProps {
  orgName: string;
  role: string;
  orgId: string;
  data: BankingHubData;
  monthlyStats: MonthlyBankingStat[];
  recentDeposits: BankLineWithAllocation[];
  error: string | null;
}

export function BankingHubClient({
  orgName,
  role,
  orgId,
  data,
  monthlyStats,
  recentDeposits,
  error,
}: BankingHubClientProps) {
  const canEdit = role === 'admin' || role === 'treasurer';
  const allAccounts = data.accounts;

  const primaryMetrics: MetricItem[] = [
    {
      label: 'Bank Balance',
      value: formatPounds(data.summary.statement_balance_pence ?? null),
      icon: <Landmark size={18} />,
      href: '/banking',
      description: 'Latest imported statement balances.',
      tone: 'success',
    },
    {
      label: 'Book Balance',
      value: formatPounds(data.summary.book_balance_pence ?? null),
      icon: <CircleDollarSign size={18} />,
      href: '/banking',
      description: 'Ledger balances for linked accounts.',
      tone: 'info',
    },
    {
      label: 'Difference',
      value: formatPounds(data.summary.difference_pence ?? null),
      icon: <GitCompareArrows size={18} />,
      href: '/banking',
      description: 'Bank balance minus book balance.',
      tone: data.summary.difference_pence === 0 ? 'success' : 'warning',
      valueClass: data.summary.difference_pence
        ? data.summary.difference_pence !== 0
          ? 'text-warning'
          : 'text-success'
        : undefined,
    },
    {
      label: 'Unreconciled',
      value: data.summary.unreconciled_transactions ?? 0,
      icon: <AlertCircle size={18} />,
      href: '/banking?status=needs_matching',
      description: 'Statement lines needing allocation.',
      tone:
        (data.summary.unreconciled_transactions ?? 0) > 0
          ? 'warning'
          : 'success',
      valueClass:
        (data.summary.unreconciled_transactions ?? 0) > 0
          ? 'text-warning'
          : undefined,
    },
  ];

  const statusMetrics: MetricItem[] = [
    {
      label: 'Statements',
      value: data.summary.statements_imported_this_month ?? 0,
      icon: <Upload size={12} />,
      href: '/banking?metric=statements',
    },
    {
      label: 'Stale Imports',
      value: data.summary.stale_bank_imports ?? 0,
      icon: <Eye size={12} />,
      href: '/banking?metric=stale-imports',
      valueClass:
        (data.summary.stale_bank_imports ?? 0) > 0 ? 'text-warning' : undefined,
    },
    {
      label: 'Duplicates',
      value: data.summary.possible_duplicates ?? 0,
      icon: <ListChecks size={12} />,
      href: '/banking?status=duplicate',
      valueClass:
        (data.summary.possible_duplicates ?? 0) > 0 ? 'text-danger' : undefined,
    },
    {
      label: 'Last Reconciled',
      value: formatDate(data.summary.last_reconciled_date ?? null),
      icon: <ShieldCheck size={12} />,
      href: '/reconciliation',
    },
    {
      label: 'Month-End',
      value: data.summary.month_end_ready ? 'Ready' : 'Review',
      icon: <ShieldCheck size={12} />,
      href: '/month-end',
      valueClass: data.summary.month_end_ready
        ? 'text-success'
        : 'text-warning',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Banking Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{orgName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button asChild>
              <Link href="/banking/import">
                <Upload size={15} className="mr-1.5" />
                Upload Statement
              </Link>
            </Button>
          )}
          {canEdit && <BankAccountForm orgId={orgId} />}
          <Button asChild variant="outline">
            <Link href="/reconciliation">
              <ClipboardCheck size={15} className="mr-1.5" />
              Reconcile
            </Link>
          </Button>
          {canEdit && (
            <BankRuleForm
              accounts={allAccounts.map((a) => ({ id: a.id, name: a.name }))}
            />
          )}
          <Button asChild variant="outline">
            <Link href="/api/banking/export">
              <Download size={15} className="mr-1.5" />
              Export
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Metric overview ── */}
      <MetricOverview
        primaryMetrics={primaryMetrics}
        statusMetrics={statusMetrics}
      />

      {/* ── Error ── */}
      {error && (
        <div className="rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* ── Account cards ── */}
      {allAccounts.length === 0 ? (
        <WorkspaceEmptyState
          icon={<Landmark className="h-10 w-10" />}
          title="No bank accounts yet"
          description={
            canEdit
              ? 'Add your first bank account so you can upload statements, match transactions, and reconcile cash.'
              : 'A treasurer or admin needs to add the first bank account before banking workflows can begin.'
          }
          action={canEdit ? <BankAccountForm orgId={orgId} /> : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {allAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                canEdit={canEdit}
              />
            ))}
          </div>

          {/* ── Charts + Recent transactions ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            {/* Balance over time */}
            <div className="rounded-3xl border border-border/70 bg-card px-6 py-6 shadow-card lg:col-span-3">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    Cash flow over time
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Last 12 months · money in vs out
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                      Series 1
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-primary/60" />
                      Series 2
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-muted" />
                      Series 3
                    </span>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/banking?status=needs_matching">
                      View all <ArrowRight size={12} className="ml-1" />
                    </Link>
                  </Button>
                </div>
              </div>
              <BalanceBarChart stats={monthlyStats} />
            </div>

            {/* Recent transactions */}
            <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-card lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    Recent deposits
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Latest incoming transactions
                  </p>
                </div>
              </div>
              <RecentTransactionsPanel deposits={recentDeposits} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
