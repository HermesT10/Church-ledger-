import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import {
  generateReconciliationCertificateFromForm,
  getBankAccountDetailData,
  getBankLines,
  linkBankAccountLedgerAccountFromForm,
  repairBankAccountLedgerLinkFromForm,
} from '@/lib/banking/actions';
import { resolveBankCardAppearance } from '@/lib/banking/cardAppearance';
import { getReconciliationCorrectionsForBankLines } from '@/lib/banking/reconciliation-corrections-queries';
import type {
  BankingDirectionFilter,
  BankingTransactionStatusFilter,
} from '@/lib/banking/types';
import {
  AlertCircle,
  ArrowLeft,
  ClipboardCheck,
  FileText,
  Landmark,
  ListChecks,
  Scale,
  ScrollText,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageShell } from '@/components/page-shell';
import { SearchInput } from '@/components/ui/search-input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BankRuleForm } from '../bank-rule-form';
import { BankLineActions } from './bank-line-actions';
import { BankLineCorrectionsCell } from './bank-line-corrections-cell';
import { BankCardAppearanceForm } from './bank-card-appearance-form';
import { StatementDeleteAction } from './statement-delete-action';

const TABS = [
  ['overview', 'Overview'],
  ['transactions', 'Transactions'],
  ['statements', 'Statements'],
  ['reconciliation', 'Reconciliation'],
  ['rules', 'Rules'],
  ['documents', 'Documents'],
  ['audit', 'Audit History'],
] as const;

