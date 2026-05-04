'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Layers,
  Lock,
  Unlock,
  Tag,
  Plus,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  ArrowRightLeft,
  Shuffle,
  Waves,
  Download,
  FileSpreadsheet,
  Coins,
} from 'lucide-react';
import type { FundType, FundWithStats, PeriodPreset } from '@/lib/funds/types';
import { FUND_TYPE_LABELS, FUND_TYPES, PERIOD_LABELS, getOverspendStatus, OVERSPEND_LABELS } from '@/lib/funds/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/stat-card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { WorkspaceEmptyState } from '@/components/workspace-empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TYPE_BADGE_COLORS: Record<FundType, string> = {
  unrestricted: 'bg-success-soft text-success border-success/20',
  restricted: 'bg-info-soft text-info border-info/20',
  designated: 'bg-warning-soft text-warning border-warning/20',
};

const TYPE_ICONS: Record<FundType, React.ReactNode> = {
  unrestricted: <Unlock size={18} />,
  restricted: <Lock size={18} />,
  designated: <Tag size={18} />,
};

const TYPE_TINTS: Record<FundType, string> = {
  unrestricted: 'emerald',
  restricted: 'blue',
  designated: 'amber',
};

const TYPE_CARD_STYLES: Record<FundType, string> = {
  unrestricted: 'bg-card border-border',
  restricted: 'bg-card border-border',
  designated: 'bg-card border-border',
};

const TYPE_ICON_STYLES: Record<FundType, string> = {
  unrestricted: 'bg-success-soft text-success',
  restricted: 'bg-info-soft text-info',
  designated: 'bg-warning-soft text-warning',
};

const PERIODS: PeriodPreset[] = ['this_month', 'last_month', 'ytd', 'custom'];
const FILTER_SELECT_CLASS = 'h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs outline-none transition focus:border-primary/30 focus:ring-[3px] focus:ring-primary/10';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function penceToPounds(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  return sign + '£' + (Math.abs(pence) / 100).toFixed(2);
}

function groupByType(funds: FundWithStats[]): Record<FundType, FundWithStats[]> {
  const grouped: Record<FundType, FundWithStats[]> = {
    unrestricted: [],
    restricted: [],
    designated: [],
  };
  for (const f of funds) {
    grouped[f.type as FundType]?.push(f);
  }
  return grouped;
}

