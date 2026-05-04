'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import { invalidateOrgReportCache } from '@/lib/cache';
import { getActiveOrg } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { enforcePortalPermissionForContext } from '@/lib/portal-permissions';
import { MONTH_KEYS } from '@/lib/budgets/budgetMath';
import { netRegisterAmount } from './calculate';
import type {
  RegisterCategoryMappingRow,
  RegisterCategoryRow,
  RegisterData,
  RegisterDrillDownData,
  RegisterDrillDownItem,
  RegisterFundFilter,
  RegisterGroupBy,
  RegisterMonthCell,
  RegisterReviewItem,
  RegisterRow,
  RegisterType,
} from './types';

interface AccountRef {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  reporting_category: string | null;
}

interface JournalRef {
  id: string;
  journal_date: string;
  memo: string | null;
  source_type: string | null;
  source_id: string | null;
  created_by: string | null;
  reversal_of: string | null;
}

interface LineRef {
  id: string;
  journal_id: string;
  account_id: string;
  fund_id: string | null;
  income_stream_id: string | null;
  supplier_id: string | null;
  description: string | null;
  debit_pence: number;
  credit_pence: number;
}

interface EnrichedLine extends LineRef {
  journal: JournalRef;
  account: AccountRef;
  month: number;
  amountPence: number;
  bankTransactionId: string | null;
  donorId: string | null;
  lettingsHirerId: string | null;
}

interface SupplierRef {
  id: string;
  name: string;
}

