import { Fragment } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  TrendingUp,
  TrendingDown,
  Wallet,
  Scale,
  Landmark,
  Plus,
  FileText,
  BarChart3,
} from 'lucide-react';
import { getActiveOrg } from '@/lib/org';
import { getAccountsWithStats } from '@/lib/accounts/actions';
import type { AccountType, AccountWithStats } from '@/lib/accounts/types';
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES } from '@/lib/accounts/types';
import { ACCOUNT_CATEGORIES, ACCOUNT_TYPE_ORDER } from '@/lib/accounts/categories';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

const TYPE_BADGE_COLORS: Record<AccountType, string> = {
  income: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  expense: 'bg-rose-100 text-rose-800 border-rose-200',
  asset: 'bg-amber-100 text-amber-800 border-amber-200',
  liability: 'bg-violet-100 text-violet-800 border-violet-200',
  equity: 'bg-blue-100 text-blue-800 border-blue-200',
};

const TYPE_ICONS: Record<AccountType, React.ReactNode> = {
  income: <TrendingUp size={18} />,
  expense: <TrendingDown size={18} />,
  asset: <Wallet size={18} />,
  liability: <Landmark size={18} />,
  equity: <Scale size={18} />,
};

const TYPE_TINTS: Record<AccountType, string> = {
  income: 'emerald',
  expense: 'rose',
  asset: 'amber',
  liability: 'violet',
  equity: 'blue',
};

const TYPE_CARD_STYLES: Record<AccountType, string> = {
  income: 'bg-emerald-100/55 border-emerald-200/50',
  expense: 'bg-rose-100/55 border-rose-200/50',
  asset: 'bg-amber-100/55 border-amber-200/50',
  liability: 'bg-violet-100/55 border-violet-200/50',
  equity: 'bg-blue-100/55 border-blue-200/50',
};

