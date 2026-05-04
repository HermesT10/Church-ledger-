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
  Coins,
  FileSpreadsheet,
} from 'lucide-react';
import { getActiveOrg } from '@/lib/org';
import { getAccountsWithStats, importAccountTemplateAction } from '@/lib/accounts/actions';
import { getChartOfAccountsSummary } from '@/lib/accounts/balances';
import { buildAccountCleanupSuggestions } from '@/lib/accounts/cleanup';
import { accountBalanceColumnLabel, getDisplayAccountBalance } from '@/lib/accounts/display-balance';
import type { AccountType, AccountWithStats } from '@/lib/accounts/types';
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES_NAV } from '@/lib/accounts/types';
import { formatMoney } from '@/lib/money/format-money';
import { moneyToneClass } from '@/lib/money/money-tone';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { FilterBar, FilterBarLabel } from '@/components/ui/filter-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Card,
  CardContent,
  CardDescription,
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

const TYPE_ICONS: Partial<Record<AccountType, React.ReactNode>> = {
  income: <TrendingUp size={18} />,
  expense: <TrendingDown size={18} />,
  asset: <Wallet size={18} />,
  liability: <Landmark size={18} />,
  fund_balance: <Scale size={18} />,
  equity: <Scale size={18} />,
};

const TYPE_TINTS: Partial<Record<AccountType, string>> = {
  income: 'emerald',
  expense: 'rose',
  asset: 'amber',
  liability: 'violet',
  fund_balance: 'blue',
  equity: 'blue',
};

const TYPE_CARD_STYLES: Partial<Record<AccountType, string>> = {
  income: 'bg-card border-border',
  expense: 'bg-card border-border',
  asset: 'bg-card border-border',
  liability: 'bg-card border-border',
  fund_balance: 'bg-card border-border',
  equity: 'bg-card border-border',
};