function overspendBadge(type: FundType, balancePence: number) {
  const status = getOverspendStatus(type, balancePence);
  if (status === 'ok') return null;
  const label = OVERSPEND_LABELS[status];
  const colors = status === 'overspent'
    ? 'bg-danger-soft text-danger border-danger/20'
    : 'bg-warning-soft text-warning border-warning/20';
  return <Badge variant="outline" className={`text-xs ${colors}`}>{label}</Badge>;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  funds: FundWithStats[];
  error: string | null;
  canEdit: boolean;
  filterType: FundType | null;
  activeOnly: boolean;
  period: string;
  startDate: string;
  endDate: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FundsClient({
  funds,
  error,
  canEdit,
  filterType,
  activeOnly,
  period: initialPeriod,
  startDate: initialStart,
  endDate: initialEnd,
}: Props) {
  const router = useRouter();

  const [customFrom, setCustomFrom] = useState(initialStart);
  const [customTo, setCustomTo] = useState(initialEnd);

  const grouped = groupByType(funds);

  const overspentRestricted = funds.filter(
    (f) => f.type === 'restricted' && f.balance_pence < 0
  );

  const totalBalance = funds.reduce((s, f) => s + f.balance_pence, 0);
  const unrestrictedTotal = funds
    .filter((f) => f.type === 'unrestricted')
    .reduce((s, f) => s + f.balance_pence, 0);
  const restrictedTotal = funds
    .filter((f) => f.type === 'restricted')
    .reduce((s, f) => s + f.balance_pence, 0);
  const designatedTotal = funds
    .filter((f) => f.type === 'designated')
    .reduce((s, f) => s + f.balance_pence, 0);

  const fundsAtRisk = funds.filter((f) => {
    if (!f.is_active) return false;
    if ((f.min_balance_warning_pence ?? null) != null && f.balance_pence < (f.min_balance_warning_pence as number))
      return true;
    return getOverspendStatus(f.type, f.balance_pence) !== 'ok';
  }).length;

  const displayTypes = filterType ? [filterType] : FUND_TYPES;

  function buildUrl(overrides: Record<string, string | undefined>) {
    const base: Record<string, string> = {};
    if (filterType) base.type = filterType;
    if (activeOnly) base.active = 'true';
    base.period = initialPeriod;
    if (initialPeriod === 'custom') {
      base.from = initialStart;
      base.to = initialEnd;
    }
    const merged = { ...base, ...overrides };
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined) clean[k] = v;
    }
    const qs = new URLSearchParams(clean).toString();
    return qs ? `/funds?${qs}` : '/funds';
  }

  function handlePeriodChange(p: PeriodPreset) {
    if (p === 'custom') {
      router.push(buildUrl({ period: 'custom', from: customFrom, to: customTo }));
    } else {
      router.push(buildUrl({ period: p, from: undefined, to: undefined }));
    }
  }

  function handleCustomApply() {
    if (customFrom && customTo) {
      router.push(buildUrl({ period: 'custom', from: customFrom, to: customTo }));
    }
  }

  return (
    <PageShell>
      {/* Header */}
      <PageHeader
        title="Funds"
        subtitle="Track restricted, unrestricted, and designated money across your church."
        actions={
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {canEdit ? (
              <>
                <Button asChild size="sm">
                  <Link href="/funds/new">
                    <Plus size={14} className="mr-1" aria-hidden /> Add Fund
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/funds/movements?kind=transfer">
                    <ArrowRightLeft size={14} className="mr-1" aria-hidden /> Transfer
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/funds/movements?kind=adjustment">
                    <Shuffle size={14} className="mr-1" aria-hidden /> Adjustment
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/funds/income-streams">
                    <Waves size={14} className="mr-1" aria-hidden /> Income streams
                  </Link>
                </Button>
              </>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href="/reports/export-pack">
                <Download size={14} className="mr-1" aria-hidden /> Export
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/reports/fund-movements">
                <FileSpreadsheet size={14} className="mr-1" aria-hidden /> Fund report
              </Link>
            </Button>
          </div>
        }
      />

      {/* Overspend Warning Banner */}
      {overspentRestricted.length > 0 && (
        <SoftAlert variant="error" icon={<AlertTriangle className="h-5 w-5" />}>
          <p className="font-medium">
            {overspentRestricted.length} restricted fund{overspentRestricted.length === 1 ? '' : 's'} overspent
          </p>
          <p className="text-xs opacity-80 mt-0.5">
            {overspentRestricted.map((f) => f.name).join(', ')} — these funds have spent more than received. Review immediately.
          </p>
          <Button
            asChild
            variant="link"
            className="px-0 h-auto mt-1 text-red-700"
          >
            <Link href="/funds?type=restricted">View Restricted Funds</Link>
          </Button>
        </SoftAlert>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard
          title="Total fund balance"
          value={penceToPounds(totalBalance)}
          subtitle="All recognised funds combined"
          href="/funds"
          tint="indigo"
          icon={<Coins size={18} aria-hidden />}
        />
        <StatCard
          title="Unrestricted"
          value={penceToPounds(unrestrictedTotal)}
          subtitle={`${grouped.unrestricted?.length ?? 0} funds`}
          href="/funds?type=unrestricted"
          tint={TYPE_TINTS.unrestricted}
          icon={TYPE_ICONS.unrestricted}
        />
        <StatCard
          title="Restricted"
          value={penceToPounds(restrictedTotal)}
          subtitle={`${grouped.restricted?.length ?? 0} funds`}
          href="/funds?type=restricted"
          tint={TYPE_TINTS.restricted}
          icon={TYPE_ICONS.restricted}
        />
        <StatCard
          title="Designated"
          value={penceToPounds(designatedTotal)}
          subtitle={`${grouped.designated?.length ?? 0} funds`}
          href="/funds?type=designated"
          tint={TYPE_TINTS.designated}
          icon={TYPE_ICONS.designated}
        />
        <StatCard
          title="Funds at risk"
          value={fundsAtRisk}
          subtitle="Warnings or minimum balance breached"
          href="/funds"
          tint="orange"
          icon={<AlertTriangle size={18} aria-hidden />}
        />
      </div>

      {/* Period + fund scope (preserves URL query state; KPI cards link plain /funds paths) */}
      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-card">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_auto]">
          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Calendar size={14} />
              Period
            </span>
            <select
              value={initialPeriod}
              onChange={(event) => handlePeriodChange(event.target.value as PeriodPreset)}
              className={FILTER_SELECT_CLASS}
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
              ))}
            </select>
            <span className="block text-xs text-muted-foreground">Choose the reporting range for fund movement totals.</span>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Show</span>
            <select
              value={filterType ?? 'all'}
              onChange={(event) => router.push(buildUrl({ type: event.target.value === 'all' ? undefined : event.target.value }))}
              className={FILTER_SELECT_CLASS}
            >
              <option value="all">All types</option>
              {FUND_TYPES.map((t) => (
                <option key={t} value={t}>{FUND_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <span className="block text-xs text-muted-foreground">Filter funds by restriction type.</span>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Activity</span>
            <select
              value={activeOnly ? 'active' : 'all'}
              onChange={(event) => router.push(buildUrl({ active: event.target.value === 'active' ? 'true' : undefined }))}
              className={FILTER_SELECT_CLASS}
            >
              <option value="active">Active only</option>
              <option value="all">Include inactive</option>
            </select>
            <span className="block text-xs text-muted-foreground">Control whether inactive funds are included.</span>
          </label>

          {initialPeriod === 'custom' && (
            <div className="space-y-1.5 md:col-span-3 xl:col-span-1">
              <span className="text-xs font-semibold text-muted-foreground">Custom range</span>
              <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-10 w-36 rounded-xl text-xs"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-10 w-36 rounded-xl text-xs"
              />
              <Button size="sm" variant="outline" onClick={handleCustomApply}>Apply</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <SoftAlert variant="error">{error}</SoftAlert>
      )}

      {/* Grouped fund sections */}
      {funds.length > 0 ? (
        <div className="space-y-6">
          {displayTypes.map((type) => {
            const typeFunds = grouped[type] ?? [];
            if (typeFunds.length === 0) return null;

            const groups = new Map<string, FundWithStats[]>();
            for (const f of typeFunds) {
              const grp = f.reporting_group ?? 'Uncategorised';
              if (!groups.has(grp)) groups.set(grp, []);
              groups.get(grp)!.push(f);
            }

            const typeBalance = typeFunds.reduce((sum, f) => sum + f.balance_pence, 0);

            return (
              <Card key={type} className={`border rounded-2xl shadow-sm ${TYPE_CARD_STYLES[type]}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${TYPE_ICON_STYLES[type]}`}>
                      {TYPE_ICONS[type]}
                    </span>
                    {FUND_TYPE_LABELS[type]} Funds
                    <Badge variant="outline" className="ml-2 text-xs font-normal">
                      {typeFunds.length} {typeFunds.length === 1 ? 'fund' : 'funds'}
                    </Badge>
                    <span className="ml-auto text-base font-mono">
                      {penceToPounds(typeBalance)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-center w-[90px]">Health</TableHead>
                          <TableHead className="text-right w-[110px]">
                            <span className="flex items-center justify-end gap-1">
                              <TrendingUp size={12} className="text-green-600" /> Income
                            </span>
                          </TableHead>
                          <TableHead className="text-right w-[110px]">
                            <span className="flex items-center justify-end gap-1">
                              <TrendingDown size={12} className="text-red-600" /> Expense
                            </span>
                          </TableHead>
                          <TableHead className="text-right w-[110px]">Net</TableHead>
                          <TableHead className="text-right w-[120px]">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Array.from(groups.entries()).map(([group, grpFunds]) => (
                          <Fragment key={`${type}-${group}`}>
                            {groups.size > 1 && (
                              <TableRow className="bg-muted/30 hover:bg-muted/30">
                                <TableCell
                                  colSpan={7}
                                  className="py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                                >
                                  {group}
                                </TableCell>
                              </TableRow>
                            )}
                            {grpFunds.map((fund) => {
                              const badge = overspendBadge(fund.type as FundType, fund.balance_pence);

                              return (
                                <TableRow
                                  key={fund.id}
                                  className={!fund.is_active ? 'opacity-50' : ''}
                                >
                                  <TableCell>
                                    <Link
                                      href={`/funds/${fund.id}`}
                                      className="font-medium text-primary underline-offset-4 hover:underline"
                                    >
                                      {fund.name}
                                    </Link>
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="outline"
                                      className={`text-xs ${TYPE_BADGE_COLORS[fund.type as FundType] ?? ''}`}
                                    >
                                      {FUND_TYPE_LABELS[fund.type as FundType] ?? fund.type}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {badge ?? (
                                      <StatusBadge
                                        status={fund.is_active ? 'active' : 'inactive'}
                                        label={fund.is_active ? 'OK' : 'Inactive'}
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm text-green-700">
                                    {fund.income_pence > 0 ? penceToPounds(fund.income_pence) : '—'}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm text-red-700">
                                    {fund.expense_pence > 0 ? penceToPounds(fund.expense_pence) : '—'}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm">
                                    <span className={
                                      fund.net_movement_pence > 0 ? 'text-green-700' :
                                      fund.net_movement_pence < 0 ? 'text-red-700' :
                                      'text-muted-foreground'
                                    }>
                                      {fund.net_movement_pence !== 0 ? penceToPounds(fund.net_movement_pence) : '—'}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm">
                                    <span
                                      className={
                                        fund.balance_pence > 0
                                          ? 'text-emerald-600'
                                          : fund.balance_pence < 0
                                          ? 'text-rose-600'
                                          : 'text-muted-foreground'
                                      }
                                    >
                                      {penceToPounds(fund.balance_pence)}
                                      {fund.balance_pence < 0 && (
                                        <AlertTriangle
                                          size={14}
                                          className="inline ml-1 text-rose-500"
                                        />
                                      )}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <WorkspaceEmptyState
          icon={<Layers className="h-10 w-10" />}
          title="No funds yet"
          description={
            canEdit
              ? 'Create your first unrestricted or restricted fund so income, expense, and report balances have somewhere to land.'
              : 'Funds will appear here once your finance team creates the initial fund structure.'
          }
          action={
            canEdit ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button asChild size="sm">
                  <Link href="/funds/new">Create Fund</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/onboarding/setup">Guided setup</Link>
                </Button>
              </div>
            ) : undefined
          }
        />
      )}
    </PageShell>
  );
}