interface CategoryLike {
  id: string;
  organisation_id: string;
  register_type: RegisterType;
  name: string;
  group_name: string | null;
  display_order: number;
  status: 'active' | 'archived';
  default_account_id: string | null;
  default_fund_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const UNCATEGORIZED_ID = 'uncategorized';

function clean(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function penceFromForm(value: FormDataEntryValue | null): number {
  const raw = String(value ?? '0').replace(/[£,]/g, '').trim();
  return Math.round((Number.parseFloat(raw || '0') || 0) * 100);
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function registerPath(type: RegisterType): string {
  return type === 'income' ? '/income/register' : '/expenses/register';
}

function emptyCell(month: number): RegisterMonthCell {
  return {
    month,
    actualPence: 0,
    budgetPence: 0,
    variancePence: 0,
    comparisonActualPence: null,
    comparisonVariancePence: null,
    unreconciledCount: 0,
  };
}

function mappingSpecificity(mapping: RegisterCategoryMappingRow): number {
  return [
    mapping.account_id,
    mapping.income_stream_id,
    mapping.supplier_id,
    mapping.donor_id,
    mapping.lettings_hirer_id,
    mapping.payroll_component,
    mapping.fund_id,
    mapping.bank_rule_id,
    mapping.description_pattern,
  ].filter(Boolean).length;
}

function mappingMatches(mapping: RegisterCategoryMappingRow, line: EnrichedLine): boolean {
  const lineText = normalize(`${line.description ?? ''} ${line.journal.memo ?? ''} ${line.account.code} ${line.account.name}`);
  return (
    (!mapping.register_type || mapping.register_type === line.account.type) &&
    (!mapping.account_id || mapping.account_id === line.account_id) &&
    (!mapping.income_stream_id || mapping.income_stream_id === line.income_stream_id) &&
    (!mapping.supplier_id || mapping.supplier_id === line.supplier_id) &&
    (!mapping.donor_id || mapping.donor_id === line.donorId) &&
    (!mapping.lettings_hirer_id || mapping.lettings_hirer_id === line.lettingsHirerId) &&
    (!mapping.fund_id || mapping.fund_id === line.fund_id) &&
    (!mapping.payroll_component || normalize(line.journal.source_type).includes('payroll')) &&
    (!mapping.description_pattern || lineText.includes(normalize(mapping.description_pattern)))
  );
}

function compareMappings(a: RegisterCategoryMappingRow, b: RegisterCategoryMappingRow): number {
  return (
    Number(a.priority ?? 100) - Number(b.priority ?? 100) ||
    mappingSpecificity(b) - mappingSpecificity(a) ||
    new Date(b.reviewed_at ?? b.created_at).getTime() - new Date(a.reviewed_at ?? a.created_at).getTime()
  );
}

function fallbackCategoryId(line: EnrichedLine, categoriesByName: Map<string, CategoryLike>): string {
  if (line.journal.reversal_of) {
    return categoriesByName.get(normalize('Other'))?.id ?? UNCATEGORIZED_ID;
  }
  const accountText = normalize(`${line.account.code} ${line.account.name} ${line.account.subtype ?? ''} ${line.account.reporting_category ?? ''}`);
  const supplierText = normalize(line.supplier_id ?? '');
  const sourceType = normalize(line.journal.source_type);

  const pick = (name: string) => categoriesByName.get(normalize(name))?.id ?? UNCATEGORIZED_ID;

  if (line.account.type === 'income') {
    if (accountText.includes('letting') || accountText.includes('hall hire') || sourceType.includes('lettings')) return pick('Lettings');
    if (accountText.includes('gift aid')) return pick('Gift Aid');
    if (accountText.includes('giving') || accountText.includes('donation') || accountText.includes('tithe')) return pick('Giving');
    if (accountText.includes('offering')) return pick('Offering');
    if (accountText.includes('grant') || accountText.includes('funding')) return pick('URC Funding');
    if (accountText.includes('event') || accountText.includes('fundraising')) return pick('Events');
    if (accountText.includes('cafe')) return pick('Cafe');
    return categoriesByName.get(normalize('Other'))?.id ?? UNCATEGORIZED_ID;
  }

  if (sourceType.includes('payroll')) {
    if (accountText.includes('salary') || accountText.includes('salaries')) return pick('Salary');
    if (accountText.includes('pension')) return pick('Pension');
    return pick('Other payroll costs');
  }
  if (accountText.includes('salary') || accountText.includes('salaries')) return pick('Salary');
  if (accountText.includes('pension')) return pick('Pension');
  if (accountText.includes('insurance')) return pick('Insurance');
  if (accountText.includes('service charge') || accountText.includes('bank charge')) return pick('Service Charge');
  if (accountText.includes('software') || accountText.includes('subscription')) return pick('Other');
  if (supplierText) {
    for (const category of categoriesByName.values()) {
      if (normalize(category.name) === supplierText) return category.id;
    }
  }
  return categoriesByName.get(normalize('Other'))?.id ?? UNCATEGORIZED_ID;
}

function chooseCategoryId(
  line: EnrichedLine,
  mappings: RegisterCategoryMappingRow[],
  categoriesByName: Map<string, CategoryLike>,
): string {
  const matches = mappings
    .filter((mapping) => mappingMatches(mapping, line))
    .sort(compareMappings);
  return matches[0]?.register_category_id ?? fallbackCategoryId(line, categoriesByName);
}

function matchingMappingForLine(
  line: EnrichedLine,
  mappings: RegisterCategoryMappingRow[],
): RegisterCategoryMappingRow | null {
  const matches = mappings
    .filter((mapping) => mappingMatches(mapping, line))
    .sort(compareMappings);
  return matches[0] ?? null;
}

function suggestedCategoryForLine(
  line: EnrichedLine,
  supplierName: string | null,
  categoriesByName: Map<string, CategoryLike>,
): { id: string; name: string; reason: string } | null {
  const text = normalize(`${line.description ?? ''} ${line.journal.memo ?? ''} ${line.account.code} ${line.account.name} ${line.account.subtype ?? ''} ${line.account.reporting_category ?? ''} ${supplierName ?? ''}`);
  const pick = (names: string[], reason: string) => {
    for (const name of names) {
      const category = categoriesByName.get(normalize(name));
      if (category) return { id: category.id, name: category.name, reason };
    }
    return null;
  };

  if (line.account.type === 'income') {
    if (text.includes('hmrc') || text.includes('gift aid')) return pick(['Gift Aid'], 'HMRC or Gift Aid wording');
    if (text.includes('letting') || text.includes('hall hire') || text.includes('rent')) return pick(['Lettings'], 'Lettings wording');
    if (text.includes('donation') || text.includes('giving') || text.includes('offering') || text.includes('tithe')) return pick(['Giving', 'Offering'], 'Giving wording');
    if (text.includes('cafe')) return pick(['Cafe'], 'Cafe wording');
    if (text.includes('grant') || text.includes('funding')) return pick(['Grants', 'URC Funding', 'Other Income', 'Other'], 'Grant or funding wording');
    return pick(['Other Income', 'Other'], 'Income fallback');
  }

  if (text.includes('service charge') || text.includes('bank charge') || text.includes('bank fee')) return pick(['Bank Charges'], 'Bank charge wording');
  if (text.includes('castle water') || text.includes('affinity water') || text.includes('water')) return pick(['Water', 'Utilities'], 'Water supplier or description');
  if (text.includes('valda') || text.includes('utility') || text.includes('electric') || text.includes('gas')) return pick(['Utilities'], 'Utility wording');
  if (text.includes('viking')) return pick(['Office Supplies', 'Stationery'], 'Known office supplier');
  if (text.includes('zoom')) return pick(['Video Conferencing', 'Software Subscriptions'], 'Known software supplier');
  if (text.includes('klenze') || text.includes('cleaning')) return pick(['Cleaning'], 'Cleaning wording');
  if (text.includes('software') || text.includes('subscription') || text.includes('google cloud')) return pick(['Software Subscriptions', 'Cloud Storage'], 'Software wording');
  if (text.includes('insurance')) return pick(['Insurance'], 'Insurance wording');
  return null;
}

function groupKeyForLine(line: EnrichedLine, groupBy: RegisterGroupBy, categoryId: string): string {
  if (groupBy === 'supplier') return `supplier:${line.supplier_id ?? 'none'}`;
  if (groupBy === 'account') return `account:${line.account_id}`;
  if (groupBy === 'fund') return `fund:${line.fund_id ?? 'none'}`;
  return categoryId;
}

function groupLabelForKey(params: {
  key: string;
  groupBy: RegisterGroupBy;
  categoriesById: Map<string, CategoryLike>;
  supplierMap: Map<string, string>;
  fundMap: Map<string, string>;
  accountMap: Map<string, AccountRef>;
}): { name: string; groupName: string | null; displayOrder: number; sourceId: string | null } {
  if (params.groupBy === 'category') {
    const category = params.categoriesById.get(params.key);
    return {
      name: category?.name ?? 'Uncategorized',
      groupName: category?.group_name ?? 'Other / Needs Review',
      displayOrder: category?.display_order ?? 999,
      sourceId: category?.id ?? null,
    };
  }

  const [prefix, rawId] = params.key.split(':');
  const sourceId = rawId === 'none' ? null : rawId;
  if (prefix === 'supplier') {
    return {
      name: sourceId ? (params.supplierMap.get(sourceId) ?? 'Unknown supplier') : 'No supplier',
      groupName: 'Supplier',
      displayOrder: sourceId ? 100 : 999,
      sourceId,
    };
  }
  if (prefix === 'account') {
    const account = sourceId ? params.accountMap.get(sourceId) : null;
    return {
      name: account ? `${account.code} ${account.name}` : 'Unknown account',
      groupName: 'Account',
      displayOrder: account?.code ? Number.parseInt(account.code.replace(/\D/g, ''), 10) || 100 : 999,
      sourceId,
    };
  }
  return {
    name: sourceId ? (params.fundMap.get(sourceId) ?? 'Unknown fund') : 'No fund',
    groupName: 'Fund',
    displayOrder: sourceId ? 100 : 999,
    sourceId,
  };
}

function isReviewCategory(category: CategoryLike | undefined): boolean {
  if (!category) return true;
  return (
    normalize(category.group_name).includes('needs review') ||
    normalize(category.name).includes('needs review') ||
    normalize(category.name).includes('uncategorized')
  );
}

async function fetchPostedLines(params: {
  orgId: string;
  registerType: RegisterType;
  year: number;
  fundId?: string | null;
  /** When false (default), journals created as posted reversals (reversal_of set) are omitted. */
  includeReversalJournals?: boolean;
}): Promise<{ lines: EnrichedLine[]; funds: RegisterFundFilter[]; error: string | null }> {
  const supabase = await createClient();
  const [{ data: journals, error: journalError }, { data: funds }] = await Promise.all([
    supabase
      .from('journals')
      .select('id, journal_date, memo, source_type, source_id, created_by, reversal_of')
      .eq('organisation_id', params.orgId)
      .eq('status', 'posted')
      .gte('journal_date', `${params.year}-01-01`)
      .lte('journal_date', `${params.year}-12-31`),
    supabase
      .from('funds')
      .select('id, name, type')
      .eq('organisation_id', params.orgId)
      .eq('is_active', true)
      .order('name'),
  ]);

  if (journalError) return { lines: [], funds: [], error: journalError.message };
  const includeReversals = params.includeReversalJournals === true;
  const journalRows = (journals ?? []) as JournalRef[];
  const journalsForLines = includeReversals
    ? journalRows
    : journalRows.filter((j) => !j.reversal_of);

  if (!journalsForLines.length) {
    return { lines: [], funds: (funds ?? []) as RegisterFundFilter[], error: null };
  }

  const journalIds = journalsForLines.map((journal) => journal.id);
  const journalMap = new Map(journalsForLines.map((journal) => [journal.id, journal]));
  let lineQuery = supabase
    .from('journal_lines')
    .select('id, journal_id, account_id, fund_id, income_stream_id, supplier_id, description, debit_pence, credit_pence')
    .eq('organisation_id', params.orgId)
    .in('journal_id', journalIds);
  if (params.fundId) lineQuery = lineQuery.eq('fund_id', params.fundId);

  const { data: rawLines, error: lineError } = await lineQuery;
  if (lineError) return { lines: [], funds: (funds ?? []) as RegisterFundFilter[], error: lineError.message };
  if (!rawLines || rawLines.length === 0) {
    return { lines: [], funds: (funds ?? []) as RegisterFundFilter[], error: null };
  }

  const accountIds = [...new Set(rawLines.map((line) => line.account_id).filter(Boolean))] as string[];
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name, type, subtype, reporting_category')
    .eq('organisation_id', params.orgId)
    .in('id', accountIds)
    .eq('type', params.registerType);

  const accountMap = new Map((accounts ?? []).map((account) => [account.id, account as AccountRef]));
  const relevantLines = (rawLines as LineRef[]).filter((line) => accountMap.has(line.account_id));

  const relevantJournalIds = [...new Set(relevantLines.map((line) => line.journal_id))];
  const [{ data: donations }, { data: lettingsPayments }, { data: manualTransactions }] = await Promise.all([
    supabase
      .from('donations')
      .select('journal_id, donor_id, bank_transaction_id')
      .eq('organisation_id', params.orgId)
      .in('journal_id', relevantJournalIds),
    supabase
      .from('lettings_payments')
      .select('posted_journal_id, hirer_id, bank_transaction_id')
      .eq('organisation_id', params.orgId)
      .in('posted_journal_id', relevantJournalIds),
    supabase
      .from('manual_transactions')
      .select('posted_journal_id, matched_bank_transaction_id')
      .eq('organisation_id', params.orgId)
      .in('posted_journal_id', relevantJournalIds),
  ]);

  const donationMap = new Map((donations ?? []).map((row) => [row.journal_id, row]));
  const lettingsMap = new Map((lettingsPayments ?? []).map((row) => [row.posted_journal_id, row]));
  const manualMap = new Map((manualTransactions ?? []).map((row) => [row.posted_journal_id, row]));

  const lines: EnrichedLine[] = relevantLines.map((line) => {
    const journal = journalMap.get(line.journal_id)!;
    const donation = donationMap.get(line.journal_id);
    const lettings = lettingsMap.get(line.journal_id);
    const manual = manualMap.get(line.journal_id);
    return {
      ...line,
      journal,
      account: accountMap.get(line.account_id)!,
      month: new Date(`${journal.journal_date}T00:00:00Z`).getUTCMonth() + 1,
      amountPence: netRegisterAmount(params.registerType, Number(line.debit_pence), Number(line.credit_pence)),
      bankTransactionId: lettings?.bank_transaction_id ?? donation?.bank_transaction_id ?? manual?.matched_bank_transaction_id ?? null,
      donorId: donation?.donor_id ?? null,
      lettingsHirerId: lettings?.hirer_id ?? null,
    };
  });

  return { lines, funds: (funds ?? []) as RegisterFundFilter[], error: null };
}

async function loadRegisterCategories(orgId: string, registerType: RegisterType): Promise<CategoryLike[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('register_categories')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('register_type', registerType)
    .eq('status', 'active')
    .order('display_order')
    .order('name');
  const rows = (data ?? []) as RegisterCategoryRow[];
  return rows;
}

async function loadMappings(orgId: string): Promise<RegisterCategoryMappingRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('register_category_mappings')
    .select('*')
    .eq('organisation_id', orgId);
  return (data ?? []) as RegisterCategoryMappingRow[];
}

async function loadBudgetByCategory(params: {
  orgId: string;
  year: number;
  fundId?: string | null;
  categoriesByName: Map<string, CategoryLike>;
  mappings: RegisterCategoryMappingRow[];
  registerType: RegisterType;
}): Promise<Record<string, number[]>> {
  const supabase = await createClient();
  const { data: budgets } = await supabase
    .from('budgets')
    .select('id')
    .eq('organisation_id', params.orgId)
    .eq('year', params.year)
    .in('status', ['approved', 'draft'])
    .order('status', { ascending: true })
    .order('version_number', { ascending: false })
    .limit(1);
  const budgetId = budgets?.[0]?.id;
  if (!budgetId) return {};

  let query = supabase
    .from('budget_lines')
    .select('account_id, fund_id, m01_pence, m02_pence, m03_pence, m04_pence, m05_pence, m06_pence, m07_pence, m08_pence, m09_pence, m10_pence, m11_pence, m12_pence')
    .eq('budget_id', budgetId);
  if (params.fundId) query = query.eq('fund_id', params.fundId);
  const { data: lines } = await query;
  if (!lines || lines.length === 0) return {};

  const accountIds = [...new Set(lines.map((line) => line.account_id).filter(Boolean))] as string[];
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name, type, subtype, reporting_category')
    .eq('organisation_id', params.orgId)
    .in('id', accountIds)
    .eq('type', params.registerType);
  const accountMap = new Map((accounts ?? []).map((account) => [account.id, account as AccountRef]));

  const totals: Record<string, number[]> = {};
  for (const line of lines) {
    const account = accountMap.get(line.account_id);
    if (!account) continue;
    const fakeLine: EnrichedLine = {
      id: `budget:${line.account_id}:${line.fund_id ?? 'all'}`,
      journal_id: '',
      account_id: line.account_id,
      fund_id: line.fund_id ?? null,
      income_stream_id: null,
      supplier_id: null,
      description: null,
      debit_pence: 0,
      credit_pence: 0,
      journal: { id: '', journal_date: `${params.year}-01-01`, memo: null, source_type: null, source_id: null, created_by: null, reversal_of: null },
      account,
      month: 1,
      amountPence: 0,
      bankTransactionId: null,
      donorId: null,
      lettingsHirerId: null,
    };
    const categoryId = chooseCategoryId(fakeLine, params.mappings, params.categoriesByName);
    if (!totals[categoryId]) totals[categoryId] = Array(12).fill(0);
    MONTH_KEYS.forEach((key, index) => {
      totals[categoryId][index] += Number(line[key] ?? 0);
    });
  }
  return totals;
}

async function loadBudgetByGroup(params: {
  orgId: string;
  year: number;
  fundId?: string | null;
  groupBy: RegisterGroupBy;
  categoriesByName: Map<string, CategoryLike>;
  mappings: RegisterCategoryMappingRow[];
  registerType: RegisterType;
}): Promise<Record<string, number[]>> {
  if (params.groupBy === 'category') {
    return loadBudgetByCategory(params);
  }
  if (params.groupBy === 'supplier') return {};

  const supabase = await createClient();
  const { data: budgets } = await supabase
    .from('budgets')
    .select('id')
    .eq('organisation_id', params.orgId)
    .eq('year', params.year)
    .in('status', ['approved', 'draft'])
    .order('status', { ascending: true })
    .order('version_number', { ascending: false })
    .limit(1);
  const budgetId = budgets?.[0]?.id;
  if (!budgetId) return {};

  let query = supabase
    .from('budget_lines')
    .select('account_id, fund_id, m01_pence, m02_pence, m03_pence, m04_pence, m05_pence, m06_pence, m07_pence, m08_pence, m09_pence, m10_pence, m11_pence, m12_pence')
    .eq('budget_id', budgetId);
  if (params.fundId) query = query.eq('fund_id', params.fundId);
  const { data: lines } = await query;
  if (!lines?.length) return {};

  const accountIds = [...new Set(lines.map((line) => line.account_id).filter(Boolean))] as string[];
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, type')
    .eq('organisation_id', params.orgId)
    .in('id', accountIds)
    .eq('type', params.registerType);
  const validAccounts = new Set((accounts ?? []).map((account) => account.id));
  const totals: Record<string, number[]> = {};

  for (const line of lines) {
    if (!validAccounts.has(line.account_id)) continue;
    const key = params.groupBy === 'account'
      ? `account:${line.account_id}`
      : `fund:${line.fund_id ?? 'none'}`;
    if (!totals[key]) totals[key] = Array(12).fill(0);
    MONTH_KEYS.forEach((monthKey, index) => {
      totals[key][index] += Number(line[monthKey] ?? 0);
    });
  }

  return totals;
}

export async function getRegisterData(params: {
  registerType: RegisterType;
  year: number;
  comparisonYear?: number | null;
  fundId?: string | null;
  groupBy?: RegisterGroupBy;
  /** Include posted reversal journals in actuals (default false). */
  showReversalJournals?: boolean;
}): Promise<{ data: RegisterData | null; error: string | null }> {
  const ctx = await getActiveOrg();
  const { orgId } = ctx;
  await enforcePortalPermissionForContext(ctx, params.registerType === 'income' ? 'income_register' : 'expense_register', 'view');
  const groupBy = params.groupBy ?? 'category';
  const [categories, mappings, posted, comparisonPosted] = await Promise.all([
    loadRegisterCategories(orgId, params.registerType),
    loadMappings(orgId),
    fetchPostedLines({
      orgId,
      registerType: params.registerType,
      year: params.year,
      fundId: params.fundId,
      includeReversalJournals: params.showReversalJournals === true,
    }),
    params.comparisonYear
      ? fetchPostedLines({
          orgId,
          registerType: params.registerType,
          year: params.comparisonYear,
          fundId: params.fundId,
          includeReversalJournals: params.showReversalJournals === true,
        })
      : Promise.resolve({ lines: [], funds: [] as RegisterFundFilter[], error: null }),
  ]);

  if (posted.error) return { data: null, error: posted.error };
  if (comparisonPosted.error) return { data: null, error: comparisonPosted.error };

  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const categoriesByName = new Map(categories.map((category) => [normalize(category.name), category]));
  const relevantMappings = mappings.filter((mapping) => categoriesById.has(mapping.register_category_id));
  const budgetByCategory = await loadBudgetByGroup({
    orgId,
    year: params.year,
    fundId: params.fundId,
    groupBy,
    categoriesByName,
    mappings: relevantMappings,
    registerType: params.registerType,
  });

  const actuals: Record<string, number[]> = {};
  const comparisonActuals: Record<string, number[]> = {};
  const uncategorizedAccounts = new Set<string>();
  const reviewCounts: Record<string, number> = {};
  const reviewItems: RegisterReviewItem[] = [];

  const supplierIds = [...new Set([
    ...posted.lines.map((line) => line.supplier_id).filter(Boolean),
    ...comparisonPosted.lines.map((line) => line.supplier_id).filter(Boolean),
  ])] as string[];
  const supabase = await createClient();
  const { data: suppliers } = supplierIds.length
    ? await supabase.from('suppliers').select('id, name').eq('organisation_id', orgId).in('id', supplierIds)
    : { data: [] as SupplierRef[] };
  const supplierMap = new Map((suppliers ?? []).map((supplier) => [supplier.id, supplier.name]));
  const fundMap = new Map(posted.funds.map((fund) => [fund.id, fund.name]));
  const accountMap = new Map([
    ...posted.lines.map((line) => [line.account_id, line.account] as const),
    ...comparisonPosted.lines.map((line) => [line.account_id, line.account] as const),
  ]);

  for (const line of posted.lines) {
    const categoryId = chooseCategoryId(line, relevantMappings, categoriesByName);
    if (categoryId === UNCATEGORIZED_ID) uncategorizedAccounts.add(line.account_id);
    const key = groupKeyForLine(line, groupBy, categoryId);
    if (!actuals[key]) actuals[key] = Array(12).fill(0);
    actuals[key][line.month - 1] += line.amountPence;

    const mapping = matchingMappingForLine(line, relevantMappings);
    const category = categoriesById.get(categoryId);
    if (mapping?.needs_review || categoryId === UNCATEGORIZED_ID || isReviewCategory(category)) {
      reviewCounts[key] = (reviewCounts[key] ?? 0) + 1;
      if (reviewItems.length < 25) {
        const supplierName = line.supplier_id ? (supplierMap.get(line.supplier_id) ?? null) : null;
        const suggestion = suggestedCategoryForLine(line, supplierName, categoriesByName);
        reviewItems.push({
          id: `${line.id}:${line.journal_id}`,
          lineId: line.id,
          month: line.month,
          journalId: line.journal_id,
          journalDate: line.journal.journal_date,
          description: line.description ?? line.journal.memo ?? line.account.name,
          amountPence: line.amountPence,
          accountId: line.account_id,
          accountName: `${line.account.code} ${line.account.name}`,
          supplierId: line.supplier_id,
          supplierName,
          fundId: line.fund_id,
          fundName: line.fund_id ? (fundMap.get(line.fund_id) ?? null) : null,
          currentCategoryId: categoryId,
          currentCategoryName: category?.name ?? 'Uncategorized',
          suggestedCategoryId: suggestion?.id ?? null,
          suggestedCategoryName: suggestion?.name ?? null,
          suggestionReason: suggestion?.reason ?? null,
          reason: mapping?.needs_review
            ? 'Mapping needs review'
            : categoryId === UNCATEGORIZED_ID
              ? 'No mapping found'
              : 'Register category is in Other / Needs Review',
          confidence: mapping?.mapping_confidence ?? 'low',
        });
      }
    }
  }

  for (const line of comparisonPosted.lines) {
    const categoryId = chooseCategoryId(line, relevantMappings, categoriesByName);
    const key = groupKeyForLine(line, groupBy, categoryId);
    if (!comparisonActuals[key]) comparisonActuals[key] = Array(12).fill(0);
    comparisonActuals[key][line.month - 1] += line.amountPence;
  }

  const rowIds = new Set<string>([
    ...(groupBy === 'category' ? categories.map((category) => category.id) : []),
    ...Object.keys(actuals),
    ...Object.keys(budgetByCategory),
  ]);
  if (groupBy === 'category' && uncategorizedAccounts.size > 0) rowIds.add(UNCATEGORIZED_ID);

  const rows: RegisterRow[] = [...rowIds].map((id) => {
    const label = groupLabelForKey({
      key: id,
      groupBy,
      categoriesById,
      supplierMap,
      fundMap,
      accountMap,
    });
    const months = Array.from({ length: 12 }, (_, index) => {
      const actualPence = actuals[id]?.[index] ?? 0;
      const budgetPence = budgetByCategory[id]?.[index] ?? 0;
      const comparisonActualPence = params.comparisonYear ? (comparisonActuals[id]?.[index] ?? 0) : null;
      return {
        ...emptyCell(index + 1),
        actualPence,
        budgetPence,
        variancePence: actualPence - budgetPence,
        comparisonActualPence,
        comparisonVariancePence: comparisonActualPence == null ? null : actualPence - comparisonActualPence,
      };
    });
    const totalActualPence = months.reduce((sum, month) => sum + month.actualPence, 0);
    const totalBudgetPence = months.reduce((sum, month) => sum + month.budgetPence, 0);
    return {
      categoryId: id,
      name: label.name,
      groupName: label.groupName,
      displayOrder: label.displayOrder,
      isUncategorized: id === UNCATEGORIZED_ID || label.name === 'No supplier' || label.name === 'No fund',
      months,
      totalActualPence,
      totalBudgetPence,
      totalVariancePence: totalActualPence - totalBudgetPence,
      comparisonTotalActualPence: params.comparisonYear
        ? months.reduce((sum, month) => sum + (month.comparisonActualPence ?? 0), 0)
        : null,
      reviewCount: reviewCounts[id] ?? 0,
      sourceType: groupBy,
      sourceId: label.sourceId,
    };
  }).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));

