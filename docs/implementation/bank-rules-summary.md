# Bank Rules Summary

## Purpose

Bank rules provide automated categorisation suggestions for recurring imported bank transactions. The MVP is suggestion-first: rules can prefill reconciliation forms and rank suggestions, but they do not silently reconcile transactions unless `auto_apply` is explicitly enabled and checked by privileged server actions.

## Schema

The existing `bank_rules` table already stores condition, action, priority, status, and `auto_apply` fields. Migration `00090_bank_rules_automation.sql` adds:

- `description_template`
- `last_applied_at`
- `last_applied_bank_transaction_id`
- `applied_count`

The table continues to use `workspace_id` for tenant isolation, matching the current banking schema foundation.

## Rule Engine

Pure rule logic lives in `src/lib/banking/bank-rules-engine.ts`.

Supported conditions:

- Description contains text
- Description exact match
- Description starts with text
- Amount equals
- Amount range
- Direction `in` / `out`
- Bank account specific or all accounts

Supported actions:

- Transaction type
- Account
- Fund
- Income stream
- Donor
- Supplier
- Description template

Priority resolution sorts lower numeric priority first. If multiple rules at the winning priority match but suggest different actions, a conflict is returned and shown as part of the rule suggestion.

## Server Actions

Rule actions live in `src/lib/banking/bank-rules-actions.ts`.

Implemented actions:

- `listBankRules`
- `createBankRule`
- `updateBankRule`
- `deactivateBankRule`
- `testBankRuleAgainstRecentTransactions`
- `suggestRulesForBankTransaction`
- `applyBankRuleSuggestion`

All read/write operations scope by the active workspace/organisation. Write operations use the banking permission checks and audit rule lifecycle events.

Audit events:

- `bank_rule_created`
- `bank_rule_edited`
- `bank_rule_deactivated`
- `bank_rule_applied`
- `bank_rule_auto_apply_enabled`
- `bank_rule_auto_apply_disabled`

## UI

The rules management page is available at `/banking/rules`.

It supports:

- Listing rules
- Creating rules
- Editing rules
- Deactivating rules
- Testing a rule against recent imported bank transactions

The table shows:

- Name
- Condition
- Action
- Priority
- Status
- Last applied
- Actions

## Reconciliation Integration

Rule suggestions are included in `suggestMatchesForBankTransaction`.

During reconciliation:

- Rule suggestions appear alongside other match candidates.
- Users can apply a rule to prefill Create & Reconcile fields.
- Users can open the Bank Rules page to edit rules.
- Users can create rules from the selected bank transaction via the Add Rule link.

Applying a rule logs `bank_rule_applied` and updates last-applied metadata. It does not create a ledger posting or mark the bank line reconciled by itself.

## Tests

Tests live in `tests/bankRules.test.ts`.

Covered:

- Contains rule matching
- Amount equals/range matching
- Direction matching
- Priority resolution and conflicts
- Inactive rules ignored
- Description template rendering
- Reconciliation rule suggestion wiring
- Workspace scoping checks
- Migration metadata fields
