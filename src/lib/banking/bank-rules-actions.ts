'use server';

import { revalidatePath } from 'next/cache';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import {
  renderDescriptionTemplate,
  resolveBankRulePriority,
  ruleMatchesBankTransaction,
  type BankRuleTransaction,
} from './bank-rules-engine';
import type { BankRuleRow } from './types';
import type { AppliedBankRule, BankRuleTestMatch } from './bank-rules-actions.types';

type ActionResult<T = null> = { data: T | null; error: string | null };

function permissionError(error: unknown): string {
  return error instanceof PermissionError ? error.message : 'Permission denied.';
}

function clean(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 && text !== 'none' ? text : null;
}

function optionalNumber(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').trim().replace(/[£,]/g, '');
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseAutoApply(formData: FormData): boolean {
  return formData.get('auto_apply') === 'on' || formData.get('auto_apply') === 'true';
}

function parseRulePayload(formData: FormData) {
  const conditionType = String(formData.get('condition_type') ?? 'contains');
  const conditionValue = clean(formData.get('condition_value'));
  const transactionType = String(formData.get('transaction_type') ?? 'other');
  return {
    name: String(formData.get('name') ?? '').trim(),
    bank_account_id: clean(formData.get('bank_account_id')),
    priority: Number(formData.get('priority') ?? 100),
    condition_type: conditionType,
    condition_value: conditionValue,
    direction: clean(formData.get('direction')),
    amount_min: optionalNumber(formData.get('amount_min')),
    amount_max: optionalNumber(formData.get('amount_max')),
    transaction_type: transactionType,
    account_id: clean(formData.get('account_id')),
    fund_id: clean(formData.get('fund_id')),
    income_stream_id: clean(formData.get('income_stream_id')),
    donor_id: clean(formData.get('donor_id')),
    supplier_id: clean(formData.get('supplier_id')),
    description_template: clean(formData.get('description_template')),
    auto_apply: parseAutoApply(formData),
  };
}

function validateRulePayload(payload: ReturnType<typeof parseRulePayload>): string | null {
  if (!payload.name) return 'Rule name is required.';
  if (!payload.condition_value && !payload.condition_type.startsWith('amount')) {
    return 'Condition value is required for text rules.';
  }
  if (payload.condition_type === 'amount_equals' && payload.amount_min == null) {
    return 'Amount equals rules require an amount.';
  }
  if (payload.condition_type === 'amount_range' && payload.amount_min == null && payload.amount_max == null) {
    return 'Amount range rules require a minimum or maximum amount.';
  }
  if (payload.amount_min != null && payload.amount_max != null && payload.amount_max < payload.amount_min) {
    return 'Maximum amount must be greater than or equal to minimum amount.';
  }
  if (!['contains', 'exact', 'starts_with', 'amount_equals', 'amount_range'].includes(payload.condition_type)) {
    return 'Unsupported rule condition.';
  }
  if (payload.direction && !['in', 'out'].includes(payload.direction)) return 'Unsupported money direction.';
  if (!['income', 'expense', 'transfer', 'donation', 'payroll', 'gift_aid_payment', 'other'].includes(payload.transaction_type)) {
    return 'Unsupported transaction type.';
  }
  return null;
}

async function assertBankingPermission(action: 'read' | 'create' | 'update') {
  const ctx = await getActiveOrg();
  assertCanPerform(ctx.role, action, 'banking');
  return ctx;
}

export async function listBankRules(bankAccountId?: string): Promise<{ data: BankRuleRow[]; error: string | null }> {
  let ctx;
  try {
    ctx = await assertBankingPermission('read');
  } catch (error) {
    return { data: [], error: permissionError(error) };
  }

  const supabase = await createClient();
  let query = supabase
    .from('bank_rules')
    .select('*')
    .eq('workspace_id', ctx.orgId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });

  if (bankAccountId) query = query.or(`bank_account_id.eq.${bankAccountId},bank_account_id.is.null`);
  const { data, error } = await query;
  return { data: (data ?? []) as BankRuleRow[], error: error?.message ?? null };
}

