import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  renderDescriptionTemplate,
  resolveBankRulePriority,
  ruleMatchesBankTransaction,
} from '../src/lib/banking/bank-rules-engine';
import type { BankRuleRow } from '../src/lib/banking/types';

const actionsSource = readFileSync(
  new URL('../src/lib/banking/bank-rules-actions.ts', import.meta.url),
  'utf8',
);
const matchingSource = readFileSync(
  new URL('../src/lib/banking/reconciliation-matching.ts', import.meta.url),
  'utf8',
);
const migrationSource = readFileSync(
  new URL('../supabase/migrations/00090_bank_rules_automation.sql', import.meta.url),
  'utf8',
);

function rule(overrides: Partial<BankRuleRow> = {}): BankRuleRow {
  return {
    id: 'rule-1',
    workspace_id: 'org-1',
    bank_account_id: null,
    name: 'Rule',
    priority: 100,
    condition_type: 'contains',
    condition_value: 'tesco',
    direction: null,
    amount_min: null,
    amount_max: null,
    transaction_type: 'expense',
    account_id: 'account-1',
    fund_id: 'fund-1',
    income_stream_id: null,
    donor_id: null,
    supplier_id: null,
    description_template: 'Matched {{description}}',
    auto_apply: false,
    status: 'active',
    last_applied_at: null,
    last_applied_bank_transaction_id: null,
    applied_count: 0,
    created_by: null,
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    ...overrides,
  };
}

const bankTransaction = {
  id: 'bank-1',
  workspace_id: 'org-1',
  organisation_id: 'org-1',
  bank_account_id: 'acct-1',
  description: 'TESCO STORES',
  reference: 'CARD',
  amount_pence: -4850,
  direction: 'out' as const,
};

describe('bank rule matching', () => {
  it('matches description contains rules', () => {
    const result = ruleMatchesBankTransaction(rule(), bankTransaction);
    expect(result.matched).toBe(true);
    expect(result.reasons.join(' ')).toContain('description contains');
  });

  it('matches amount equals and amount range rules', () => {
    expect(ruleMatchesBankTransaction(rule({
      condition_type: 'amount_equals',
      condition_value: null,
      amount_min: 48.5,
    }), bankTransaction).matched).toBe(true);

    expect(ruleMatchesBankTransaction(rule({
      condition_type: 'amount_range',
      condition_value: null,
      amount_min: 40,
      amount_max: 60,
    }), bankTransaction).matched).toBe(true);
  });

  it('honours direction filters', () => {
    expect(ruleMatchesBankTransaction(rule({ direction: 'out' }), bankTransaction).matched).toBe(true);
    expect(ruleMatchesBankTransaction(rule({ direction: 'in' }), bankTransaction).matched).toBe(false);
  });

  it('uses highest priority rule and reports same-priority conflicts', () => {
    const resolution = resolveBankRulePriority([
      rule({ id: 'low', priority: 100, transaction_type: 'expense' }),
      rule({ id: 'high-a', priority: 10, transaction_type: 'expense' }),
      rule({ id: 'high-b', priority: 10, transaction_type: 'donation' }),
    ], bankTransaction);

    expect(resolution.winner?.rule.id).toBe('high-a');
    expect(resolution.conflict?.rule_ids).toEqual(['high-a', 'high-b']);
  });

  it('ignores inactive rules', () => {
    const resolution = resolveBankRulePriority([
      rule({ id: 'inactive', priority: 1, status: 'inactive' }),
    ], bankTransaction);

    expect(resolution.matches).toHaveLength(0);
  });

  it('renders description templates', () => {
    expect(renderDescriptionTemplate('Fee: {{description}} / {{reference}}', bankTransaction)).toBe('Fee: TESCO STORES / CARD');
  });
});

describe('bank rules integration', () => {
  it('scopes rule actions to the active workspace', () => {
    expect(actionsSource).toContain(".eq('workspace_id', ctx.orgId)");
    expect(actionsSource).toContain(".eq('organisation_id', ctx.orgId)");
  });

  it('feeds rule suggestions into reconciliation without silent auto reconciliation', () => {
    expect(matchingSource).toContain('resolveBankRulePriority');
    expect(matchingSource).toContain("source_type: 'bank_rule'");
    expect(actionsSource).toContain('applyBankRuleSuggestion');
    expect(actionsSource).not.toContain('auto-reconcile silently');
  });

  it('adds rule metadata for description template and last applied tracking', () => {
    expect(migrationSource).toContain('description_template');
    expect(migrationSource).toContain('last_applied_at');
    expect(migrationSource).toContain('applied_count');
  });
});