const TYPE_ICON_STYLES: Partial<Record<AccountType, string>> = {
  income: 'bg-success-soft text-success',
  expense: 'bg-danger-soft text-danger',
  asset: 'bg-warning-soft text-warning',
  liability: 'bg-accent-soft text-primary',
  fund_balance: 'bg-info-soft text-info',
  equity: 'bg-info-soft text-info',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function groupByType(accounts: AccountWithStats[]): Partial<Record<AccountType, AccountWithStats[]>> {
  const grouped: Partial<Record<AccountType, AccountWithStats[]>> = {};
  for (const t of ACCOUNT_TYPES_NAV) grouped[t] = [];

  for (const a of accounts) {
    const tk = (a.type as AccountType);
    const bucket: AccountType = tk === 'equity' ? 'fund_balance' : tk;
    if (!grouped[bucket]) grouped[bucket] = [];
    grouped[bucket]!.push(a);
  }

  return grouped;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; active?: string; tab?: string }>;
}) {
  const { role, orgId } = await getActiveOrg();
  const params = await searchParams;
  const canEdit = role === 'admin' || role === 'treasurer';

  const filterType = params.type && params.type !== 'all'
    ? (params.type as AccountType)
    : undefined;
  const activeOnly = params.active === 'true';

  const [{ data: accounts, error }, summary] = await Promise.all([
    getAccountsWithStats({
      type: filterType,
      activeOnly,
    }),
    getChartOfAccountsSummary(orgId),
  ]);

  const grouped = groupByType(accounts);
  const displayTypes = filterType ? [filterType] : ACCOUNT_TYPES_NAV;

  const cleanup = buildAccountCleanupSuggestions(accounts);
  const showCleanupTab = params.tab === 'cleanup';
  const assetDisplay = getDisplayAccountBalance(summary.totalAssetsPence, 'asset');
  const liabilityDisplay = getDisplayAccountBalance(summary.totalLiabilitiesPence, 'liability');
  const fundBalanceDisplay = getDisplayAccountBalance(summary.totalFundBalancePence, 'fund_balance');
  const incomeDisplay = getDisplayAccountBalance(summary.incomeYtdPence, 'income');
  const expenseDisplay = getDisplayAccountBalance(summary.expenseYtdPence, 'expense');

  return (
    <PageShell>
      <PageHeader
        title="Accounts"
        subtitle="Manage the financial categories used to record transactions and produce reports."
        actions={
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {canEdit ? (
              <>
                <Button asChild size="sm">
                  <Link href="/accounts/new">
                    <Plus size={14} className="mr-1" aria-hidden /> Add Account
                  </Link>
                </Button>
                <form action={importAccountTemplateAction} className="inline">
                  <input type="hidden" name="template_id" value="starter" />
                  <Button type="submit" variant="outline" size="sm">
                    Import starter template
                  </Button>
                </form>
              </>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href="/reports/trial-balance">
                <FileSpreadsheet size={14} className="mr-1" aria-hidden /> Trial Balance
              </Link>
            </Button>
          </div>
        }
      />

      <SoftAlert variant="info" icon={<Coins className="h-5 w-5 opacity-70" />}>
        <p className="font-medium">Accounts vs funds</p>
        <p className="text-xs mt-1 opacity-90">
          Funds show which pot of money applied. Accounts show how to categorise spending and income on the ledger.
          Balances are calculated from posted journal lines and cannot be manually overwritten.
        </p>
      </SoftAlert>

      {/* KPI (posted ledger) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Total assets"
          value={formatMoney(assetDisplay.displayAmountPence)}
          subtitle="Debit − credit, posted journals"
          href="/reports/balance-sheet"
          tint="amber"
          icon={<Wallet size={18} aria-hidden />}
        />
        <StatCard
          title="Total liabilities"
          value={formatMoney(liabilityDisplay.displayAmountPence)}
          subtitle="Amount owed"
          href="/reports/balance-sheet"
          tint="violet"
          icon={<Landmark size={18} aria-hidden />}
        />
        <StatCard
          title="Fund balances / reserves"
          value={formatMoney(fundBalanceDisplay.displayAmountPence)}
          subtitle="Restricted & unrestricted netting"
          href="/funds"
          tint="blue"
          icon={<Scale size={18} aria-hidden />}
        />
        <StatCard
          title="Income YTD"
          value={formatMoney(incomeDisplay.displayAmountPence)}
          subtitle="Income received this year"
          href="/reports/income-statement"
          tint="emerald"
          icon={<TrendingUp size={18} aria-hidden />}
        />
        <StatCard
          title="Expenses YTD"
          value={formatMoney(expenseDisplay.displayAmountPence)}
          subtitle="Spent this year"
          href="/reports/income-statement"
          tint="rose"
          icon={<TrendingDown size={18} aria-hidden />}
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant={!showCleanupTab ? 'default' : 'outline'} size="sm">
          <Link href="/accounts">All accounts</Link>
        </Button>
        <Button asChild variant={showCleanupTab ? 'default' : 'outline'} size="sm">
          <Link href="/accounts?tab=cleanup">Cleanup</Link>
        </Button>
      </div>

      {showCleanupTab && cleanup.length > 0 && (
        <Card className="border rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Suggested cleanups</CardTitle>
            <CardDescription>Heuristic checks across your chart ({cleanup.length}).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {cleanup.map((c) => (
              <div key={c.id} className="border-b pb-3 last:border-0">
                <p className="font-medium">{c.title}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{c.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!showCleanupTab && (
      <>
      {/* By-type counts */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {ACCOUNT_TYPES_NAV.map((t) => {
          const count = grouped[t]?.length ?? 0;
          return (
            <StatCard
              key={t}
              title={ACCOUNT_TYPE_LABELS[t]}
              value={count}
              subtitle={`${count === 1 ? 'account' : 'accounts'}`}
              href={`/accounts?type=${t}`}
              tint={TYPE_TINTS[t] ?? 'indigo'}
              icon={TYPE_ICONS[t] ?? <BookOpen size={18} />}
            />
          );
        })}
      </div>

      {/* Filters */}
      <FilterBar>
        <FilterBarLabel>Filter</FilterBarLabel>
        <Button
          asChild
          variant={!filterType ? 'default' : 'outline'}
          size="sm"
        >
          <Link href={activeOnly ? '/accounts?active=true' : '/accounts'}>All Types</Link>
        </Button>
        {ACCOUNT_TYPES_NAV.map((t) => (
          <Button
            key={t}
            asChild
            variant={filterType === t ? 'default' : 'outline'}
            size="sm"
          >
            <Link
              href={`/accounts?type=${t}${activeOnly ? '&active=true' : ''}`}
            >
              {ACCOUNT_TYPE_LABELS[t]}
            </Link>
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
                  ? `/accounts${filterType ? `?type=${filterType}` : ''}`
                  : `/accounts?${filterType ? `type=${filterType}&` : ''}active=true`
              }
            >
              {activeOnly ? 'Showing Active Only' : 'Show Active Only'}
            </Link>
          </Button>
        </div>
      </FilterBar>

      {error && (
        <SoftAlert variant="error">{error}</SoftAlert>
      )}

      {/* Grouped account sections */}
      {accounts.length > 0 ? (
        <div className="space-y-6">
          {displayTypes.map((type) => {
            const typeAccounts = grouped[type] ?? [];
            if (typeAccounts.length === 0) return null;

            const categories = new Map<string, AccountWithStats[]>();
            for (const a of typeAccounts) {
              const cat = a.reporting_category ?? 'Uncategorised';
              if (!categories.has(cat)) categories.set(cat, []);
              categories.get(cat)!.push(a);
            }

            const balanceColumnLabel = accountBalanceColumnLabel(type);

            return (
              <Card key={type} className={`gap-0 overflow-hidden rounded-3xl border-border/70 shadow-card ${TYPE_CARD_STYLES[type]}`}>
                <CardHeader className="border-b border-border/60 px-5 pb-4 pt-5">
                  <CardTitle className="flex items-center gap-3 text-base">
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${TYPE_ICON_STYLES[type]}`}>
                      {TYPE_ICONS[type]}
                    </span>
                    <span className="flex-1">{ACCOUNT_TYPE_LABELS[type]} Accounts</span>
                    <Badge variant="outline" className="text-xs font-normal">
                      {typeAccounts.length} {typeAccounts.length === 1 ? 'account' : 'accounts'}
                    </Badge>
                  </CardTitle>
                  {type === 'income' ? (
                    <CardDescription className="text-xs">
                      Income accounts are shown as positive income received, even though they are stored as credit balances in the ledger.
                    </CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="p-5">
                  <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/35 hover:bg-muted/35">
                          <TableHead className="w-[100px]">Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-center w-[80px]">Status</TableHead>
                          <TableHead className="text-right w-[100px]">Transactions</TableHead>
                          <TableHead className="text-right w-[150px]">{balanceColumnLabel}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Array.from(categories.entries()).map(([category, catAccounts]) => (
                          <Fragment key={`${type}-${category}`}>
                            {categories.size > 1 && (
                              <TableRow className="bg-muted/30 hover:bg-muted/30">
                                <TableCell
                                  colSpan={6}
                                  className="py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                                >
                                  {category}
                                </TableCell>
                              </TableRow>
                            )}
                            {catAccounts.map((account) => {
                              const balanceDisplay = getDisplayAccountBalance(account.balance_pence, account.type);
                              return (
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
                                    {balanceDisplay.isAbnormalBalance ? (
                                      <Badge variant="outline" className="ml-2 text-xs font-normal text-warning">
                                        Check balance
                                      </Badge>
                                    ) : null}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {account.reporting_category ?? '—'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <StatusBadge status={account.is_active ? 'active' : 'inactive'} />
                                  </TableCell>
                                  <TableCell className="text-right text-sm tabular-nums">
                                    {account.transaction_count}
                                  </TableCell>
                                  <TableCell className="text-right text-sm font-semibold tabular-nums">
                                    <span
                                      className={moneyToneClass(balanceDisplay.tone)}
                                      title={balanceDisplay.tooltip}
                                      aria-label={`${balanceDisplay.label}: ${formatMoney(balanceDisplay.displayAmountPence)}. ${balanceDisplay.tooltip}`}
                                    >
                                      {formatMoney(balanceDisplay.displayAmountPence)}
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
        <Card className="rounded-3xl border-border/70 bg-card shadow-card">
          <CardContent className="py-12 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              No accounts found.{' '}
              {canEdit && (
                <>
                  <Link href="/accounts/new" className="text-primary hover:underline">
                    Create one
                  </Link>{' '}
                  to get started, or use{' '}
                  <Link href="/onboarding/setup" className="text-primary hover:underline">
                    guided setup
                  </Link>
                  .
                </>
              )}
            </p>
          </CardContent>
        </Card>
      )}
      </>
      )}
    </PageShell>
  );
}
