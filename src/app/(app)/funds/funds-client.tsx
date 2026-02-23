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
  unrestricted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  restricted: 'bg-blue-100 text-blue-800 border-blue-200',
  designated: 'bg-amber-100 text-amber-800 border-amber-200',
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
  unrestricted: 'bg-emerald-100/55 border-emerald-200/50',
  restricted: 'bg-blue-100/55 border-blue-200/50',
  designated: 'bg-amber-100/55 border-amber-200/50',
};

const TYPE_ICON_STYLES: Record<FundType, string> = {
  unrestricted: 'bg-emerald-100/60 text-emerald-700',
  restricted: 'bg-blue-100/60 text-blue-700',
  designated: 'bg-amber-100/60 text-amber-700',
};

const PERIODS: PeriodPreset[] = ['this_month', 'last_month', 'ytd', 'custom'];

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
    ? 'bg-red-100 text-red-800 border-red-200'
    : 'bg-amber-100 text-amber-800 border-amber-200';
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

  const typeBalances: Record<FundType, number> = { unrestricted: 0, restricted: 0, designated: 0 };
  for (const f of funds) {
    typeBalances[f.type as FundType] = (typeBalances[f.type as FundType] ?? 0) + f.balance_pence;
  }

  const overspentRestricted = funds.filter(
    (f) => f.type === 'restricted' && f.balance_pence < 0
  );

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
        title="Charity Funds"
        subtitle="Manage restricted, unrestricted, and designated funds for your organisation."
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/funds/new">
                <Plus size={16} className="mr-1.5" />
                New Fund
              </Link>
            </Button>
          ) : undefined
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

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {FUND_TYPES.map((t) => {
          const count = grouped[t]?.length ?? 0;
          const balance = typeBalances[t] ?? 0;
          return (
            <StatCard
              key={t}
              title={FUND_TYPE_LABELS[t]}
              value={count}
              subtitle={`${count === 1 ? 'fund' : 'funds'} · ${penceToPounds(balance)}`}
              href={`/funds?type=${t}`}
              tint={TYPE_TINTS[t]}
              icon={TYPE_ICONS[t]}
            />
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground mr-1">Filter:</span>
        <Button
          asChild
          variant={!filterType ? 'default' : 'outline'}
          size="sm"
        >
          <Link href={buildUrl({ type: undefined })}>All Types</Link>
        </Button>
        {FUND_TYPES.map((t) => (
          <Button
            key={t}
            asChild
            variant={filterType === t ? 'default' : 'outline'}
            size="sm"
          >
            <Link href={buildUrl({ type: t })}>{FUND_TYPE_LABELS[t]}</Link>
          </Button>
        ))}

        <div className="ml-auto">
          <Button
            asChild
            variant={activeOnly ? 'default' : 'outline'}
            size="sm"
          >
            <Link
              href={
                activeOnly
                  ? buildUrl({ active: undefined })
                  : buildUrl({ active: 'true' })
              }
            >
              {activeOnly ? 'Showing Active Only' : 'Show Active Only'}
            </Link>
          </Button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-slate-200/40 bg-slate-100/55 p-3">
        <Calendar size={16} className="text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground mr-1">Period:</span>
        {PERIODS.map((p) => (
          <Button
            key={p}
            variant={initialPeriod === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePeriodChange(p)}
          >
            {PERIOD_LABELS[p]}
          </Button>
        ))}
        {initialPeriod === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 w-36 text-xs"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 w-36 text-xs"
            />
            <Button size="sm" variant="outline" onClick={handleCustomApply}>Apply</Button>
          </div>
        )}
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
                                      fund.is_active ? (
                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                                          OK
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 text-xs">
                                          Inactive
                                        </Badge>
                                      )
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
        <Card className="border shadow-sm rounded-2xl bg-slate-100/55 border-slate-200/40">
          <CardContent className="py-12 text-center">
            <Layers className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              No funds found.{' '}
              {canEdit && (
                <>
                  <Link href="/funds/new" className="text-primary hover:underline">
                    Create one
                  </Link>{' '}
                  to get started, or seed default funds from{' '}
                  <Link href="/settings/seed" className="text-primary hover:underline">
                    Settings
                  </Link>
                  .
                </>
              )}
            </p>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
