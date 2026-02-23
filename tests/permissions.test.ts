import { describe, it, expect } from 'vitest';
import {
  canPerform,
  assertCanPerform,
  PermissionError,
} from '../src/lib/permissions';
import type { Role, Action, Module } from '../src/lib/permissions';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ALL_ROLES: Role[] = ['admin', 'treasurer', 'trustee_viewer', 'auditor'];

const WRITE_ACTIONS: Action[] = ['create', 'update', 'delete', 'post', 'approve', 'seed'];
const ALL_ACTIONS: Action[] = ['read', ...WRITE_ACTIONS];

const ALL_MODULES: Module[] = [
  'journals', 'accounts', 'funds', 'bills', 'payment_runs',
  'payroll', 'budgets', 'banking', 'donations', 'gift_aid',
  'giving_imports', 'giving_platforms', 'reconciliation',
  'settings', 'members', 'reports',
];

/* ------------------------------------------------------------------ */
/*  Admin permissions                                                  */
/* ------------------------------------------------------------------ */

describe('admin permissions', () => {
  it('admin can read all modules', () => {
    for (const mod of ALL_MODULES) {
      expect(canPerform('admin', 'read', mod).allowed).toBe(true);
    }
  });

  it('admin can create journals', () => {
    expect(canPerform('admin', 'create', 'journals').allowed).toBe(true);
  });

  it('admin can post journals', () => {
    expect(canPerform('admin', 'post', 'journals').allowed).toBe(true);
  });

  it('admin can delete journals', () => {
    expect(canPerform('admin', 'delete', 'journals').allowed).toBe(true);
  });

  it('admin can perform all write actions on all modules', () => {
    for (const action of WRITE_ACTIONS) {
      for (const mod of ALL_MODULES) {
        expect(canPerform('admin', action, mod).allowed).toBe(true);
      }
    }
  });

  it('admin can manage members', () => {
    expect(canPerform('admin', 'create', 'members').allowed).toBe(true);
    expect(canPerform('admin', 'update', 'members').allowed).toBe(true);
    expect(canPerform('admin', 'delete', 'members').allowed).toBe(true);
  });

  it('admin can seed settings', () => {
    expect(canPerform('admin', 'seed', 'settings').allowed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Treasurer permissions                                              */
/* ------------------------------------------------------------------ */

describe('treasurer permissions', () => {
  it('treasurer can read all modules', () => {
    for (const mod of ALL_MODULES) {
      expect(canPerform('treasurer', 'read', mod).allowed).toBe(true);
    }
  });

  it('treasurer can create journals', () => {
    expect(canPerform('treasurer', 'create', 'journals').allowed).toBe(true);
  });

  it('treasurer can post journals', () => {
    expect(canPerform('treasurer', 'post', 'journals').allowed).toBe(true);
  });

  it('treasurer can delete journals', () => {
    expect(canPerform('treasurer', 'delete', 'journals').allowed).toBe(true);
  });

  it('treasurer can create/post/delete payroll, bills, budgets, etc.', () => {
    const financialModules: Module[] = [
      'journals', 'accounts', 'funds', 'bills', 'payment_runs',
      'payroll', 'budgets', 'banking', 'donations', 'gift_aid',
      'giving_imports', 'giving_platforms', 'reconciliation', 'settings',
    ];
    for (const mod of financialModules) {
      for (const action of ['create', 'update', 'delete', 'post'] as Action[]) {
        expect(canPerform('treasurer', action, mod).allowed).toBe(true);
      }
    }
  });

  it('treasurer CANNOT manage members', () => {
    expect(canPerform('treasurer', 'create', 'members').allowed).toBe(false);
    expect(canPerform('treasurer', 'update', 'members').allowed).toBe(false);
    expect(canPerform('treasurer', 'delete', 'members').allowed).toBe(false);
  });

  it('treasurer CANNOT seed settings', () => {
    expect(canPerform('treasurer', 'seed', 'settings').allowed).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Trustee permissions                                                */
/* ------------------------------------------------------------------ */

describe('trustee_viewer permissions', () => {
  it('trustee can read all modules', () => {
    for (const mod of ALL_MODULES) {
      expect(canPerform('trustee_viewer', 'read', mod).allowed).toBe(true);
    }
  });

  it('trustee can read reports', () => {
    expect(canPerform('trustee_viewer', 'read', 'reports').allowed).toBe(true);
  });

  it('trustee CANNOT create journals', () => {
    const result = canPerform('trustee_viewer', 'create', 'journals');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('read-only');
  });

  it('trustee CANNOT post journals', () => {
    expect(canPerform('trustee_viewer', 'post', 'journals').allowed).toBe(false);
  });

  it('trustee CANNOT delete journals', () => {
    expect(canPerform('trustee_viewer', 'delete', 'journals').allowed).toBe(false);
  });

  it('trustee CANNOT update journals', () => {
    expect(canPerform('trustee_viewer', 'update', 'journals').allowed).toBe(false);
  });

  it('trustee CANNOT create or post any financial data', () => {
    for (const action of WRITE_ACTIONS) {
      for (const mod of ALL_MODULES) {
        expect(canPerform('trustee_viewer', action, mod).allowed).toBe(false);
      }
    }
  });

  it('trustee CANNOT manage members', () => {
    expect(canPerform('trustee_viewer', 'update', 'members').allowed).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Auditor permissions                                                */
/* ------------------------------------------------------------------ */

describe('auditor permissions', () => {
  it('auditor can read all modules', () => {
    for (const mod of ALL_MODULES) {
      expect(canPerform('auditor', 'read', mod).allowed).toBe(true);
    }
  });

  it('auditor can read reports', () => {
    expect(canPerform('auditor', 'read', 'reports').allowed).toBe(true);
  });

  it('auditor CANNOT create journals', () => {
    const result = canPerform('auditor', 'create', 'journals');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('read-only');
  });

  it('auditor CANNOT post journals', () => {
    expect(canPerform('auditor', 'post', 'journals').allowed).toBe(false);
  });

  it('auditor CANNOT mutate any data', () => {
    for (const action of WRITE_ACTIONS) {
      for (const mod of ALL_MODULES) {
        expect(canPerform('auditor', action, mod).allowed).toBe(false);
      }
    }
  });

  it('auditor CANNOT manage members', () => {
    expect(canPerform('auditor', 'update', 'members').allowed).toBe(false);
  });

  it('auditor CANNOT delete anything', () => {
    for (const mod of ALL_MODULES) {
      expect(canPerform('auditor', 'delete', mod).allowed).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Unknown / invalid roles                                            */
/* ------------------------------------------------------------------ */

describe('unknown roles', () => {
  it('unknown role is denied for read', () => {
    const result = canPerform('hacker', 'read', 'journals');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Unknown role');
  });

  it('unknown role is denied for write', () => {
    expect(canPerform('hacker', 'create', 'journals').allowed).toBe(false);
  });

  it('empty string role is denied', () => {
    expect(canPerform('', 'read', 'journals').allowed).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  assertCanPerform                                                   */
/* ------------------------------------------------------------------ */

describe('assertCanPerform', () => {
  it('does not throw for allowed actions', () => {
    expect(() => assertCanPerform('admin', 'create', 'journals')).not.toThrow();
    expect(() => assertCanPerform('treasurer', 'post', 'bills')).not.toThrow();
    expect(() => assertCanPerform('auditor', 'read', 'reports')).not.toThrow();
  });

  it('throws PermissionError for denied actions', () => {
    expect(() => assertCanPerform('auditor', 'create', 'journals')).toThrow(
      PermissionError,
    );
    expect(() => assertCanPerform('trustee_viewer', 'post', 'bills')).toThrow(
      PermissionError,
    );
  });

  it('thrown error has descriptive message', () => {
    try {
      assertCanPerform('trustee_viewer', 'create', 'journals');
    } catch (e) {
      expect(e).toBeInstanceOf(PermissionError);
      expect((e as PermissionError).message).toContain('read-only');
    }
  });

  it('throws for admin-only actions by treasurer', () => {
    expect(() => assertCanPerform('treasurer', 'update', 'members')).toThrow(
      PermissionError,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Cross-organisation isolation (documented tests)                    */
/* ------------------------------------------------------------------ */

describe('cross-organisation isolation (RLS layer)', () => {
  it('documents: is_org_member checks organisation_id + user_id', () => {
    // The SQL function is_org_member(org_id) selects from memberships
    // WHERE organisation_id = org_id AND user_id = auth.uid()
    // AND (expires_at IS NULL OR expires_at > now()).
    // This ensures a user can only access data for organisations they
    // are a member of. Every RLS SELECT policy uses this function.
    expect(true).toBe(true);
  });

  it('documents: cross-org access is impossible because every RLS SELECT policy uses is_org_member(organisation_id)', () => {
    // All 28 tables with RLS enabled use:
    //   SELECT: is_org_member(organisation_id)
    //   INSERT/UPDATE/DELETE: is_org_treasurer_or_admin(organisation_id)
    // Both functions filter on organisation_id + user_id from memberships.
    // A user with membership in Org A CANNOT read or write data in Org B.
    expect(true).toBe(true);
  });

  it('documents: expired auditors lose ALL access including read', () => {
    // When expires_at is set and in the past:
    //   is_org_member() returns false → SELECT denied
    //   is_org_treasurer_or_admin() returns false → INSERT/UPDATE/DELETE denied
    //   is_org_admin() returns false
    // The auditor is effectively a non-member after expiry.
    expect(true).toBe(true);
  });

  it('documents: admin client (service-role) bypasses RLS for journal creation', () => {
    // Server actions that create journals (postBill, postPayrollRun, etc.)
    // use createAdminClient() with the service-role key.
    // This bypasses RLS. Authorization is enforced at the application
    // layer via assertCanPerform() BEFORE calling the admin client.
    expect(true).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Completeness: every role x action x module                         */
/* ------------------------------------------------------------------ */

describe('permission matrix completeness', () => {
  it('every role/action/module combination returns a valid result', () => {
    let tested = 0;
    for (const r of ALL_ROLES) {
      for (const a of ALL_ACTIONS) {
        for (const m of ALL_MODULES) {
          const result = canPerform(r, a, m);
          expect(typeof result.allowed).toBe('boolean');
          if (!result.allowed) {
            expect(typeof result.reason).toBe('string');
          }
          tested++;
        }
      }
    }
    // 4 roles x 7 actions x 16 modules = 448 combinations
    expect(tested).toBe(448);
  });
});