const TYPE_ICON_STYLES: Record<AccountType, string> = {
  income: 'bg-emerald-100/60 text-emerald-700',
  expense: 'bg-rose-100/60 text-rose-700',
  asset: 'bg-amber-100/60 text-amber-700',
  liability: 'bg-violet-100/60 text-violet-700',
  equity: 'bg-blue-100/60 text-blue-700',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function penceToPounds(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  return sign + '£' + (Math.abs(pence) / 100).toFixed(2);
}

function groupByType(accounts: AccountWithStats[]): Record<AccountType, AccountWithStats[]> {
  const grouped: Record<AccountType, AccountWithStats[]> = {
    income: [],
    expense: [],
    asset: [],
    liability: [],
    equity: [],
  };

  for (const a of accounts) {
    grouped[a.type as AccountType]?.push(a);
  }

  return grouped;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; active?: string; showEmpty?: string }>;
}) {
  const { role } = await getActiveOrg();
  const params = await searchParams;
  const canEdit = role === 'admin' || role === 'treasurer';

  const filterType = params.type && params.type !== 'all'
    ? (params.type as AccountType)
    : undefined;
  const activeOnly = params.active === 'true';
  const showEmptyCategories = params.showEmpty === 'true';

  const { data: accounts, error } = await getAccountsWithStats({
    type: filterType,
    activeOnly,
  });

  const grouped = groupByType(accounts);
  const displayTypes = filterType ? [filterType] : ACCOUNT_TYPE_ORDER;

  function buildFilterUrl(overrides: { type?: string; active?: string; showEmpty?: string }) {
    const p = new URLSearchParams();
    if (overrides.type) p.set('type', overrides.type);
    if (overrides.active === 'true') p.set('active', 'true');
    if (overrides.showEmpty === 'true') p.set('showEmpty', 'true');
    const q = p.toString();
    return q ? `/accounts?${q}` : '/accounts';
  }

  return (
    <PageShell>
      {/* Header */}
      <PageHeader
        title="Chart of Accounts"
        subtitle="Master list of all financial accounts, feeding into the Balance Sheet and Profit & Loss reports."
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/accounts/new">
                <Plus size={16} className="mr-1.5" />
                New Account
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Report links */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/reports/balance-sheet">
            <FileText size={14} className="mr-1.5" />
            View Balance Sheet
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/reports/income-statement">
            <BarChart3 size={14} className="mr-1.5" />
            View Profit & Loss
          </Link>
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {ACCOUNT_TYPE_ORDER.map((t) => {
          const count = grouped[t]?.length ?? 0;
          return (
            <StatCard
              key={t}
              title={ACCOUNT_TYPE_LABELS[t]}
              value={count}
              subtitle={`${count === 1 ? 'account' : 'accounts'}`}
              href={`/accounts?type=${t}`}
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
          <Link href={buildFilterUrl({ active: activeOnly ? 'true' : undefined, showEmpty: showEmptyCategories ? 'true' : undefined })}>
            All Types
          </Link>
        </Button>
        {ACCOUNT_TYPE_ORDER.map((t) => (
          <Button
            key={t}
            asChild
            variant={filterType === t ? 'default' : 'outline'}
            size="sm"
          >
            <Link
              href={buildFilterUrl({ type: t, active: activeOnly ? 'true' : undefined, showEmpty: showEmptyCategories ? 'true' : undefined })}
            >
              {ACCOUNT_TYPE_LABELS[t]}
            </Link>
          </Button>
        ))}

        <div className="ml-auto flex gap-2">
          <Button
            asChild
            variant={activeOnly ? 'default' : 'outline'}
            size="sm"
          >
            <Link
              href={buildFilterUrl({
                type: filterType,
                active: activeOnly ? undefined : 'true',
                showEmpty: showEmptyCategories ? 'true' : undefined,
              })}
            >
              {activeOnly ? 'Showing Active Only' : 'Show Active Only'}
            </Link>
          </Button>
          <Button
            asChild
            variant={showEmptyCategories ? 'default' : 'outline'}
            size="sm"
          >
            <Link
              href={buildFilterUrl({
                type: filterType,
                active: activeOnly ? 'true' : undefined,
                showEmpty: showEmptyCategories ? undefined : 'true',
              })}
            >
              {showEmptyCategories ? 'Hiding Empty Categories' : 'Show Empty Categories'}
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <SoftAlert variant="error">{error}</SoftAlert>
      )}

      {/* Grouped account sections */}
      {accounts.length > 0 ? (
        <div className="space-y-6">
          {displayTypes.map((type) => {
            const typeAccounts = grouped[type] ?? [];
            const standardCategories = ACCOUNT_CATEGORIES[type];
            const standardValues = standardCategories.map((c) => c.value);

            const categoriesMap = new Map<string, AccountWithStats[]>();
            for (const cat of standardValues) {
              categoriesMap.set(cat, []);
            }
            for (const a of typeAccounts) {
              const cat = a.reporting_category ?? null;
              const target = cat && standardValues.includes(cat) ? cat : 'Other';
              if (!categoriesMap.has(target)) categoriesMap.set(target, []);
              categoriesMap.get(target)!.push(a);
            }

            const categoriesToShow = showEmptyCategories
              ? standardValues
              : standardValues.filter((cat) => (categoriesMap.get(cat)?.length ?? 0) > 0);

            if (categoriesToShow.length === 0 && typeAccounts.length === 0) return null;

            return (
              <Card key={type} className={`border rounded-2xl shadow-sm ${TYPE_CARD_STYLES[type]}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${TYPE_ICON_STYLES[type]}`}>
                      {TYPE_ICONS[type]}
                    </span>
                    {ACCOUNT_TYPE_LABELS[type]} Accounts
                    <Badge variant="outline" className="ml-2 text-xs font-normal">
                      {typeAccounts.length} {typeAccounts.length === 1 ? 'account' : 'accounts'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-center w-[80px]">Status</TableHead>
                          <TableHead className="text-right w-[100px]">Transactions</TableHead>
                          <TableHead className="text-right w-[120px]">Current Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoriesToShow.map((category) => {
                          const catAccounts = categoriesMap.get(category) ?? [];
                          return (
                          <Fragment key={`${type}-${category}`}>
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableCell
                                colSpan={6}
                                className="py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                              >
                                {category}
                              </TableCell>
                            </TableRow>
                            {catAccounts.length > 0 ? (
                              catAccounts.map((account) => (
                              <TableRow
                                key={account.id}
                                className={!account.is_active ? 'opacity-50' : ''}
                              >
                                <TableCell className="font-mono text-sm">
                                  {canEdit ? (
                                    <Link
                                      href={`/accounts/${account.id}`}
                                      className="font-medium text-primary underline-offset-4 hover:underline"
                                    >
                                      {account.code}
                                    </Link>
                                  ) : (
                                    <span className="font-medium">{account.code}</span>
                                  )}
                                </TableCell>
                                <TableCell className="font-medium">
                                  {account.parent_id && (
                                    <span className="text-muted-foreground mr-1">└</span>
                                  )}
                                  {account.name}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {account.reporting_category ?? '—'}
                                </TableCell>
                                <TableCell className="text-center">
                                  {account.is_active ? (
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                                      Active
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 text-xs">
                                      Inactive
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {account.transaction_count}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  <span
                                    className={
                                      account.balance_pence > 0
                                        ? 'text-emerald-600'
                                        : account.balance_pence < 0
                                        ? 'text-rose-600'
                                        : 'text-muted-foreground'
                                    }
                                  >
                                    {penceToPounds(account.balance_pence)}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={6} className="py-4 text-center text-sm text-muted-foreground">
                                  No accounts in this category
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                          );
                        })}
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
            <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              No accounts found.{' '}
              {canEdit && (
                <>
                  <Link href="/accounts/new" className="text-primary hover:underline">
                    Create one
                  </Link>{' '}
                  to get started, or seed default accounts from{' '}
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
