import Link from 'next/link';
import { Fragment } from 'react';
import { AlertTriangle, Download, Plus, Settings2 } from 'lucide-react';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SHORT_MONTH_LABELS, formatRegisterPounds, monthStart } from '@/lib/registers/defaults';
import {
  createExpenseRegisterCategoryAction,
  createRegisterManualTransactionAction,
  getRegisterData,
  getRegisterDrillDown,
  reviewRegisterMappingAction,
} from '@/lib/registers/actions';
import type { RegisterGroupBy, RegisterReviewItem, RegisterRow, RegisterType, RegisterViewMode } from '@/lib/registers/types';

function registerPath(type: RegisterType) {
  return type === 'income' ? '/income/register' : '/expenses/register';
}

function reportPath(type: RegisterType, year: number) {
  return `/reports/income-expense-summary?year=${year}&register=${type}`;
}

const FILTER_SELECT_CLASS = 'h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs outline-none transition focus:border-primary/30 focus:ring-[3px] focus:ring-primary/10';
const FILTER_INPUT_CLASS = 'h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs outline-none transition placeholder:text-muted-foreground focus:border-primary/30 focus:ring-[3px] focus:ring-primary/10';

function cellValue(row: RegisterRow, monthIndex: number, mode: RegisterViewMode) {
  const cell = row.months[monthIndex];
  if (mode === 'budget') return cell.budgetPence;
  if (mode === 'variance') return cell.variancePence;
  return cell.actualPence;
}

function totalValue(row: RegisterRow, mode: RegisterViewMode) {
  if (mode === 'budget') return row.totalBudgetPence;
  if (mode === 'variance') return row.totalVariancePence;
  return row.totalActualPence;
}

function CellContent({ row, monthIndex, mode }: { row: RegisterRow; monthIndex: number; mode: RegisterViewMode }) {
  const cell = row.months[monthIndex];
  return (
    <div className="space-y-1 text-xs">
      <p className="font-medium text-foreground">{formatRegisterPounds(cellValue(row, monthIndex, mode))}</p>
      {mode !== 'actual' ? <p className="text-muted-foreground">Actual {formatRegisterPounds(cell.actualPence)}</p> : null}
      {mode !== 'budget' && cell.budgetPence > 0 ? <p className="text-muted-foreground">Budget {formatRegisterPounds(cell.budgetPence)}</p> : null}
      {cell.comparisonActualPence != null ? (
        <p className="text-muted-foreground">Prior {formatRegisterPounds(cell.comparisonActualPence)}</p>
      ) : null}
      {cell.unreconciledCount > 0 ? <Badge variant="outline">{cell.unreconciledCount} unreconciled</Badge> : null}
    </div>
  );
}

function groupRows(rows: RegisterRow[]) {
  const groups = new Map<string, RegisterRow[]>();
  for (const row of rows) {
    const key = row.groupName ?? 'Income';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()];
}

function totalsForRows(rows: RegisterRow[], monthIndex: number, mode: RegisterViewMode) {
  return rows.reduce((sum, row) => sum + cellValue(row, monthIndex, mode), 0);
}

function groupByLabel(option: RegisterGroupBy) {
  if (option === 'category') return 'Register category';
  if (option === 'supplier') return 'Supplier';
  if (option === 'account') return 'Account';
  return 'Fund';
}

function ReviewMappingHiddenFields({
  item,
  year,
  groupBy,
  registerType,
}: {
  item: RegisterReviewItem;
  year: number;
  groupBy: RegisterGroupBy;
  registerType: RegisterType;
}) {
  return (
    <>
      <input type="hidden" name="register_type" value={registerType} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="group_by" value={groupBy} />
      <input type="hidden" name="source_type" value={item.supplierId ? 'supplier' : 'account'} />
      <input type="hidden" name="source_id" value={item.supplierId ?? item.accountId} />
      <input type="hidden" name="account_id" value={item.accountId} />
      <input type="hidden" name="created_from_transaction_id" value={item.lineId} />
      <input type="hidden" name="description_pattern" value={item.description} />
      {item.supplierId ? <input type="hidden" name="supplier_id" value={item.supplierId} /> : null}
      {item.fundId ? <input type="hidden" name="fund_id" value={item.fundId} /> : null}
    </>
  );
}

