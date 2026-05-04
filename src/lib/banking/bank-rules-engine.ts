import type { BankRuleRow } from './types';

export type BankRuleTransaction = {
  id: string;
  workspace_id?: string | null;
  organisation_id?: string | null;
  bank_account_id: string;
  description: string | null;
  reference: string | null;
  amount_pence: number;
  direction?: 'in' | 'out' | null;
};

export type BankRuleAction = {
  transaction_type: BankRuleRow['transaction_type'];
  account_id: string | null;
  fund_id: string | null;
  income_stream_id: string | null;
  donor_id: string | null;
  supplier_id: string | null;
  description_template: string | null;
  auto_apply: boolean;
};

export type BankRuleMatchResult = {
  rule: BankRuleRow;
  action: BankRuleAction;
  reasons: string[];
};

export type BankRuleResolution = {
  winner: BankRuleMatchResult | null;
  matches: BankRuleMatchResult[];
  conflict: {
    priority: number;
    rule_ids: string[];
    message: string;
  } | null;
};

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function amountPounds(transaction: BankRuleTransaction): number {
  return Math.abs(transaction.amount_pence) / 100;
}

function direction(transaction: BankRuleTransaction): 'in' | 'out' {
  return transaction.direction ?? (transaction.amount_pence >= 0 ? 'in' : 'out');
}

export function bankRuleAction(rule: BankRuleRow): BankRuleAction {
  return {
    transaction_type: rule.transaction_type,
    account_id: rule.account_id,
    fund_id: rule.fund_id,
    income_stream_id: rule.income_stream_id,
    donor_id: rule.donor_id,
    supplier_id: rule.supplier_id,
    description_template: rule.description_template,
    auto_apply: rule.auto_apply,
  };
}

export function actionsConflict(a: BankRuleAction, b: BankRuleAction): boolean {
  return (
    a.transaction_type !== b.transaction_type ||
    a.account_id !== b.account_id ||
    a.fund_id !== b.fund_id ||
    a.income_stream_id !== b.income_stream_id ||
    a.donor_id !== b.donor_id ||
    a.supplier_id !== b.supplier_id ||
    a.description_template !== b.description_template
  );
}

export function ruleMatchesBankTransaction(
  rule: BankRuleRow,
  transaction: BankRuleTransaction,
): { matched: boolean; reasons: string[] } {
  if (rule.status !== 'active') return { matched: false, reasons: [] };
  if (rule.bank_account_id && rule.bank_account_id !== transaction.bank_account_id) {
    return { matched: false, reasons: [] };
  }
  if (rule.direction && rule.direction !== direction(transaction)) {
    return { matched: false, reasons: [] };
  }

  const reasons: string[] = [];
  const text = normalize(`${transaction.description ?? ''} ${transaction.reference ?? ''}`);
  const condition = normalize(rule.condition_value);
  const amount = amountPounds(transaction);

  if (rule.direction) reasons.push(`money ${rule.direction}`);

  switch (rule.condition_type) {
    case 'contains':
      if (condition && text.includes(condition)) {
        reasons.push(`description contains "${rule.condition_value}"`);
        return { matched: true, reasons };
      }
      return { matched: false, reasons: [] };
    case 'exact':
      if (condition && text === condition) {
        reasons.push(`description exactly matches "${rule.condition_value}"`);
        return { matched: true, reasons };
      }
      return { matched: false, reasons: [] };
    case 'starts_with':
      if (condition && text.startsWith(condition)) {
        reasons.push(`description starts with "${rule.condition_value}"`);
        return { matched: true, reasons };
      }
      return { matched: false, reasons: [] };
    case 'amount_equals':
      if (rule.amount_min != null && amount === Number(rule.amount_min)) {
        reasons.push(`amount equals £${Number(rule.amount_min).toFixed(2)}`);
        return { matched: true, reasons };
      }
      return { matched: false, reasons: [] };
    case 'amount_range':
      if (
        (rule.amount_min == null || amount >= Number(rule.amount_min)) &&
        (rule.amount_max == null || amount <= Number(rule.amount_max))
      ) {
        reasons.push('amount is in range');
        return { matched: true, reasons };
      }
      return { matched: false, reasons: [] };
    default:
      return { matched: false, reasons: [] };
  }
}

export function resolveBankRulePriority(
  rules: BankRuleRow[],
  transaction: BankRuleTransaction,
): BankRuleResolution {
  const matches = rules
    .map((rule) => {
      const result = ruleMatchesBankTransaction(rule, transaction);
      if (!result.matched) return null;
      return {
        rule,
        action: bankRuleAction(rule),
        reasons: result.reasons,
      };
    })
    .filter((match): match is BankRuleMatchResult => match != null)
    .sort((a, b) => a.rule.priority - b.rule.priority || a.rule.created_at.localeCompare(b.rule.created_at));

  const winner = matches[0] ?? null;
  const topPriority = winner?.rule.priority;
  const topMatches = topPriority == null ? [] : matches.filter((match) => match.rule.priority === topPriority);
  const conflict =
    topMatches.length > 1 && topMatches.some((match) => actionsConflict(topMatches[0].action, match.action))
      ? {
          priority: topPriority!,
          rule_ids: topMatches.map((match) => match.rule.id),
          message: 'Multiple matching rules at the same priority suggest different actions.',
        }
      : null;

  return { winner, matches, conflict };
}

export function renderDescriptionTemplate(
  template: string | null | undefined,
  transaction: Pick<BankRuleTransaction, 'description' | 'reference'>,
): string | null {
  if (!template?.trim()) return null;
  return template
    .replaceAll('{{description}}', transaction.description ?? '')
    .replaceAll('{{reference}}', transaction.reference ?? '')
    .trim();
}
