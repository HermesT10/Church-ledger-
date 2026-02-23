/**
 * Centralised permission matrix for ChurchLedger.
 *
 * All role-based access decisions are routed through canPerform() so that
 * the rules live in one place and are fully unit-testable.
 *
 * RLS at the database level mirrors these rules:
 *   - SELECT → is_org_member (any role with status = 'active')
 *   - INSERT/UPDATE/DELETE → is_org_treasurer_or_admin (admin + treasurer + finance_user)
 * Time-limited auditor access is enforced by is_org_member checking expires_at.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Role =
  | 'admin'
  | 'treasurer'
  | 'finance_user'
  | 'trustee_viewer'
  | 'viewer'
  | 'auditor';

export type Action =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'post'
  | 'approve'
  | 'seed';

export type Module =
  | 'journals'
  | 'accounts'
  | 'funds'
  | 'bills'
  | 'payment_runs'
  | 'payroll'
  | 'budgets'
  | 'banking'
  | 'cash'
  | 'donations'
  | 'gift_aid'
  | 'giving_imports'
  | 'giving_platforms'
  | 'reconciliation'
  | 'settings'
  | 'members'
  | 'reports'
  | 'workflows'
  | 'conversations';

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

/* ------------------------------------------------------------------ */
/*  All roles (exported for UI dropdowns)                              */
/* ------------------------------------------------------------------ */

export const ALL_ROLES: readonly Role[] = [
  'admin',
  'treasurer',
  'finance_user',
  'trustee_viewer',
  'viewer',
  'auditor',
] as const;

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  treasurer: 'Treasurer',
  finance_user: 'Finance User',
  trustee_viewer: 'Trustee Viewer',
  viewer: 'Viewer',
  auditor: 'Auditor',
};

/* ------------------------------------------------------------------ */
/*  Valid roles set                                                     */
/* ------------------------------------------------------------------ */

const VALID_ROLES: ReadonlySet<string> = new Set<Role>(ALL_ROLES);

/* ------------------------------------------------------------------ */
/*  Read-only roles set                                                */
/* ------------------------------------------------------------------ */

const READ_ONLY_ROLES: ReadonlySet<Role> = new Set<Role>([
  'trustee_viewer',
  'viewer',
  'auditor',
]);

/* ------------------------------------------------------------------ */
/*  Write actions set                                                  */
/* ------------------------------------------------------------------ */

const WRITE_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'create',
  'update',
  'delete',
  'post',
  'approve',
  'seed',
]);

/* ------------------------------------------------------------------ */
/*  Admin-only modules + actions                                       */
/* ------------------------------------------------------------------ */

/**
 * These module/action combos require the admin role specifically.
 * Treasurer and finance_user are not sufficient.
 */
const ADMIN_ONLY: ReadonlyArray<{ module: Module; actions: ReadonlySet<Action> }> = [
  {
    module: 'members',
    actions: new Set<Action>(['create', 'update', 'delete']),
  },
  {
    module: 'settings',
    actions: new Set<Action>(['seed']),
  },
];

function isAdminOnly(module: Module, action: Action): boolean {
  return ADMIN_ONLY.some(
    (entry) => entry.module === module && entry.actions.has(action),
  );
}

/* ------------------------------------------------------------------ */
/*  canPerform                                                         */
/* ------------------------------------------------------------------ */

/**
 * Pure function: determines whether a role is allowed to perform an action
 * on a module. Returns { allowed, reason? }.
 *
 * Role hierarchy:
 *   admin         → Full access including settings and user management
 *   treasurer     → Full finance access, cannot manage users
 *   finance_user  → Can post transactions, cannot approve or manage users/settings
 *   trustee_viewer→ Read-only access to dashboard, reports, funds
 *   viewer        → Read-only access to dashboard and reports
 *   auditor       → Read-only including transaction drill-down
 */
export function canPerform(
  role: string,
  action: Action,
  module: Module,
): PermissionResult {
  // Unknown role → deny
  if (!VALID_ROLES.has(role)) {
    return { allowed: false, reason: `Unknown role: ${role}` };
  }

  const typedRole = role as Role;

  // Read is allowed for all valid roles
  if (action === 'read') {
    return { allowed: true };
  }

  // Write actions
  if (WRITE_ACTIONS.has(action)) {
    // Exception: ALL roles can create/update conversations (internal messaging)
    if (module === 'conversations' && (action === 'create' || action === 'update')) {
      return { allowed: true };
    }

    // Read-only roles: trustee_viewer, viewer, auditor
    if (READ_ONLY_ROLES.has(typedRole)) {
      const label = ROLE_LABELS[typedRole] ?? typedRole;
      return {
        allowed: false,
        reason: `${label} has read-only access.`,
      };
    }

    // Admin-only checks
    if (isAdminOnly(module, action)) {
      if (typedRole !== 'admin') {
        return {
          allowed: false,
          reason: 'Only admins can perform this action.',
        };
      }
      return { allowed: true };
    }

    // finance_user cannot approve or seed
    if (typedRole === 'finance_user') {
      if (action === 'approve' || action === 'seed') {
        return {
          allowed: false,
          reason: 'Finance users cannot approve or seed data.',
        };
      }
      // finance_user cannot update settings
      if (module === 'settings' && (action === 'update' || action === 'create')) {
        return {
          allowed: false,
          reason: 'Finance users cannot change system settings.',
        };
      }
      return { allowed: true };
    }

    // Admin and treasurer can write
    if (typedRole === 'admin' || typedRole === 'treasurer') {
      return { allowed: true };
    }
  }

  return { allowed: false, reason: 'Permission denied.' };
}

/* ------------------------------------------------------------------ */
/*  assertCanPerform                                                   */
/* ------------------------------------------------------------------ */

/**
 * Throws a descriptive error if the role cannot perform the action.
 * Use in server actions as a one-liner replacement for inline role checks.
 */
export function assertCanPerform(
  role: string,
  action: Action,
  module: Module,
): void {
  const result = canPerform(role, action, module);
  if (!result.allowed) {
    throw new PermissionError(result.reason ?? 'Permission denied.');
  }
}

/* ------------------------------------------------------------------ */
/*  PermissionError                                                    */
/* ------------------------------------------------------------------ */

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}
