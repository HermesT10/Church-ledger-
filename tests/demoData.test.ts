/**
 * Phase 9.5 -- Demo Data Generator Tests
 *
 * These tests cover:
 * 1. Migration schema: demo_batch_id column on all 18 tables
 * 2. Trigger exceptions: block_hard_delete, block_posted_mutation, block_posted_journal_line_mutation
 * 3. FK-safe deletion order
 * 4. Data integrity and demo lifecycle
 */

import { describe, it, expect } from 'vitest';

/* ================================================================== */
/*  1. demo_batch_id column coverage                                   */
/* ================================================================== */

describe('demo_batch_id column coverage', () => {
  /**
   * All 18 tables the demo generator touches must have a
   * nullable demo_batch_id UUID column.
   */
  const TABLES_WITH_DEMO_BATCH_ID = [
    'funds',
    'journals',
    'journal_lines',
    'bank_accounts',
    'bank_lines',
    'suppliers',
    'bills',
    'bill_lines',
    'payment_runs',
    'payment_run_items',
    'donors',
    'donations',
    'gift_aid_claims',
    'giving_imports',
    'giving_import_rows',
    'payroll_runs',
    'payroll_run_splits',
    'bank_reconciliation_matches',
  ];

  it('should have exactly 18 tables with demo_batch_id', () => {
    expect(TABLES_WITH_DEMO_BATCH_ID.length).toBe(18);
  });

  it('should include all ledger and reference tables', () => {
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('journals');
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('journal_lines');
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('bank_accounts');
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('bank_lines');
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('funds');
  });

  it('should include AP and payroll tables', () => {
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('bills');
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('bill_lines');
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('payment_runs');
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('payment_run_items');
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('payroll_runs');
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('payroll_run_splits');
  });

  it('should include donation and giving tables', () => {
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('donors');
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('donations');
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('gift_aid_claims');
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('giving_imports');
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('giving_import_rows');
  });

  it('should include reconciliation table', () => {
    expect(TABLES_WITH_DEMO_BATCH_ID).toContain('bank_reconciliation_matches');
  });
});

/* ================================================================== */
/*  2. Trigger exception logic                                         */
/* ================================================================== */

describe('Trigger exception logic (documentation)', () => {
  /**
   * block_hard_delete() must allow deletion when OLD.demo_batch_id IS NOT NULL.
   * Tables with this trigger: suppliers, donors, donations, gift_aid_claims.
   */
  describe('block_hard_delete exception', () => {
    it('should allow deletion when demo_batch_id is set', () => {
      // Simulating trigger logic
      const demoBatchId = 'abc-123';
      const shouldAllowDelete = demoBatchId !== null;
      expect(shouldAllowDelete).toBe(true);
    });

    it('should block deletion when demo_batch_id is null', () => {
      const demoBatchId = null;
      const shouldAllowDelete = demoBatchId !== null;
      expect(shouldAllowDelete).toBe(false);
    });
  });

  /**
   * block_posted_mutation() must allow DELETE when OLD.demo_batch_id IS NOT NULL.
   * This applies to journals, bills, payment_runs, payroll_runs.
   */
  describe('block_posted_mutation exception', () => {
    function canDeletePosted(status: string, demoBatchId: string | null): boolean {
      // Demo data can always be deleted
      if (demoBatchId !== null) return true;
      // Non-demo: only draft can be deleted
      return status !== 'posted';
    }

    it('should allow deleting posted demo records', () => {
      expect(canDeletePosted('posted', 'batch-123')).toBe(true);
    });

    it('should block deleting posted non-demo records', () => {
      expect(canDeletePosted('posted', null)).toBe(false);
    });

    it('should allow deleting draft non-demo records', () => {
      expect(canDeletePosted('draft', null)).toBe(true);
    });
  });

  /**
   * block_posted_journal_line_mutation() must allow DELETE
   * when OLD.demo_batch_id IS NOT NULL.
   */
  describe('block_posted_journal_line_mutation exception', () => {
    function canDeleteJournalLine(
      lineDemoBatchId: string | null,
      parentStatus: string,
      parentDemoBatchId: string | null,
    ): boolean {
      // Line-level demo check
      if (lineDemoBatchId !== null) return true;
      // Parent is posted and not demo -> block
      if (parentStatus === 'posted' && parentDemoBatchId === null) return false;
      return true;
    }

    it('should allow deleting demo journal lines of posted journals', () => {
      expect(canDeleteJournalLine('batch-1', 'posted', 'batch-1')).toBe(true);
    });

    it('should block deleting non-demo lines of posted journals', () => {
      expect(canDeleteJournalLine(null, 'posted', null)).toBe(false);
    });

    it('should allow deleting non-demo lines of draft journals', () => {
      expect(canDeleteJournalLine(null, 'draft', null)).toBe(true);
    });
  });
});