export async function createBankRule(formData: FormData): Promise<{ success: boolean; error: string | null; id?: string }> {
  await assertWriteAllowed();
  let ctx;
  try {
    ctx = await assertBankingPermission('create');
  } catch (error) {
    return { success: false, error: permissionError(error) };
  }

  const payload = parseRulePayload(formData);
  const validationError = validateRulePayload(payload);
  if (validationError) return { success: false, error: validationError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bank_rules')
    .insert({
      workspace_id: ctx.orgId,
      ...payload,
      priority: Number.isFinite(payload.priority) ? payload.priority : 100,
      direction: payload.direction === 'in' || payload.direction === 'out' ? payload.direction : null,
      auto_apply: payload.auto_apply,
      status: 'active',
      created_by: ctx.user.id,
    })
    .select('id')
    .single();

  if (error || !data) return { success: false, error: error?.message ?? 'Could not create bank rule.' };

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'bank_rule_created',
    entityType: 'bank_rule',
    entityId: data.id,
    metadata: { name: payload.name, bankAccountId: payload.bank_account_id, transactionType: payload.transaction_type },
  });
  if (payload.auto_apply) {
    await logAuditEvent({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'bank_rule_auto_apply_enabled',
      entityType: 'bank_rule',
      entityId: data.id,
    });
  }

  revalidatePath('/banking');
  revalidatePath('/banking/rules');
  if (payload.bank_account_id) revalidatePath(`/banking/${payload.bank_account_id}`);
  return { success: true, error: null, id: data.id };
}

export async function updateBankRule(formData: FormData): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  let ctx;
  try {
    ctx = await assertBankingPermission('update');
  } catch (error) {
    return { success: false, error: permissionError(error) };
  }

  const ruleId = String(formData.get('rule_id') ?? '').trim();
  if (!ruleId) return { success: false, error: 'Rule ID is required.' };
  const payload = parseRulePayload(formData);
  const validationError = validateRulePayload(payload);
  if (validationError) return { success: false, error: validationError };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('bank_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('workspace_id', ctx.orgId)
    .maybeSingle();
  if (!existing) return { success: false, error: 'Bank rule not found.' };

  const { error } = await supabase
    .from('bank_rules')
    .update({
      ...payload,
      priority: Number.isFinite(payload.priority) ? payload.priority : 100,
      direction: payload.direction === 'in' || payload.direction === 'out' ? payload.direction : null,
    })
    .eq('id', ruleId)
    .eq('workspace_id', ctx.orgId);

  if (error) return { success: false, error: error.message };

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'bank_rule_edited',
    entityType: 'bank_rule',
    entityId: ruleId,
    metadata: { name: payload.name, bankAccountId: payload.bank_account_id, transactionType: payload.transaction_type },
  });

  if (Boolean(existing.auto_apply) !== payload.auto_apply) {
    await logAuditEvent({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: payload.auto_apply ? 'bank_rule_auto_apply_enabled' : 'bank_rule_auto_apply_disabled',
      entityType: 'bank_rule',
      entityId: ruleId,
    });
  }

  revalidatePath('/banking/rules');
  revalidatePath('/reconciliation');
  if (payload.bank_account_id) revalidatePath(`/banking/${payload.bank_account_id}`);
  return { success: true, error: null };
}

export async function deactivateBankRule(ruleId: string): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  let ctx;
  try {
    ctx = await assertBankingPermission('update');
  } catch (error) {
    return { success: false, error: permissionError(error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('bank_rules')
    .update({ status: 'inactive', auto_apply: false })
    .eq('id', ruleId)
    .eq('workspace_id', ctx.orgId);
  if (error) return { success: false, error: error.message };

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'bank_rule_deactivated',
    entityType: 'bank_rule',
    entityId: ruleId,
  });
  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'bank_rule_auto_apply_disabled',
    entityType: 'bank_rule',
    entityId: ruleId,
  });

  revalidatePath('/banking/rules');
  revalidatePath('/reconciliation');
  return { success: true, error: null };
}