async function loadReferenceData(registerType: RegisterType) {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const [{ data: accounts }, { data: funds }, { data: streams }, { data: categories }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('type', registerType)
      .eq('is_active', true)
      .order('code'),
    supabase
      .from('funds')
      .select('id, name, type')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
    registerType === 'income'
      ? supabase
          .from('income_streams')
          .select('id, name')
          .eq('organisation_id', orgId)
          .eq('status', 'active')
          .order('name')
      : Promise.resolve({ data: [] }),
    supabase
      .from('register_categories')
      .select('id, name, group_name, display_order')
      .eq('organisation_id', orgId)
      .eq('register_type', registerType)
      .eq('status', 'active')
      .order('display_order')
      .order('name'),
  ]);
  return { accounts: accounts ?? [], funds: funds ?? [], streams: streams ?? [], categories: categories ?? [] };
}

export async function RegisterPage({
  registerType,
  searchParams,
}: {
  registerType: RegisterType;
  searchParams: Promise<{
    year?: string;
    compare?: string;
    fundId?: string;
    mode?: RegisterViewMode;
    groupBy?: RegisterGroupBy;
    q?: string;
    includeUnreconciled?: string;
    showReversals?: string;
    category?: string;
    month?: string;
    error?: string;
    success?: string;
  }>;
}) {
  const params = await searchParams;
  const year = Number.parseInt(params.year ?? String(new Date().getFullYear()), 10) || new Date().getFullYear();
  const comparisonYear = params.compare ? Number.parseInt(params.compare, 10) : null;
  const mode: RegisterViewMode = params.mode === 'budget' || params.mode === 'variance' ? params.mode : 'actual';
  const groupBy: RegisterGroupBy = params.groupBy === 'supplier' || params.groupBy === 'account' || params.groupBy === 'fund'
    ? params.groupBy
    : 'category';
  const searchQuery = (params.q ?? '').trim().toLowerCase();
  const basePath = registerPath(registerType);
  const title = registerType === 'income' ? 'Income Register' : 'Expense Register';
  const subtitle = registerType === 'income'
    ? 'Track monthly income by register category, fund, and account.'
    : 'Track monthly spending by register category, supplier, fund, and account.';
  const showReversalJournals = params.showReversals === 'true';
  const dataResult = await getRegisterData({
    registerType,
    year,
    comparisonYear,
    fundId: params.fundId || null,
    groupBy,
    showReversalJournals,
  });
  const referenceData = await loadReferenceData(registerType);
  const drillDown = params.category && params.month
    ? await getRegisterDrillDown({
        registerType,
        year,
        month: Number.parseInt(params.month, 10),
        categoryId: params.category,
        fundId: params.fundId || null,
        groupBy,
        showReversalJournals,
      })
    : null;
  const data = dataResult.data;
  const visibleRows = data?.rows.filter((row) => {
    if (!searchQuery) return true;
    return `${row.name} ${row.groupName ?? ''}`.toLowerCase().includes(searchQuery);
  }) ?? [];
  const currentMonthIndex = Math.min(Math.max(new Date().getMonth(), 0), 11);
  const thisMonthPence = data?.monthlyTotals[currentMonthIndex]?.actualPence ?? 0;
  const largestRow = data?.rows
    .filter((row) => row.totalActualPence > 0)
    .sort((a, b) => b.totalActualPence - a.totalActualPence)[0];
  const reviewPence = data?.reviewItems.reduce((sum, item) => sum + item.amountPence, 0) ?? 0;
  const hasUncategorizedReviews = data?.reviewItems.some((item) => item.currentCategoryName === 'Uncategorized' || item.reason === 'No mapping found') ?? false;
  const overBudgetCount = data?.rows.filter((row) => row.totalBudgetPence > 0 && row.totalVariancePence > 0).length ?? 0;

  const withParam = (overrides: Record<string, string | null>) => {
    const next = new URLSearchParams();
    next.set('year', String(year));
    if (comparisonYear) next.set('compare', String(comparisonYear));
    if (params.fundId) next.set('fundId', params.fundId);
    next.set('mode', mode);
    next.set('groupBy', groupBy);
    if (params.q) next.set('q', params.q);
    if (params.includeUnreconciled) next.set('includeUnreconciled', params.includeUnreconciled);
    if (params.showReversals) next.set('showReversals', params.showReversals);
    for (const [key, value] of Object.entries(overrides)) {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    }
    return `${basePath}?${next.toString()}`;
  };

  return (
    <PageShell>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href="#add-from-register">
                <Plus size={14} className="mr-1" />
                Add {registerType === 'income' ? 'Income' : 'Expense'}
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="#configure-categories">
                <Settings2 size={14} className="mr-1" />
                Manage Register Categories
              </a>
            </Button>
            {data?.reviewItems.length ? (
              <Button asChild variant="outline">
                <a href="#review-uncategorized">Review Uncategorized</a>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={`/api/registers/export?type=${registerType}&year=${year}&groupBy=${groupBy}${params.fundId ? `&fundId=${params.fundId}` : ''}${comparisonYear ? `&compare=${comparisonYear}` : ''}`}>
                <Download size={14} className="mr-1" />
                Export CSV
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={reportPath(registerType, year)}>View Report</Link>
            </Button>
          </div>
        }
      />

      {params.error ? <div className="rounded-2xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">{params.error}</div> : null}
      {params.success ? <div className="rounded-2xl border border-success/20 bg-success-soft p-3 text-sm text-success">{params.success}</div> : null}
      {dataResult.error ? <div className="rounded-2xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">{dataResult.error}</div> : null}

      {data ? (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{registerType === 'expense' ? 'Total Expenses YTD' : 'Actual total'}</p>
                <p className="mt-2 text-2xl font-bold">{formatRegisterPounds(data.totals.actualPence)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{registerType === 'expense' ? 'Expenses This Month' : 'Budget total'}</p>
                <p className="mt-2 text-2xl font-bold">{formatRegisterPounds(registerType === 'expense' ? thisMonthPence : data.totals.budgetPence)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{registerType === 'expense' ? 'Largest Register Category' : 'Variance'}</p>
                <p className="mt-2 text-xl font-bold">{registerType === 'expense' ? (largestRow?.name ?? 'None yet') : formatRegisterPounds(data.totals.variancePence)}</p>
                {registerType === 'expense' && largestRow ? <p className="text-xs text-muted-foreground">{formatRegisterPounds(largestRow.totalActualPence)}</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Needs Register Category</p>
                <p className="mt-2 text-2xl font-bold">{registerType === 'expense' ? formatRegisterPounds(reviewPence) : data.unmappedAccountCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Over Budget Register Categories</p>
                <p className="mt-2 text-2xl font-bold">{overBudgetCount}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl border-border/70 bg-card shadow-card">
            <CardContent className="p-4">
              <form action={basePath} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Year</span>
                  <select name="year" defaultValue={year} className={FILTER_SELECT_CLASS}>
                    <option value={year - 1}>{year - 1}</option>
                    <option value={year}>{year}</option>
                    <option value={year + 1}>{year + 1}</option>
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Compare</span>
                  <select name="compare" defaultValue={comparisonYear ?? ''} className={FILTER_SELECT_CLASS}>
                    <option value="">No comparison</option>
                    <option value={year - 1}>{year - 1}</option>
                    <option value={year - 2}>{year - 2}</option>
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Fund</span>
                  <select name="fundId" defaultValue={params.fundId ?? ''} className={FILTER_SELECT_CLASS}>
                    <option value="">All funds</option>
                    {data.funds.map((fund) => (
                      <option key={fund.id} value={fund.id}>{fund.name}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Show</span>
                  <select name="mode" defaultValue={mode} className={FILTER_SELECT_CLASS}>
                    <option value="actual">Actual</option>
                    <option value="budget">Budget</option>
                    <option value="variance">Variance</option>
                  </select>
                </label>

                {registerType === 'expense' ? (
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">Group by</span>
                    <select name="groupBy" defaultValue={groupBy} className={FILTER_SELECT_CLASS}>
                      {(['category', 'supplier', 'account', 'fund'] as RegisterGroupBy[]).map((option) => (
                        <option key={option} value={option}>{groupByLabel(option)}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <input type="hidden" name="groupBy" value={groupBy} />
                )}

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Search</span>
                  <input
                    name="q"
                    defaultValue={params.q ?? ''}
                    className={FILTER_INPUT_CLASS}
                    placeholder="Search rows"
                  />
                </label>

                <div className="flex flex-col justify-end gap-2">
                  {registerType === 'expense' ? (
                    <label className="flex h-10 items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        name="includeUnreconciled"
                        value="true"
                        defaultChecked={params.includeUnreconciled === 'true'}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary/20"
                      />
                      Include unreconciled
                    </label>
                  ) : null}
                  <label className="flex h-10 items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      name="showReversals"
                      value="true"
                      defaultChecked={params.showReversals === 'true'}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary/20"
                    />
                    Show reversal journals
                  </label>
                  <Button type="submit" size="sm" className="h-10 rounded-xl">Apply filters</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {data.insights.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {data.insights.map((insight) => (
                <div key={insight} className="flex gap-2 rounded-2xl border border-warning/20 bg-warning-soft p-3 text-sm text-warning">
                  <AlertTriangle size={16} className="mt-0.5" />
                  {insight}
                </div>
              ))}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 min-w-[220px] bg-card">Row</TableHead>
                  {SHORT_MONTH_LABELS.map((month) => <TableHead key={month} className="min-w-[130px]">{month}</TableHead>)}
                  <TableHead className="sticky right-0 min-w-[130px] bg-card">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupRows(visibleRows).map(([groupName, rows]) => (
                  <Fragment key={groupName}>
                    {registerType === 'expense' ? (
                      <TableRow key={`${groupName}-group`} className="bg-muted/40">
                        <TableCell className="sticky left-0 z-10 bg-muted/40 font-semibold">{groupName}</TableCell>
                        {SHORT_MONTH_LABELS.map((month, index) => (
                          <TableCell key={month} className="font-semibold">{formatRegisterPounds(totalsForRows(rows, index, mode))}</TableCell>
                        ))}
                        <TableCell className="sticky right-0 bg-muted/40 font-semibold">
                          {formatRegisterPounds(rows.reduce((sum, row) => sum + totalValue(row, mode), 0))}
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {rows.map((row) => (
                      <TableRow key={row.categoryId}>
                        <TableCell className="sticky left-0 z-10 bg-card align-top">
                          <div className="font-medium">{row.name}</div>
                          {row.isUncategorized ? <Badge variant="outline">Needs mapping</Badge> : null}
                          {row.reviewCount > 0 ? <Badge variant="outline">{row.reviewCount} review</Badge> : null}
                        </TableCell>
                        {row.months.map((cell, index) => (
                          <TableCell key={cell.month} className="align-top">
                            <Link
                              className="block rounded-lg p-1 transition hover:bg-accent-soft"
                              href={withParam({ category: row.categoryId, month: String(cell.month) })}
                            >
                              <CellContent row={row} monthIndex={index} mode={mode} />
                            </Link>
                          </TableCell>
                        ))}
                        <TableCell className="sticky right-0 bg-card align-top font-semibold">
                          {formatRegisterPounds(totalValue(row, mode))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
                <TableRow className="bg-muted/40">
                  <TableCell className="sticky left-0 z-10 bg-muted/40 font-semibold">Monthly total</TableCell>
                  {data.monthlyTotals.map((cell) => (
                    <TableCell key={cell.month} className="font-semibold">
                      {formatRegisterPounds(mode === 'budget' ? cell.budgetPence : mode === 'variance' ? cell.variancePence : cell.actualPence)}
                    </TableCell>
                  ))}
                  <TableCell className="sticky right-0 bg-muted/40 font-semibold">
                    {formatRegisterPounds(mode === 'budget' ? data.totals.budgetPence : mode === 'variance' ? data.totals.variancePence : data.totals.actualPence)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {drillDown?.data ? (
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle>
                  {drillDown.data.categoryName} · {SHORT_MONTH_LABELS[drillDown.data.month - 1]} {year}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Total {formatRegisterPounds(drillDown.data.totalPence)}</p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Fund</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Receipt</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drillDown.data.items.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No transactions in this cell.</TableCell></TableRow>
                      ) : drillDown.data.items.map((item) => (
                        <TableRow key={`${item.journalId}-${item.description}`}>
                          <TableCell>{item.journalDate}</TableCell>
                          <TableCell>
                            <p className="font-medium">{item.description}</p>
                            {item.isReversalJournal ? (
                              <Badge variant="outline" className="mt-1 text-xs">Reversal (GL)</Badge>
                            ) : null}
                            <p className="text-xs text-muted-foreground">{item.accountName}{item.supplierName ? ` · ${item.supplierName}` : ''}{item.incomeStreamName ? ` · ${item.incomeStreamName}` : ''}</p>
                          </TableCell>
                          <TableCell>{item.fundName ?? 'No fund'}</TableCell>
                          <TableCell>{item.sourceType ?? 'journal'}</TableCell>
                          <TableCell>{item.hasAttachment ? 'Attached' : 'Not checked'}</TableCell>
                          <TableCell>{item.reconciliationStatus}</TableCell>
                          <TableCell className="text-right font-medium">{formatRegisterPounds(item.amountPence)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {data.reviewItems.length > 0 ? (
            <Card id="review-uncategorized">
              <CardHeader>
                <CardTitle>Review Uncategorized</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  These transactions have accounts but are not mapped to a register category yet. Map them once and the app will remember the rule for future transactions.
                </p>
                {hasUncategorizedReviews ? (
                  <div className="rounded-2xl border border-warning/20 bg-warning-soft p-4 text-sm text-warning">
                    <p className="font-medium">Uncategorized means the transaction has been recorded, but the register does not yet know which row to place it under.</p>
                    <p className="mt-1">Example: Service Charge may belong under Bank Charges.</p>
                  </div>
                ) : null}
                <div className="rounded-2xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Choose where this transaction should appear in the register. This does not change the original account or fund unless you choose to update them separately.
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Supplier / Description</TableHead>
                        <TableHead>Current category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Move to register category</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.reviewItems.slice(0, 10).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.journalDate}</TableCell>
                          <TableCell>
                            <p className="font-medium">{item.supplierName ?? item.description}</p>
                            <p className="text-xs text-muted-foreground">{item.accountName} · {item.reason}</p>
                            {item.suggestedCategoryName ? (
                              <p className="mt-1 text-xs font-medium text-primary">
                                Suggested: {item.suggestedCategoryName}
                                {item.suggestionReason ? <span className="font-normal text-muted-foreground"> · {item.suggestionReason}</span> : null}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell>{item.currentCategoryName}</TableCell>
                          <TableCell className="text-right">{formatRegisterPounds(item.amountPence)}</TableCell>
                          <TableCell>
                            <div className="min-w-[420px] space-y-2">
                              {item.suggestedCategoryId ? (
                                <form action={reviewRegisterMappingAction} className="flex items-center gap-2">
                                  <ReviewMappingHiddenFields item={item} year={year} groupBy={groupBy} registerType={registerType} />
                                  <input type="hidden" name="category_id" value={item.suggestedCategoryId} />
                                  <Button size="sm" type="submit" variant="outline">Use suggestion</Button>
                                </form>
                              ) : null}
                              <form action={reviewRegisterMappingAction} className="flex gap-2">
                                <ReviewMappingHiddenFields item={item} year={year} groupBy={groupBy} registerType={registerType} />
                                <select name="category_id" className="h-9 flex-1 rounded-md border bg-background px-2 text-xs" defaultValue={item.suggestedCategoryId ?? ''}>
                                  <option value="" disabled>Choose register category</option>
                                  {referenceData.categories.map((category) => (
                                    <option key={category.id} value={category.id}>
                                      {category.group_name ? `${category.group_name} · ` : ''}{category.name}
                                    </option>
                                  ))}
                                </select>
                                <Button size="sm" type="submit">Save mapping</Button>
                              </form>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card id="add-from-register">
              <CardHeader><CardTitle>Add {registerType === 'income' ? 'Income' : 'Expense'}</CardTitle></CardHeader>
              <CardContent>
                <form action={createRegisterManualTransactionAction} className="grid gap-3">
                  <input type="hidden" name="register_type" value={registerType} />
                  <input type="hidden" name="year" value={year} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input name="date" type="date" className="h-10 rounded-md border bg-background px-3 text-sm" defaultValue={monthStart(year, new Date().getMonth() + 1)} />
                    <input name="amount" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Amount e.g. 120.00" required />
                    <input name="description" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Description" required />
                    <input name="counterparty" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder={registerType === 'income' ? 'Payer' : 'Payee / supplier'} />
                    <select name="account_id" className="h-10 rounded-md border bg-background px-3 text-sm" required defaultValue="">
                      <option value="" disabled>Account</option>
                      {referenceData.accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
                    </select>
                    <select name="fund_id" className="h-10 rounded-md border bg-background px-3 text-sm" required defaultValue="">
                      <option value="" disabled>Fund</option>
                      {referenceData.funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
                    </select>
                  </div>
                  {registerType === 'income' ? (
                    <details className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                      <summary className="cursor-pointer text-sm font-medium">Advanced: income stream</summary>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Optional analytic grouping on the journal line. Restricted vs unrestricted reporting uses the fund and account above.
                      </p>
                      <select name="income_stream_id" className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" defaultValue="">
                        <option value="">No income stream</option>
                        {referenceData.streams.map((stream) => (
                          <option key={stream.id} value={stream.id}>{stream.name}</option>
                        ))}
                      </select>
                    </details>
                  ) : null}
                  <input name="reference" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Reference" />
                  <p className="text-xs text-muted-foreground">
                    This creates a real manual transaction awaiting bank match. Monthly totals are never edited directly.
                  </p>
                  <Button type="submit">Create Transaction</Button>
                </form>
              </CardContent>
            </Card>

            <Card id="configure-categories">
              <CardHeader><CardTitle>Manage Register Categories</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p className="text-muted-foreground">
                  Register categories are the visible rows in this register. Suppliers, descriptions, and accounts can map into these rows without changing posted journals.
                </p>
                {registerType === 'expense' ? (
                  <form action={createExpenseRegisterCategoryAction} className="grid gap-3">
                    <input type="hidden" name="year" value={year} />
                    <input name="name" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="New register category row" required />
                    <select name="group_name" className="h-10 rounded-md border bg-background px-3 text-sm" defaultValue="Other / Needs Review">
                      {[
                        'Staff & Payroll Costs',
                        'Premises & Building Costs',
                        'Office, Admin & Software',
                        'Ministry, Worship & Church Activities',
                        'Mission, Giving & External Support',
                        'Finance, Bank Charges & Loan Repayments',
                        'Other / Needs Review',
                      ].map((group) => <option key={group} value={group}>{group}</option>)}
                    </select>
                    <input name="display_order" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Display order e.g. 940" />
                    <input name="notes" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Notes" />
                    <Button type="submit" variant="outline">Create Register Category</Button>
                  </form>
                ) : (
                  <p className="text-muted-foreground">Income register category management uses the same register tables.</p>
                )}
                <div className="rounded-2xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Rename, reorder, archive, default account, and bank-rule update automation can build on the same audited register category/mapping actions.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