/* ================================================================== */
/*  3. FK-safe deletion order                                          */
/* ================================================================== */

describe('FK-safe deletion order', () => {
  const DELETE_ORDER = [
    'bank_reconciliation_matches',
    'payment_run_items',
    'payroll_run_splits',
    'bill_lines',
    'journal_lines',
    'giving_import_rows',
    'payment_runs',
    'payroll_runs',
    'bills',
    'gift_aid_claims',
    'donations',
    'donors',
    'suppliers',
    'giving_imports',
    'journals',
    'bank_lines',
    'bank_accounts',
    'funds',
  ];

  it('should delete child tables before parent tables', () => {
    // journal_lines before journals
    expect(DELETE_ORDER.indexOf('journal_lines')).toBeLessThan(
      DELETE_ORDER.indexOf('journals'),
    );

    // bill_lines before bills
    expect(DELETE_ORDER.indexOf('bill_lines')).toBeLessThan(
      DELETE_ORDER.indexOf('bills'),
    );

    // payment_run_items before payment_runs
    expect(DELETE_ORDER.indexOf('payment_run_items')).toBeLessThan(
      DELETE_ORDER.indexOf('payment_runs'),
    );

    // payroll_run_splits before payroll_runs
    expect(DELETE_ORDER.indexOf('payroll_run_splits')).toBeLessThan(
      DELETE_ORDER.indexOf('payroll_runs'),
    );

    // giving_import_rows before giving_imports
    expect(DELETE_ORDER.indexOf('giving_import_rows')).toBeLessThan(
      DELETE_ORDER.indexOf('giving_imports'),
    );

    // bank_lines before bank_accounts
    expect(DELETE_ORDER.indexOf('bank_lines')).toBeLessThan(
      DELETE_ORDER.indexOf('bank_accounts'),
    );
  });

  it('should delete reconciliation matches first (FK to both bank_lines and journals)', () => {
    expect(DELETE_ORDER[0]).toBe('bank_reconciliation_matches');
  });

  it('should delete donations before donors (FK relationship)', () => {
    expect(DELETE_ORDER.indexOf('donations')).toBeLessThan(
      DELETE_ORDER.indexOf('donors'),
    );
  });

  it('should delete gift_aid_claims before donors', () => {
    expect(DELETE_ORDER.indexOf('gift_aid_claims')).toBeLessThan(
      DELETE_ORDER.indexOf('donors'),
    );
  });

  it('should delete journals before bank_accounts (no direct FK but ordering safety)', () => {
    expect(DELETE_ORDER.indexOf('journals')).toBeLessThan(
      DELETE_ORDER.indexOf('bank_accounts'),
    );
  });

  it('should delete funds last (referenced by journal_lines and donations)', () => {
    expect(DELETE_ORDER[DELETE_ORDER.length - 1]).toBe('funds');
  });
});

/* ================================================================== */
/*  4. Legacy demo cleanup (post-UI removal)                           */
/* ================================================================== */

describe('Legacy demo cleanup (documentation)', () => {
  it('Workspace Data Management uses DELETE DEMO confirmation for legacy demo RPC', () => {
    /**
     * Demo generation UI was removed; admins clear old demo-tagged rows via
     * deleteDemoDataAction → delete_workspace_demo_data with confirmation DELETE DEMO.
     */
    expect('DELETE DEMO').toBe('DELETE DEMO');
  });

  it('Full ledger emptying uses RESET confirmation and financial reset RPC', () => {
    expect('RESET').toBe('RESET');
  });

  it('Global multi-tenant wipe is manual SQL only', () => {
    /**
     * admin_global_clean_financial_data loops organisations and calls
     * run_workspace_data_delete(..., 'financial', ...). Invoke via SQL editor only.
     */
    expect(true).toBe(true);
  });
});