type BankAccountTab = (typeof TABS)[number][0];

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return 'Not yet';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPounds(pence: number | null | undefined): string {
  if (pence == null) return 'Not linked';
  const sign = pence < 0 ? '-' : '';
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

function formatOptionalPounds(pence: number | null | undefined): string {
  if (pence == null) return '—';
  const sign = pence < 0 ? '-' : '';
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

function formatTime(time: string | null | undefined): string | null {
  if (!time) return null;
  return time.slice(0, 5);
}

function transactionTitle(line: {
  display_description?: string | null;
  description: string | null;
  reference: string | null;
}): string {
  return (
    line.display_description?.trim() ||
    line.description?.trim() ||
    line.reference?.trim() ||
    'Imported bank transaction'
  );
}

function movementLabel(amountPence: number): string {
  return amountPence < 0
    ? `Money out ${formatPounds(Math.abs(amountPence))}`
    : `Money in ${formatPounds(amountPence)}`;
}

function parseMoneyToPence(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : undefined;
}

function statusLabel(
  status: string | null | undefined,
  allocated: boolean,
  reconciled: boolean
): string {
  if (reconciled) return 'Reconciled';
  if (!allocated) return 'Needs matching';
  return status ? status.replaceAll('_', ' ') : 'Imported from statement';
}

function tabHref(bankAccountId: string, tab: BankAccountTab): string {
  return `/banking/${bankAccountId}?tab=${tab}`;
}

export default async function BankAccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankAccountId: string }>;
  searchParams: Promise<{
    tab?: string;
    page?: string;
    status?: string;
    direction?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    amountMin?: string;
    amountMax?: string;
  }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const { bankAccountId } = await params;
  const sp = await searchParams;
  const activeTab = TABS.some(([tab]) => tab === sp.tab)
    ? (sp.tab as BankAccountTab)
    : 'overview';
  const canEdit = role === 'admin' || role === 'treasurer';

  const detailResult = await getBankAccountDetailData(bankAccountId);
  if (!detailResult.data) notFound();
  const detail = detailResult.data;
  const bankAccount = detail.account;

  const page = parseInt(sp.page || '1', 10);
  const status = (sp.status as BankingTransactionStatusFilter) || 'all';
  const direction = (sp.direction as BankingDirectionFilter) || 'all';
  const amountMinInputPence = parseMoneyToPence(sp.amountMin);
  const amountMaxInputPence = parseMoneyToPence(sp.amountMax);
  const amountMinPence =
    direction === 'out' && amountMaxInputPence != null
      ? -amountMaxInputPence
      : amountMinInputPence;
  const amountMaxPence =
    direction === 'out' && amountMinInputPence != null
      ? -amountMinInputPence
      : amountMaxInputPence;

  const supabase = await createClient();
  const [{ data: accounts }, { data: funds }, { data: suppliers }] =
    await Promise.all([
      supabase
        .from('accounts')
        .select('id, code, name, type, subtype')
        .eq('organisation_id', orgId)
        .eq('is_active', true)
        .eq('available_in_reconciliation', true)
        .order('code'),
      supabase
        .from('funds')
        .select('id, name')
        .eq('organisation_id', orgId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('suppliers')
        .select('id, name')
        .eq('organisation_id', orgId)
        .eq('is_active', true)
        .order('name'),
    ]);
  const ledgerLink = detail.linked_ledger_account;
  const eligibleLedgerAccounts = (accounts ?? []).filter((account) => {
    if (account.type !== 'asset') return false;
    if (!account.subtype) return true;
    return [
      'bank',
      'cash',
      'current',
      'current_account',
      'savings',
      'savings_account',
      'clearing',
    ].includes(account.subtype.toLowerCase());
  });

  const { data: paginatedData, error: linesError } = await getBankLines({
    bankAccountId,
    page,
    pageSize: 50,
    status,
    direction,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    search: sp.search,
    amountMinPence,
    amountMaxPence,
  });
  const { lines, total, totalPages } = paginatedData;

  const correctionsByLine =
    lines.length > 0
      ? await getReconciliationCorrectionsForBankLines(
          orgId,
          lines.map((l) => l.id)
        )
      : new Map();

  function transactionUrl(overrides: Record<string, string | undefined>) {
    const base: Record<string, string> = { tab: 'transactions' };
    for (const key of [
      'status',
      'direction',
      'dateFrom',
      'dateTo',
      'search',
      'amountMin',
      'amountMax',
      'page',
    ] as const) {
      const value = sp[key];
      if (value && value !== 'all') base[key] = value;
    }
    const merged = { ...base, ...overrides };
    const clean = Object.entries(merged).filter(
      ([, value]) => value && value !== 'all'
    );
    return `/banking/${bankAccountId}?${new URLSearchParams(clean as [string, string][]).toString()}`;
  }

  const maskedAccount =
    bankAccount.masked_account_number ||
    (bankAccount.account_number_last4
      ? `•••• ${bankAccount.account_number_last4}`
      : 'No account number');
  const cardAppearance = resolveBankCardAppearance(bankAccount);
  const detailMetrics = [
    {
      title: 'Bank balance',
      value: formatPounds(bankAccount.statement_balance_pence),
      subtitle: 'Latest statement balance',
      href: tabHref(bankAccountId, 'overview'),
      icon: <Landmark size={16} />,
      tone: 'bg-success-soft text-success',
    },
    {
      title: 'Book balance',
      value: formatPounds(bankAccount.book_balance_pence),
      subtitle: 'Linked ledger balance',
      href: tabHref(bankAccountId, 'overview'),
      icon: <Scale size={16} />,
      tone: 'bg-info-soft text-info',
    },
    {
      title: 'Difference',
      value: formatPounds(bankAccount.difference_pence),
      subtitle: 'Bank minus book',
      href: tabHref(bankAccountId, 'reconciliation'),
      icon: <AlertCircle size={16} />,
      tone:
        bankAccount.difference_pence === 0
          ? 'bg-success-soft text-success'
          : 'bg-warning-soft text-warning',
    },
    {
      title: 'Needs matching',
      value: bankAccount.unreconciled_count,
      subtitle: 'Unreconciled lines',
      href: transactionUrl({ status: 'needs_matching', page: undefined }),
      icon: <ListChecks size={16} />,
      tone: 'bg-warning-soft text-warning',
    },
  ];

  return (
    <PageShell>
      <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card">
        <div
          className="relative overflow-hidden px-5 py-6 sm:px-6"
          data-bank-card-theme={cardAppearance.theme}
          style={{
            backgroundColor: cardAppearance.background,
            color: cardAppearance.foreground,
          }}
        >
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/10" />
          <div className="absolute -bottom-24 right-20 h-48 w-48 rounded-full bg-white/10" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <Button
                asChild
                variant="secondary"
                size="sm"
                className="mb-5 border border-current/15 bg-white/15 text-current hover:bg-white/20"
              >
                <Link href="/banking">
                  <ArrowLeft size={14} className="mr-1.5" />
                  Back to Banking
                </Link>
              </Button>
              <p className="text-sm font-medium opacity-75">
                {bankAccount.bank_name || 'Bank account'}
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">
                {bankAccount.name}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <Badge className="border-current/20 bg-white/15 text-current">
                  {bankAccount.currency ?? 'GBP'}
                </Badge>
                <Badge className="border-current/20 bg-white/15 text-current">
                  {bankAccount.account_type?.replaceAll('_', ' ') ?? 'Current'}
                </Badge>
                <Badge className="border-current/20 bg-white/15 text-current">
                  {maskedAccount}
                </Badge>
                <Badge
                  className={
                    bankAccount.linked_account_id
                      ? 'border-success/20 bg-success-soft text-success'
                      : 'border-warning/20 bg-warning-soft text-warning'
                  }
                >
                  {bankAccount.linked_account_id
                    ? 'Ledger account linked'
                    : 'No ledger account'}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <>
                  <Button
                    asChild
                    className="bg-white text-slate-950 hover:bg-white/90"
                  >
                    <Link href={`/banking/${bankAccountId}/import`}>
                      <Upload size={16} className="mr-1.5" />
                      Upload Statement
                    </Link>
                  </Button>
                  <BankRuleForm
                    accounts={[{ id: bankAccount.id, name: bankAccount.name }]}
                    bankAccountId={bankAccount.id}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {detailMetrics.map((metric) => (
          <Link
            key={metric.title}
            href={metric.href}
            className="group flex min-h-[112px] flex-col justify-between rounded-2xl border border-border/70 bg-card p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {metric.title}
                </p>
                <p className="mt-2 truncate text-xl font-bold tracking-tight text-foreground">
                  {metric.value}
                </p>
              </div>
              <span
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}
              >
                {metric.icon}
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {metric.subtitle}
            </p>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-card p-2">
        {TABS.map(([tab, label]) => (
          <Button
            key={tab}
            asChild
            variant={activeTab === tab ? 'default' : 'ghost'}
            size="sm"
          >
            <Link href={tabHref(bankAccountId, tab)}>{label}</Link>
          </Button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <BankCardAppearanceForm
            bankAccountId={bankAccountId}
            accountName={bankAccount.name}
            bankName={bankAccount.bank_name}
            maskedAccount={maskedAccount}
            currency={bankAccount.currency}
            balanceLabel={formatPounds(bankAccount.statement_balance_pence)}
            cardTheme={bankAccount.card_theme}
            cardColour={bankAccount.card_colour}
            canEdit={canEdit}
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.45fr)]">
            <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    Overview
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Core account details used for imports and reconciliation.
                  </p>
                </div>
                <Landmark className="h-5 w-5 text-muted-foreground/60" />
              </div>
              <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <dt className="text-sm text-muted-foreground">Last import</dt>
                  <dd className="mt-1 font-semibold">
                    {formatDate(bankAccount.last_import_at)}
                  </dd>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <dt className="text-sm text-muted-foreground">
                    Last reconciled date
                  </dt>
                  <dd className="mt-1 font-semibold">
                    {formatDate(bankAccount.last_reconciled_date)}
                  </dd>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <dt className="text-sm text-muted-foreground">
                    Account type
                  </dt>
                  <dd className="mt-1 font-semibold capitalize">
                    {bankAccount.account_type?.replaceAll('_', ' ') ??
                      'Current'}
                  </dd>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <dt className="text-sm text-muted-foreground">
                    Linked ledger account
                  </dt>
                  <dd className="mt-1 font-semibold">
                    {detail.linked_ledger_account_name ?? 'Not linked'}
                  </dd>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <dt className="text-sm text-muted-foreground">Sort code</dt>
                  <dd className="mt-1 font-mono font-semibold">
                    {bankAccount.sort_code ?? '—'}
                  </dd>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <dt className="text-sm text-muted-foreground">
                    Masked account
                  </dt>
                  <dd className="mt-1 font-mono font-semibold">
                    {bankAccount.masked_account_number ??
                      bankAccount.account_number_last4 ??
                      '—'}
                  </dd>
                </div>
              </dl>
              <div
                className={`mt-6 rounded-2xl border p-4 ${
                  ledgerLink?.status === 'linked'
                    ? 'border-success/20 bg-success-soft/40'
                    : 'border-warning/30 bg-warning-soft/40'
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold">Accounting Link</h3>
                    {ledgerLink?.status === 'linked' ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Linked to {ledgerLink.code ? `${ledgerLink.code} ` : ''}
                        {ledgerLink.name}
                        {ledgerLink.subtype
                          ? ` (${ledgerLink.type} / ${ledgerLink.subtype.replaceAll('_', ' ')})`
                          : ` (${ledgerLink.type})`}
                        .
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {ledgerLink?.message ??
                          'This bank account must be linked before reconciliation and posting.'}
                      </p>
                    )}
                  </div>
                  <Badge
                    className={
                      ledgerLink?.status === 'linked'
                        ? 'border-success/20 bg-success-soft text-success'
                        : 'border-warning/20 bg-warning-soft text-warning'
                    }
                  >
                    {ledgerLink?.status === 'linked'
                      ? 'Linked'
                      : ledgerLink?.status === 'invalid'
                        ? 'Broken link'
                        : 'Missing link'}
                  </Badge>
                </div>
                {canEdit && ledgerLink?.status !== 'linked' && (
                  <div className="mt-4 grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)]">
                    <form action={repairBankAccountLedgerLinkFromForm}>
                      <input
                        type="hidden"
                        name="bankAccountId"
                        value={bankAccountId}
                      />
                      <Button type="submit" size="sm">
                        Create ledger account
                      </Button>
                    </form>
                    {eligibleLedgerAccounts.length > 0 && (
                      <form
                        action={linkBankAccountLedgerAccountFromForm}
                        className="flex flex-col gap-2 sm:flex-row"
                      >
                        <input
                          type="hidden"
                          name="bankAccountId"
                          value={bankAccountId}
                        />
                        <select
                          name="linkedAccountId"
                          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                          required
                        >
                          <option value="">Link existing account</option>
                          {eligibleLedgerAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.code} {account.name}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" variant="outline" size="sm">
                          Repair link
                        </Button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    Cash-control status
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Reconciliation confidence for this account.
                  </p>
                </div>
                <ShieldCheck className="h-5 w-5 text-muted-foreground/60" />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Every balance here is either clickable or explained: bank
                balance comes from statements, book balance comes from the
                linked ledger account, and difference shows what still needs
                investigation.
              </p>
              <div className="mt-6 rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Progress</p>
                    <p className="mt-1 text-4xl font-bold tracking-tight">
                      {detail.reconciliation.progress_percent}%
                    </p>
                  </div>
                  <Badge
                    className={
                      detail.reconciliation.unreconciled_count > 0
                        ? 'border-warning/20 bg-warning-soft text-warning'
                        : 'border-success/20 bg-success-soft text-success'
                    }
                  >
                    {detail.reconciliation.unreconciled_count > 0
                      ? 'Needs matching'
                      : 'Reconciled'}
                  </Badge>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${detail.reconciliation.progress_percent}%`,
                    }}
                  />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-border/60 px-4 py-3">
                  <p className="text-muted-foreground">Needs matching</p>
                  <p className="mt-1 font-semibold tabular-nums">
                    {detail.reconciliation.unreconciled_count}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 px-4 py-3">
                  <p className="text-muted-foreground">Reconciled</p>
                  <p className="mt-1 font-semibold tabular-nums">
                    {detail.reconciliation.reconciled_count}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'transactions' && (
        <div className="space-y-4">
          <form
            action={`/banking/${bankAccountId}`}
            method="get"
            className="rounded-2xl border border-border/70 bg-card p-4"
          >
            <input type="hidden" name="tab" value="transactions" />
            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
              <SearchInput
                name="search"
                defaultValue={sp.search ?? ''}
                placeholder="Search description/reference"
              />
              <input
                name="dateFrom"
                type="date"
                defaultValue={sp.dateFrom ?? ''}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
              <input
                name="dateTo"
                type="date"
                defaultValue={sp.dateTo ?? ''}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
              <select
                name="status"
                defaultValue={status}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="needs_matching">Needs matching</option>
                <option value="unmatched">Unmatched</option>
                <option value="matched">Matched</option>
                <option value="reconciled">Reconciled</option>
                <option value="duplicate">Duplicate</option>
                <option value="needs_review">Needs review</option>
              </select>
              <select
                name="direction"
                defaultValue={direction}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">Money in/out</option>
                <option value="in">Money in</option>
                <option value="out">Money out</option>
              </select>
              <input
                name="amountMin"
                inputMode="decimal"
                defaultValue={sp.amountMin ?? ''}
                placeholder="Min amount"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              />
              <div className="flex gap-2">
                <input
                  name="amountMax"
                  inputMode="decimal"
                  defaultValue={sp.amountMax ?? ''}
                  placeholder="Max amount"
                  className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                />
                <Button type="submit">Filter</Button>
              </div>
            </div>
          </form>

          {linesError && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {linesError}
            </div>
          )}

          {lines.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Movement</TableHead>
                    <TableHead className="text-right">Money in</TableHead>
                    <TableHead className="text-right">Money out</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Suggested Match</TableHead>
                    <TableHead className="whitespace-nowrap">
                      Corrections
                    </TableHead>
                    {canEdit && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="whitespace-nowrap font-mono text-sm">
                        {formatDate(line.txn_date)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-sm">
                        {formatTime(line.transaction_time) ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[340px]">
                        <div className="truncate font-medium">
                          {transactionTitle(line)}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {!line.description?.trim() && (
                            <Badge
                              variant="outline"
                              className="border-warning/20 bg-warning-soft text-warning"
                            >
                              Missing description
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {[
                              formatDate(line.txn_date),
                              formatTime(line.transaction_time),
                              line.status?.replaceAll('_', ' ') ?? 'unmatched',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {line.reference || '—'}
                      </TableCell>
                      <TableCell
                        className={
                          line.amount_pence < 0
                            ? 'text-right font-medium text-foreground'
                            : 'text-right font-medium text-success'
                        }
                      >
                        {movementLabel(line.amount_pence)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-success">
                        {line.amount_pence > 0
                          ? formatPounds(line.amount_pence)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-foreground">
                        {line.amount_pence < 0
                          ? formatPounds(Math.abs(line.amount_pence))
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        Balance {formatOptionalPounds(line.balance_pence)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {statusLabel(
                            line.status,
                            line.allocated,
                            line.reconciled
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {line.suggested_match_label ??
                          line.matched_record_label ??
                          'No suggested match yet'}
                      </TableCell>
                      <TableCell>
                        <BankLineCorrectionsCell
                          corrections={correctionsByLine.get(line.id) ?? []}
                        />
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <BankLineActions
                            line={line}
                            accounts={accounts ?? []}
                            funds={funds ?? []}
                            suppliers={suppliers ?? []}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-10 text-center">
              <Landmark className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No transactions match these filters.
              </p>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Showing {(page - 1) * 50 + 1}-{Math.min(page * 50, total)} of{' '}
                {total} transactions
              </span>
              <div className="flex gap-1">
                {page > 1 && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={transactionUrl({ page: String(page - 1) })}>
                      Previous
                    </Link>
                  </Button>
                )}
                {page < totalPages && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={transactionUrl({ page: String(page + 1) })}>
                      Next
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'statements' && (
        <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
          {detail.statements.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File name</TableHead>
                  <TableHead>Date range</TableHead>
                  <TableHead>Uploaded by</TableHead>
                  <TableHead>Uploaded at</TableHead>
                  <TableHead className="text-right">Rows detected</TableHead>
                  <TableHead className="text-right">Rows imported</TableHead>
                  <TableHead className="text-right">Unreconciled</TableHead>
                  <TableHead className="text-right">Reconciled</TableHead>
                  <TableHead className="text-right">
                    Duplicates skipped
                  </TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Warnings</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.statements.map((statement) => (
                  <TableRow key={statement.id}>
                    <TableCell className="max-w-[280px] truncate font-medium">
                      {statement.file_name}
                    </TableCell>
                    <TableCell>
                      {statement.statement_start_date ?? '—'} to{' '}
                      {statement.statement_end_date ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {statement.uploaded_by ?? '—'}
                    </TableCell>
                    <TableCell>{formatDate(statement.uploaded_at)}</TableCell>
                    <TableCell className="text-right">
                      {statement.rows_detected}
                    </TableCell>
                    <TableCell className="text-right">
                      {statement.rows_imported}
                    </TableCell>
                    <TableCell className="text-right">
                      {statement.unreconciled_rows ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      {statement.reconciled_rows ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      {statement.duplicates_skipped}
                    </TableCell>
                    <TableCell className="text-right">
                      {statement.errors_count}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {statement.status.replaceAll('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {statement.statement_warnings.length > 0 ? (
                        <div className="space-y-1">
                          {statement.statement_warnings.map((warning) => (
                            <Badge
                              key={`${statement.id}-${warning.type}`}
                              variant="outline"
                              className="border-warning/20 bg-warning-soft text-warning"
                            >
                              {warning.type.replaceAll('_', ' ')}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          None
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link
                            href={`/banking/${bankAccountId}/imports/${statement.id}`}
                          >
                            Details
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/banking/${bankAccountId}/import`}>
                            Upload Statement
                          </Link>
                        </Button>
                        <form
                          action={generateReconciliationCertificateFromForm}
                        >
                          <input
                            type="hidden"
                            name="bankAccountId"
                            value={bankAccountId}
                          />
                          <input
                            type="hidden"
                            name="statementImportId"
                            value={statement.id}
                          />
                          <Button type="submit" variant="outline" size="sm">
                            Generate Certificate
                          </Button>
                        </form>
                        {canEdit && (
                          <StatementDeleteAction
                            bankAccountId={bankAccountId}
                            importId={statement.id}
                            fileName={statement.file_name}
                            reconciledRows={statement.reconciled_rows ?? 0}
                            postedRows={statement.posted_rows ?? 0}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-10 text-center">
              <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No statements imported yet.
              </p>
              {canEdit && (
                <Button asChild className="mt-4">
                  <Link href={`/banking/${bankAccountId}/import`}>
                    Upload Statement
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'reconciliation' && (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="font-semibold">Reconciliation progress</h2>
            <p className="mt-2 text-4xl font-bold">
              {detail.reconciliation.progress_percent}%
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {detail.reconciliation.unreconciled_count} needs matching ·{' '}
              {detail.reconciliation.reconciled_count} reconciled
            </p>
            <Button asChild className="mt-4">
              <Link href="/reconciliation">
                <ClipboardCheck size={16} className="mr-1.5" />
                Open reconciliation workspace
              </Link>
            </Button>
          </div>
          {detail.certificates.length > 0 && (
            <div className="rounded-2xl border border-border/70 bg-card p-5 lg:col-span-2">
              <h2 className="font-semibold">Reconciliation certificates</h2>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Certificate</TableHead>
                      <TableHead>Statement period</TableHead>
                      <TableHead className="text-right">Bank balance</TableHead>
                      <TableHead className="text-right">Book balance</TableHead>
                      <TableHead className="text-right">Difference</TableHead>
                      <TableHead className="text-right">Exceptions</TableHead>
                      <TableHead>Export</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.certificates.map((certificate) => (
                      <TableRow key={certificate.id}>
                        <TableCell className="font-medium">
                          {certificate.certificate_number}
                        </TableCell>
                        <TableCell>
                          {certificate.statement_period_start ?? '—'} to{' '}
                          {certificate.statement_period_end}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatPounds(certificate.closing_bank_balance_pence)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatPounds(certificate.book_balance_pence)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatPounds(certificate.difference_pence)}
                        </TableCell>
                        <TableCell className="text-right">
                          {certificate.unreconciled_exception_count}
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="outline" size="sm">
                            <Link
                              href={`/api/banking/reconciliation-certificates/${certificate.id}/pdf`}
                            >
                              PDF
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="font-semibold">Unreconciled bank lines</h2>
            <div className="mt-4 space-y-3">
              {detail.reconciliation.recent_unreconciled_lines.length > 0 ? (
                detail.reconciliation.recent_unreconciled_lines.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-center justify-between rounded-xl border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{transactionTitle(line)}</p>
                      <p className="text-muted-foreground">
                        {[
                          formatDate(line.txn_date),
                          formatTime(line.transaction_time),
                          line.reference ?? 'No reference',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Balance {formatOptionalPounds(line.balance_pence)}
                      </p>
                    </div>
                    <p
                      className={
                        line.amount_pence < 0
                          ? 'font-mono text-foreground'
                          : 'font-mono text-success'
                      }
                    >
                      {movementLabel(line.amount_pence)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  All visible transactions are reconciled.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="rounded-2xl border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">Bank rules</h2>
              <p className="text-sm text-muted-foreground">
                Rules suggest matches for recurring statement descriptions.
              </p>
            </div>
            {canEdit && (
              <BankRuleForm
                accounts={[{ id: bankAccount.id, name: bankAccount.name }]}
                bankAccountId={bankAccount.id}
              />
            )}
          </div>
          {detail.rules.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      {rule.condition_type.replaceAll('_', ' ')}{' '}
                      {rule.condition_value ?? ''}
                    </TableCell>
                    <TableCell>
                      {rule.direction ? `Money ${rule.direction}` : 'Either'}
                    </TableCell>
                    <TableCell>
                      {rule.transaction_type.replaceAll('_', ' ')}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          rule.status === 'active' ? 'default' : 'secondary'
                        }
                      >
                        {rule.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No rules yet.
            </div>
          )}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <ScrollText className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 font-medium">Documents</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Uploaded statement files are stored privately as evidence and listed
            in the Statements tab.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={tabHref(bankAccountId, 'statements')}>
              View Statements
            </Link>
          </Button>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="rounded-2xl border border-border/70 bg-card">
          {detail.audit_events.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.audit_events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{formatDate(event.created_at)}</TableCell>
                    <TableCell className="font-medium">
                      {event.action.replaceAll('_', ' ')}
                    </TableCell>
                    <TableCell>{event.entity_type ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {event.user_id ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-10 text-center">
              <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No account audit events found yet.
              </p>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
