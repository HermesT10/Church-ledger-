import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  confidenceLabel,
  scoreBankRuleAgainstTransaction,
  scoreGenericSourceMatch,
  validateSplitTotal,
} from '../src/lib/banking/reconciliation-matching';

const matchingService = readFileSync(
  new URL('../src/lib/banking/reconciliation-matching.ts', import.meta.url),
  'utf8',
);
const workspaceActions = readFileSync(
  new URL('../src/lib/banking/reconciliation-workspace-actions.ts', import.meta.url),
  'utf8',
);
const workspaceClient = readFileSync(
  new URL('../src/app/(app)/reconciliation/reconciliation-workspace-client.tsx', import.meta.url),
  'utf8',
);
const reconciliationPage = readFileSync(
  new URL('../src/app/(app)/reconciliation/page.tsx', import.meta.url),
  'utf8',
);

describe('bank reconciliation matching engine', () => {
  it('scores exact amount, same date, reference and expected bank account as high confidence', () => {
    const scored = scoreGenericSourceMatch({
      bankTransaction: {
        amount_pence: 50000,
        txn_date: '2026-04-20',
        description: 'ACME INVOICE 1001',
        reference: 'INV-1001',
        bank_account_id: 'bank-1',
      },
      sourceAmountPence: 50000,
      sourceDate: '2026-04-20',
      sourceText: 'Acme invoice payment',
      sourceReference: 'INV-1001',
      expectedBankAccountId: 'bank-1',
      sourceType: 'income',
    });

    expect(scored.score).toBeGreaterThanOrEqual(0.8);
    expect(confidenceLabel(scored.score)).toBe('high');
    expect(scored.reasons).toContain('exact amount match');
  });

  it('generates a bank rule suggestion from matching text and direction', () => {
    const suggestion = scoreBankRuleAgainstTransaction(
      {
        id: 'rule-1',
        name: 'Standing order giving',
        condition_type: 'contains',
        condition_value: 'standing order',
        direction: 'in',
        amount_min: null,
        amount_max: null,
        transaction_type: 'donation',
      },
      {
        amount_pence: 2500,
        description: 'Standing Order Smith',
        reference: 'APRIL',
      },
    );

    expect(suggestion?.source_type).toBe('bank_rule');
    expect(suggestion?.confidence_label).toBe('medium');
    expect(suggestion?.match_reason.join(' ')).toContain('donation');
  });
});

describe('bank reconciliation workspace behaviour', () => {
  it('validates split totals against the absolute bank amount', () => {
    expect(validateSplitTotal({
      bankAmountPence: 50000,
      lines: [{ amount_pence: 30000 }, { amount_pence: 20000 }],
    })).toBeNull();

    expect(validateSplitTotal({
      bankAmountPence: -50000,
      lines: [{ amount_pence: 30000 }, { amount_pence: 10000 }],
    })).toBe('Split line amounts must equal the bank transaction amount.');
  });

  it('contains match adapters and hooks for required reconciliation sources', () => {
    for (const source of [
      'manual_transaction',
      'donation',
      'gift_aid_donor_donation',
      'invoice_payment',
      'supplier_payment',
      'payroll_payment',
      'cash_deposit',
      'fund_transfer',
      'adjustment',
      'gift_aid_claim_payment',
    ]) {
      expect(matchingService).toContain(source);
    }
    expect(matchingService).toContain('suggestMatchesForBankTransaction');
    expect(matchingService).toContain('scoreHmrcReceiptMatch');
  });

  it('implements confirm match safeguards and ledger-once posting paths', () => {
    expect(workspaceActions).toContain('assertNoExistingBankMatch');
    expect(workspaceActions).toContain('assertSourceAvailable');
    expect(workspaceActions).toContain('postManualTransactionToLedger');
    expect(workspaceActions).toContain("status: 'reconciled'");
    expect(workspaceActions).toContain('bank_reconciliation_confirm_match');
  });

  it('supports create, split, exclude, Gift Aid and HMRC hooks', () => {
    expect(workspaceActions).toContain('createAndReconcileBankTransaction');
    expect(workspaceActions).toContain('splitBankTransaction');
    expect(workspaceActions).toContain('excludeBankTransaction');
    expect(workspaceActions).toContain('reconcileBankLineAsDonation');
    expect(workspaceActions).toContain('gift_aid_claim_batches');
    expect(workspaceActions).toContain('received_bank_transaction_id');
  });

  it('renders split-screen reconciliation actions in the UI', () => {
    expect(reconciliationPage).toContain('ReconciliationWorkspaceClient');
    expect(reconciliationPage).toContain('lettingsIncomeAccounts');
    expect(reconciliationPage).toContain('defaultLettingsIncomeAccountId');
    expect(workspaceClient).toContain('Bank transactions');
    expect(workspaceClient).toContain('lettingsOverrideFundId');
    expect(workspaceClient).toContain('Suggested matches');
    expect(workspaceClient).toContain('Create & Reconcile');
    expect(workspaceClient).toContain('Split');
    expect(workspaceClient).toContain('Exclude');
    expect(workspaceClient).toContain('Add Rule');
    expect(workspaceClient).toContain('Confirm Match');
  });
});