  const monthlyTotals = Array.from({ length: 12 }, (_, index) => {
    const actualPence = rows.reduce((sum, row) => sum + row.months[index].actualPence, 0);
    const budgetPence = rows.reduce((sum, row) => sum + row.months[index].budgetPence, 0);
    const comparisonActualPence = params.comparisonYear
      ? rows.reduce((sum, row) => sum + (row.months[index].comparisonActualPence ?? 0), 0)
      : null;
    return {
      ...emptyCell(index + 1),
      actualPence,
      budgetPence,
      variancePence: actualPence - budgetPence,
      comparisonActualPence,
      comparisonVariancePence: comparisonActualPence == null ? null : actualPence - comparisonActualPence,
    };
  });

  const totalActual = monthlyTotals.reduce((sum, month) => sum + month.actualPence, 0);
  const totalBudget = monthlyTotals.reduce((sum, month) => sum + month.budgetPence, 0);
  const insights: string[] = [];
  const currentMonth = new Date().getMonth();
  const current = monthlyTotals[currentMonth]?.actualPence ?? 0;
  const prior = monthlyTotals[currentMonth - 1]?.actualPence ?? 0;
  if (prior > 0 && current < prior * 0.65 && params.registerType === 'income') insights.push('Income dropped sharply compared with the previous month.');
  if (prior > 0 && current > prior * 1.35 && params.registerType === 'expense') insights.push('Expenses increased sharply compared with the previous month.');
  if (uncategorizedAccounts.size > 0) insights.push(`${uncategorizedAccounts.size} unmapped account${uncategorizedAccounts.size === 1 ? '' : 's'} appear in Uncategorized.`);
  if (reviewItems.length > 0) insights.push(`${reviewItems.length} ${params.registerType} item${reviewItems.length === 1 ? '' : 's'} need register category review.`);
  if (rows.some((row) => normalize(row.name).includes('payroll') && prior > 0 && current > prior * 1.35) && params.registerType === 'expense') {
    insights.push('Payroll increased sharply compared with the previous month.');
  }
  if (rows.some((row) => row.totalVariancePence > Math.max(10_000, row.totalBudgetPence * 0.15) && row.totalBudgetPence > 0)) {
    insights.push('One or more categories are over budget.');
  }
  if (rows.some((row) => normalize(row.name).includes('loan') && row.reviewCount > 0)) {
    insights.push('Loan repayment mappings need review for interest and liability split.');
  }
  if (rows.some((row) => row.name === 'Gift Aid' && row.totalActualPence === 0) && rows.some((row) => row.name === 'Giving' && row.totalActualPence > 0)) {
    insights.push('Gift Aid is zero while Giving has posted activity.');
  }

