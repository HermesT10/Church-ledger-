'use server';

import { revalidatePath } from 'next/cache';
import { assertWriteAllowed } from '@/lib/demo';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';

interface BankLineForSuggestion {
  id: string;
  workspace_id: string;
  display_description: string | null;
  description: string | null;
  reference: string | null;
  amount: number | null;
  direction: string | null;
}

interface ExistingMapping {
  id: string;
  match_pattern: string;
  account_id: string | null;
  category_id: string | null;
  supplier_id: string | null;
  confidence: number | null;
}

function normalisePattern(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function inferCategoryText(line: BankLineForSuggestion): string {
  const text = normalisePattern(`${line.display_description ?? line.description ?? ''} ${line.reference ?? ''}`);

  if (line.direction === 'in') {
    if (text.includes('gift aid')) return 'Gift Aid';
    if (text.includes('rent') || text.includes('letting') || text.includes('hall hire')) return 'Lettings';
    if (text.includes('donation') || text.includes('giving') || text.includes('offering')) return 'Giving';
    if (text.includes('grant') || text.includes('funding')) return 'Grants';
    return 'Other income';
  }

  if (text.includes('salary') || text.includes('payroll') || text.includes('hmrc') || text.includes('paye')) {
    return 'Payroll';
  }
  if (text.includes('service charge') || text.includes('bank charge')) return 'Bank charges';
  if (text.includes('insurance')) return 'Insurance';
  if (text.includes('utility') || text.includes('electric') || text.includes('gas') || text.includes('water')) {
    return 'Utilities';
  }
  if (text.includes('software') || text.includes('subscription')) return 'Software and subscriptions';
  return 'Church running costs';
}

function matchingMapping(line: BankLineForSuggestion, mappings: ExistingMapping[]): ExistingMapping | null {
  const text = normalisePattern(`${line.display_description ?? line.description ?? ''} ${line.reference ?? ''}`);
  return mappings
    .filter((mapping) => text.includes(normalisePattern(mapping.match_pattern)))
    .sort((a, b) => b.match_pattern.length - a.match_pattern.length)[0] ?? null;
}

export async function createBankCategorisationSuggestionsForImport(params: {
  orgId: string;
  userId: string;
  statementImportId: string;
}): Promise<{ count: number; error: string | null }> {
  const supabase = await createClient();

  const [{ data: lines, error: linesError }, { data: mappings }] = await Promise.all([
    supabase
      .from('bank_lines')
      .select('id, workspace_id, display_description, description, reference, amount, direction')
      .eq('workspace_id', params.orgId)
      .eq('statement_import_id', params.statementImportId)
      .eq('status', 'unmatched'),
    supabase
      .from('bank_transaction_mappings')
      .select('id, match_pattern, account_id, category_id, supplier_id, confidence')
      .eq('workspace_id', params.orgId),
  ]);

  if (linesError) return { count: 0, error: linesError.message };

  const suggestions = new Map<string, {
    workspace_id: string;
    bank_transaction_id: string;
    description_pattern: string;
    suggested_account_id: string | null;
    suggested_category_id: string | null;
    suggested_category: string;
    suggested_supplier_id: string | null;
    confidence_score: number;
    source: string;
    created_by: string;
  }>();

  for (const line of (lines ?? []) as BankLineForSuggestion[]) {
    const pattern = normalisePattern(line.display_description ?? line.description ?? line.reference);
    if (!pattern) continue;

    const remembered = matchingMapping(line, (mappings ?? []) as ExistingMapping[]);
    const key = `${line.id}:${pattern}`;
    suggestions.set(key, {
      workspace_id: params.orgId,
      bank_transaction_id: line.id,
      description_pattern: pattern,
      suggested_account_id: remembered?.account_id ?? null,
      suggested_category_id: remembered?.category_id ?? null,
      suggested_category: remembered?.category_id ? 'Remembered mapping' : inferCategoryText(line),
      suggested_supplier_id: remembered?.supplier_id ?? null,
      confidence_score: remembered?.confidence ?? 0.55,
      source: remembered ? 'remembered_mapping' : 'bank_import',
      created_by: params.userId,
    });
  }

  const rows = Array.from(suggestions.values());
  if (rows.length === 0) return { count: 0, error: null };

  const { error } = await supabase.from('categorisation_suggestions').insert(rows);
  if (error) return { count: 0, error: error.message };

  await logAuditEvent({
    orgId: params.orgId,
    userId: params.userId,
    action: 'bank_categorisation_suggestions_created',
    entityType: 'bank_statement_import',
    entityId: params.statementImportId,
    metadata: { count: rows.length },
  });

  return { count: rows.length, error: null };
}

export async function rememberBankTransactionMapping(formData: FormData): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'banking');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const matchPattern = normalisePattern(String(formData.get('match_pattern') ?? ''));
  if (!matchPattern) return { error: 'A match pattern is required.' };

  const payload = {
    workspace_id: orgId,
    match_pattern: matchPattern,
    account_id: String(formData.get('account_id') ?? '') || null,
    category_id: String(formData.get('category_id') ?? '') || null,
    supplier_id: String(formData.get('supplier_id') ?? '') || null,
    confidence: Number(formData.get('confidence') ?? 0.75),
    created_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('bank_transaction_mappings')
    .select('id')
    .eq('workspace_id', orgId)
    .ilike('match_pattern', matchPattern)
    .maybeSingle();

  const { error } = existing?.id
    ? await supabase.from('bank_transaction_mappings').update(payload).eq('id', existing.id).eq('workspace_id', orgId)
    : await supabase.from('bank_transaction_mappings').insert(payload);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'bank_transaction_mapping_saved',
      entityType: 'bank_transaction_mapping',
      entityId: existing?.id,
      metadata: { matchPattern },
    });
    revalidatePath('/reconciliation');
    revalidatePath('/banking');
  }

  return { error: error?.message ?? null };
}