export async function testBankRuleAgainstRecentTransactions(ruleId: string): Promise<ActionResult<BankRuleTestMatch[]>> {
  let ctx;
  try {
    ctx = await assertBankingPermission('read');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const supabase = await createClient();
  const { data: rule } = await supabase
    .from('bank_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('workspace_id', ctx.orgId)
    .maybeSingle();
  if (!rule) return { data: null, error: 'Bank rule not found.' };

  let query = supabase
    .from('bank_lines')
    .select('id, workspace_id, organisation_id, bank_account_id, txn_date, description, reference, amount_pence, direction')
    .eq('organisation_id', ctx.orgId)
    .order('txn_date', { ascending: false })
    .limit(100);
  if (rule.bank_account_id) query = query.eq('bank_account_id', rule.bank_account_id);

  const { data: transactions, error } = await query;
  if (error) return { data: null, error: error.message };

  const matches = ((transactions ?? []) as BankRuleTransaction[])
    .map((transaction) => {
      const result = ruleMatchesBankTransaction(rule as BankRuleRow, {
        ...transaction,
        amount_pence: Number(transaction.amount_pence),
      });
      if (!result.matched) return null;
      return {
        bank_transaction_id: transaction.id,
        date: (transaction as BankRuleTransaction & { txn_date?: string }).txn_date ?? '',
        description: transaction.description,
        reference: transaction.reference,
        amount_pence: Number(transaction.amount_pence),
        reasons: result.reasons,
      };
    })
    .filter((match): match is BankRuleTestMatch => match != null)
    .slice(0, 20);

  return { data: matches, error: null };
}

export async function suggestRulesForBankTransaction(bankTransactionId: string): Promise<ActionResult<ReturnType<typeof resolveBankRulePriority>>> {
  let ctx;
  try {
    ctx = await assertBankingPermission('read');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const supabase = await createClient();
  const { data: transaction } = await supabase
    .from('bank_lines')
    .select('id, workspace_id, organisation_id, bank_account_id, description, reference, amount_pence, direction')
    .eq('id', bankTransactionId)
    .eq('organisation_id', ctx.orgId)
    .maybeSingle();
  if (!transaction) return { data: null, error: 'Bank transaction not found.' };

  const { data: rules } = await supabase
    .from('bank_rules')
    .select('*')
    .eq('workspace_id', ctx.orgId)
    .eq('status', 'active')
    .or(`bank_account_id.eq.${transaction.bank_account_id},bank_account_id.is.null`)
    .order('priority', { ascending: true });

  return {
    data: resolveBankRulePriority((rules ?? []) as BankRuleRow[], {
      ...transaction,
      amount_pence: Number(transaction.amount_pence),
    }),
    error: null,
  };
}

export async function applyBankRuleSuggestion(params: {
  ruleId: string;
  bankTransactionId: string;
}): Promise<ActionResult<AppliedBankRule>> {
  await assertWriteAllowed();
  let ctx;
  try {
    ctx = await assertBankingPermission('update');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const supabase = await createClient();
  const [{ data: rule }, { data: transaction }] = await Promise.all([
    supabase
      .from('bank_rules')
      .select('*')
      .eq('id', params.ruleId)
      .eq('workspace_id', ctx.orgId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('bank_lines')
      .select('id, workspace_id, organisation_id, bank_account_id, description, reference, amount_pence, direction')
      .eq('id', params.bankTransactionId)
      .eq('organisation_id', ctx.orgId)
      .maybeSingle(),
  ]);
  if (!rule) return { data: null, error: 'Bank rule not found or inactive.' };
  if (!transaction) return { data: null, error: 'Bank transaction not found.' };

  const match = ruleMatchesBankTransaction(rule as BankRuleRow, {
    ...transaction,
    amount_pence: Number(transaction.amount_pence),
  });
  if (!match.matched) return { data: null, error: 'This rule does not match the selected transaction.' };

  const { error } = await supabase
    .from('bank_rules')
    .update({
      last_applied_at: new Date().toISOString(),
      last_applied_bank_transaction_id: params.bankTransactionId,
      applied_count: Number((rule as BankRuleRow).applied_count ?? 0) + 1,
    })
    .eq('id', params.ruleId)
    .eq('workspace_id', ctx.orgId);
  if (error) return { data: null, error: error.message };

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'bank_rule_applied',
    entityType: 'bank_rule',
    entityId: params.ruleId,
    metadata: { bankTransactionId: params.bankTransactionId, reasons: match.reasons },
  });

  const action = {
    ...rule,
    description_template: (rule as BankRuleRow).description_template ?? null,
  } as BankRuleRow;
  revalidatePath('/banking/rules');
  return {
    data: {
      ...ruleMatchesBankTransaction(action, transaction as BankRuleTransaction),
      ...{
        transaction_type: action.transaction_type,
        account_id: action.account_id,
        fund_id: action.fund_id,
        income_stream_id: action.income_stream_id,
        donor_id: action.donor_id,
        supplier_id: action.supplier_id,
        description_template: action.description_template,
        auto_apply: action.auto_apply,
        description: renderDescriptionTemplate(action.description_template, transaction),
        rule_id: action.id,
        rule_name: action.name,
      },
    },
    error: null,
  };
}