  return {
    data: {
      registerType: params.registerType,
      year: params.year,
      comparisonYear: params.comparisonYear ?? null,
      fundId: params.fundId ?? null,
      groupBy,
      funds: posted.funds,
      rows,
      monthlyTotals,
      totals: {
        actualPence: totalActual,
        budgetPence: totalBudget,
        variancePence: totalActual - totalBudget,
        comparisonActualPence: params.comparisonYear
          ? monthlyTotals.reduce((sum, month) => sum + (month.comparisonActualPence ?? 0), 0)
          : null,
      },
      insights,
      unmappedAccountCount: uncategorizedAccounts.size,
      reviewItems,
    },
    error: null,
  };
}

export async function getRegisterDrillDown(params: {
  registerType: RegisterType;
  year: number;
  month: number;
  categoryId: string;
  fundId?: string | null;
  groupBy?: RegisterGroupBy;
  showReversalJournals?: boolean;
}): Promise<{ data: RegisterDrillDownData | null; error: string | null }> {
  const ctx = await getActiveOrg();
  const { orgId } = ctx;
  await enforcePortalPermissionForContext(ctx, params.registerType === 'income' ? 'income_register' : 'expense_register', 'view');
  const groupBy = params.groupBy ?? 'category';
  const [categories, mappings, posted] = await Promise.all([
    loadRegisterCategories(orgId, params.registerType),
    loadMappings(orgId),
    fetchPostedLines({
      orgId,
      registerType: params.registerType,
      year: params.year,
      fundId: params.fundId,
      includeReversalJournals: params.showReversalJournals === true,
    }),
  ]);
  if (posted.error) return { data: null, error: posted.error };

  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const categoriesByName = new Map(categories.map((category) => [normalize(category.name), category]));
  const relevantMappings = mappings.filter((mapping) => categoriesById.has(mapping.register_category_id));
  const supplierIds = [...new Set(posted.lines.map((line) => line.supplier_id).filter(Boolean))] as string[];
  const streamIds = [...new Set(posted.lines.map((line) => line.income_stream_id).filter(Boolean))] as string[];
  const bankIds = [...new Set(posted.lines.map((line) => line.bankTransactionId).filter(Boolean))] as string[];
  const supabase = await createClient();
  const [{ data: suppliers }, { data: streams }, { data: banks }, { data: funds }] = await Promise.all([
    supplierIds.length ? supabase.from('suppliers').select('id, name').in('id', supplierIds) : Promise.resolve({ data: [] }),
    streamIds.length ? supabase.from('income_streams').select('id, name').in('id', streamIds) : Promise.resolve({ data: [] }),
    bankIds.length ? supabase.from('bank_lines').select('id, status, reconciled, allocated').in('id', bankIds) : Promise.resolve({ data: [] }),
    supabase.from('funds').select('id, name').eq('organisation_id', orgId),
  ]);

  const supplierMap = new Map((suppliers ?? []).map((supplier) => [supplier.id, supplier.name]));
  const streamMap = new Map((streams ?? []).map((stream) => [stream.id, stream.name]));
  const bankMap = new Map((banks ?? []).map((bank) => [bank.id, bank]));
  const fundMap = new Map((funds ?? []).map((fund) => [fund.id, fund.name]));
  const accountMap = new Map(posted.lines.map((line) => [line.account_id, line.account]));
  const label = groupLabelForKey({
    key: params.categoryId,
    groupBy,
    categoriesById,
    supplierMap,
    fundMap,
    accountMap,
  });

  const items: RegisterDrillDownItem[] = posted.lines
    .filter((line) => line.month === params.month)
    .filter((line) => {
      const categoryId = chooseCategoryId(line, relevantMappings, categoriesByName);
      return groupKeyForLine(line, groupBy, categoryId) === params.categoryId;
    })
    .map((line) => {
      const bank = line.bankTransactionId ? bankMap.get(line.bankTransactionId) : null;
      const categoryId = chooseCategoryId(line, relevantMappings, categoriesByName);
      const mapping = matchingMappingForLine(line, relevantMappings);
      return {
        journalId: line.journal_id,
        journalDate: line.journal.journal_date,
        description: line.description ?? line.journal.memo ?? line.account.name,
        memo: line.journal.memo,
        accountName: line.account.name,
        fundName: line.fund_id ? (fundMap.get(line.fund_id) ?? null) : null,
        amountPence: line.amountPence,
        sourceType: line.journal.source_type,
        sourceId: line.journal.source_id,
        bankTransactionId: line.bankTransactionId,
        reconciliationStatus: bank?.reconciled ? 'reconciled' : bank?.allocated ? 'allocated' : bank ? (bank.status ?? 'unmatched') : 'posted journal',
        isReversalJournal: Boolean(line.journal.reversal_of),
        attachmentStatus: 'not checked',
        createdBy: line.journal.created_by,
        supplierName: line.supplier_id ? (supplierMap.get(line.supplier_id) ?? null) : null,
        supplierId: line.supplier_id,
        incomeStreamName: line.income_stream_id ? (streamMap.get(line.income_stream_id) ?? null) : null,
        accountId: line.account_id,
        fundId: line.fund_id,
        hasAttachment: false,
        mappingNeedsReview: Boolean(mapping?.needs_review) || categoryId === UNCATEGORIZED_ID || isReviewCategory(categoriesById.get(categoryId)),
      };
    })
    .sort((a, b) => b.journalDate.localeCompare(a.journalDate));

  return {
    data: {
      registerType: params.registerType,
      year: params.year,
      month: params.month,
      categoryName: label.name,
      totalPence: items.reduce((sum, item) => sum + item.amountPence, 0),
      items,
    },
    error: null,
  };
}

function parseRegisterType(value: FormDataEntryValue | string | null): RegisterType {
  return value === 'expense' ? 'expense' : 'income';
}

function redirectWithRegisterError(registerType: RegisterType, year: number, message: string, groupBy?: string): never {
  const groupParam = groupBy ? `&groupBy=${encodeURIComponent(groupBy)}` : '';
  redirect(`${registerPath(registerType)}?year=${year}${groupParam}&error=${encodeURIComponent(message)}`);
}

async function assertRegisterWrite(registerType: RegisterType) {
  await assertWriteAllowed();
  const ctx = await getActiveOrg();
  if (!['admin', 'treasurer', 'finance_user'].includes(ctx.role)) {
    throw new Error('Permission denied.');
  }
  await enforcePortalPermissionForContext(ctx, registerType === 'income' ? 'income_register' : 'expense_register', 'edit_all');
  return ctx;
}

export async function createExpenseRegisterCategoryAction(formData: FormData) {
  let ctx;
  try {
    ctx = await assertRegisterWrite('expense');
  } catch (error) {
    redirect(`/expenses/register?error=${encodeURIComponent(error instanceof Error ? error.message : 'Permission denied.')}`);
  }

  const name = clean(formData.get('name'));
  const groupName = clean(formData.get('group_name')) ?? 'Other / Needs Review';
  const displayOrder = Number.parseInt(String(formData.get('display_order') ?? '900'), 10) || 900;
  const notes = clean(formData.get('notes'));
  const year = Number.parseInt(String(formData.get('year') ?? new Date().getFullYear()), 10);

  if (!name) {
    redirect(`/expenses/register?year=${year}&error=${encodeURIComponent('Register category name is required.')}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('register_categories')
    .insert({
      organisation_id: ctx.orgId,
      register_type: 'expense',
      name,
      group_name: groupName,
      display_order: displayOrder,
      notes,
      created_by: ctx.user.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    redirect(`/expenses/register?year=${year}&error=${encodeURIComponent(error?.message ?? 'Unable to create register category.')}`);
  }

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'expense_register_category_created',
    entityType: 'register_category',
    entityId: data.id,
    metadata: { name, groupName, displayOrder },
  });

  revalidatePath('/expenses/register');
  invalidateOrgReportCache(ctx.orgId);
  redirect(`/expenses/register?year=${year}`);
}

export async function reviewRegisterMappingAction(formData: FormData) {
  const registerType = parseRegisterType(formData.get('register_type'));
  const year = Number.parseInt(String(formData.get('year') ?? new Date().getFullYear()), 10);
  const returnGroupBy = clean(formData.get('group_by')) ?? 'category';
  let ctx;
  try {
    ctx = await assertRegisterWrite(registerType);
  } catch (error) {
    redirectWithRegisterError(registerType, year, error instanceof Error ? error.message : 'Permission denied.', returnGroupBy);
  }

  const categoryId = clean(formData.get('category_id'));
  const sourceType = clean(formData.get('source_type')) ?? 'account';
  const sourceId = clean(formData.get('source_id'));
  const accountId = clean(formData.get('account_id'));
  const supplierId = clean(formData.get('supplier_id'));
  const fundId = clean(formData.get('fund_id'));
  const bankRuleId = clean(formData.get('bank_rule_id'));
  const descriptionPattern = normalize(clean(formData.get('description_pattern')));
  const createdFromTransactionId = clean(formData.get('created_from_transaction_id'));
  const notes = clean(formData.get('notes'));

  if (!categoryId) {
    redirectWithRegisterError(registerType, year, 'Choose a register category before saving the mapping.', returnGroupBy);
  }

  const admin = createAdminClient();
  const { data: category } = await admin
    .from('register_categories')
    .select('id, register_type, name')
    .eq('id', categoryId)
    .eq('organisation_id', ctx.orgId)
    .eq('register_type', registerType)
    .eq('status', 'active')
    .maybeSingle();

  if (!category) {
    redirectWithRegisterError(registerType, year, 'Selected register category was not found for this workspace.', returnGroupBy);
  }

  const payload = {
    organisation_id: ctx.orgId,
    register_type: registerType,
    register_category_id: categoryId,
    account_id: sourceType === 'account' ? (sourceId ?? accountId) : accountId,
    supplier_id: sourceType === 'supplier' ? (sourceId ?? supplierId) : supplierId,
    fund_id: sourceType === 'fund' ? (sourceId ?? fundId) : fundId,
    bank_rule_id: bankRuleId,
    description_pattern: descriptionPattern && descriptionPattern.length >= 3 ? descriptionPattern : null,
    priority: descriptionPattern && descriptionPattern.length >= 3 ? 50 : 100,
    created_from_transaction_id: createdFromTransactionId,
    created_by: ctx.user.id,
    mapping_type: sourceType === 'supplier'
      ? 'supplier'
      : sourceType === 'fund'
        ? 'fund'
        : sourceType === 'bank_rule'
          ? 'composite'
          : 'account',
    mapping_confidence: 'high',
    needs_review: false,
    reviewed_at: new Date().toISOString(),
    reviewed_by: ctx.user.id,
    notes,
  };

  if (!payload.account_id && !payload.supplier_id && !payload.fund_id && !payload.bank_rule_id && !payload.description_pattern) {
    redirectWithRegisterError(registerType, year, 'A transaction signal is required to save a mapping.', returnGroupBy);
  }

  if (payload.account_id) {
    const { data: account } = await admin
      .from('accounts')
      .select('id')
      .eq('id', payload.account_id)
      .eq('organisation_id', ctx.orgId)
      .eq('type', registerType)
      .maybeSingle();
    if (!account) redirectWithRegisterError(registerType, year, 'Selected account does not belong to this workspace/register.', returnGroupBy);
  }

  if (payload.supplier_id) {
    const { data: supplier } = await admin
      .from('suppliers')
      .select('id')
      .eq('id', payload.supplier_id)
      .eq('organisation_id', ctx.orgId)
      .maybeSingle();
    if (!supplier) redirectWithRegisterError(registerType, year, 'Selected supplier does not belong to this workspace.', returnGroupBy);
  }

  if (payload.fund_id) {
    const { data: fund } = await admin
      .from('funds')
      .select('id')
      .eq('id', payload.fund_id)
      .eq('organisation_id', ctx.orgId)
      .maybeSingle();
    if (!fund) redirectWithRegisterError(registerType, year, 'Selected fund does not belong to this workspace.', returnGroupBy);
  }

  let query = admin
    .from('register_category_mappings')
    .select('id')
    .eq('organisation_id', ctx.orgId)
    .eq('register_type', registerType)
    .eq('mapping_type', payload.mapping_type)
    .limit(1);
  query = payload.account_id ? query.eq('account_id', payload.account_id) : query.is('account_id', null);
  query = payload.supplier_id ? query.eq('supplier_id', payload.supplier_id) : query.is('supplier_id', null);
  query = payload.fund_id ? query.eq('fund_id', payload.fund_id) : query.is('fund_id', null);
  query = payload.bank_rule_id ? query.eq('bank_rule_id', payload.bank_rule_id) : query.is('bank_rule_id', null);
  query = payload.description_pattern ? query.eq('description_pattern', payload.description_pattern) : query.is('description_pattern', null);
  const { data: existing } = await query.maybeSingle();

  const mutation = existing?.id
    ? await admin
        .from('register_category_mappings')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .eq('organisation_id', ctx.orgId)
    : await admin.from('register_category_mappings').insert(payload);

  if (mutation.error) {
    redirectWithRegisterError(registerType, year, mutation.error.message, returnGroupBy);
  }

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: `${registerType}_register_mapping_reviewed`,
    entityType: 'register_category_mapping',
    entityId: existing?.id ?? categoryId,
    metadata: {
      registerType,
      categoryId,
      sourceType,
      sourceId,
      accountId: payload.account_id,
      supplierId: payload.supplier_id,
      fundId: payload.fund_id,
      bankRuleId: payload.bank_rule_id,
      descriptionPattern: payload.description_pattern,
    },
  });

  revalidatePath(registerPath(registerType));
  invalidateOrgReportCache(ctx.orgId);
  redirect(`${registerPath(registerType)}?year=${year}&groupBy=${returnGroupBy}&success=${encodeURIComponent(`Mapping saved. Similar future transactions will be placed under ${category.name}.`)}`);
}

export async function reviewExpenseRegisterMappingAction(formData: FormData) {
  formData.set('register_type', 'expense');
  return reviewRegisterMappingAction(formData);
}

export async function createRegisterManualTransactionAction(formData: FormData) {
  const registerType = String(formData.get('register_type') ?? 'income') as RegisterType;
  const year = Number.parseInt(String(formData.get('year') ?? new Date().getFullYear()), 10);
  let ctx;
  try {
    ctx = await assertRegisterWrite(registerType);
  } catch (error) {
    redirect(`${registerPath(registerType)}?year=${year}&error=${encodeURIComponent(error instanceof Error ? error.message : 'Permission denied.')}`);
  }

  const amountPence = penceFromForm(formData.get('amount'));
  const accountId = clean(formData.get('account_id'));
  const fundId = clean(formData.get('fund_id'));
  const description = clean(formData.get('description')) ?? `${registerType === 'income' ? 'Income' : 'Expense'} register entry`;
  const date = clean(formData.get('date')) ?? new Date().toISOString().slice(0, 10);
  const incomeStreamId = clean(formData.get('income_stream_id'));

  if (!accountId || !fundId || amountPence <= 0) {
    redirect(`${registerPath(registerType)}?year=${year}&error=${encodeURIComponent('Date, amount, account, and fund are required.')}`);
  }

  const supabase = await createClient();
  const { data: tx, error: txError } = await supabase
    .from('manual_transactions')
    .insert({
      organisation_id: ctx.orgId,
      type: registerType,
      transaction_date: date,
      amount_pence: amountPence,
      description,
      payee_payer_name: clean(formData.get('counterparty')),
      reference: clean(formData.get('reference')),
      payment_method: 'bank',
      status: 'awaiting_bank_match',
      approval_status: 'approved',
      requires_bank_match: true,
      created_by: ctx.user.id,
      approved_by: ctx.user.id,
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (txError || !tx) {
    redirect(`${registerPath(registerType)}?year=${year}&error=${encodeURIComponent(txError?.message ?? 'Could not create transaction.')}`);
  }

  const { error: lineError } = await supabase.from('manual_transaction_lines').insert({
    organisation_id: ctx.orgId,
    manual_transaction_id: tx.id,
    fund_id: fundId,
    account_id: accountId,
    income_stream_id: registerType === 'income' ? incomeStreamId : null,
    description,
    amount_pence: amountPence,
    direction: registerType === 'income' ? 'in' : 'out',
    line_order: 1,
  });
  if (lineError) {
    redirect(`${registerPath(registerType)}?year=${year}&error=${encodeURIComponent(lineError.message)}`);
  }

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: `register_add_${registerType}`,
    entityType: 'manual_transaction',
    entityId: tx.id,
    metadata: { source: 'register', amountPence },
  });
  revalidatePath(registerPath(registerType));
  invalidateOrgReportCache(ctx.orgId);
  redirect(`${registerPath(registerType)}?year=${year}`);
}
