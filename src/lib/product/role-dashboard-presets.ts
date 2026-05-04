import type { Role } from '@/lib/permissions';

export interface RoleDashboardPreset {
  title: string;
  summary: string;
  primaryActions: Array<{ label: string; href: string }>;
}

export const ROLE_DASHBOARD_PRESETS: Record<Role, RoleDashboardPreset> = {
  admin: {
    title: 'Admin command centre',
    summary: 'Focus on users, settings, approvals, and organisation health.',
    primaryActions: [
      { label: 'Manage settings', href: '/settings' },
      { label: 'Review access', href: '/settings' },
      { label: 'Open export pack', href: '/reports/export-pack' },
    ],
  },
  treasurer: {
    title: 'Treasurer workspace',
    summary: 'Prioritise month-end controls, approvals, reconciliation, and board-ready reports.',
    primaryActions: [
      { label: 'Reconcile banking', href: '/reconciliation' },
      { label: 'Review bills', href: '/bills' },
      { label: 'Generate reports', href: '/reports' },
    ],
  },
  finance_user: {
    title: 'Finance processing workspace',
    summary: 'Process imports, draft transactions, and prepare work for approval.',
    primaryActions: [
      { label: 'Import giving', href: '/giving-imports' },
      { label: 'Create bill', href: '/bills/new' },
      { label: 'Banking', href: '/banking' },
    ],
  },
  trustee_viewer: {
    title: 'Trustee overview',
    summary: 'Read plain-language summaries, risk indicators, and board packs.',
    primaryActions: [
      { label: 'Trustee snapshot', href: '/reports/trustee-snapshot' },
      { label: 'Leadership snapshot', href: '/reports/leadership-snapshot' },
      { label: 'Export pack', href: '/reports/export-pack' },
    ],
  },
  viewer: {
    title: 'Read-only overview',
    summary: 'Monitor headline performance and reports without changing finance data.',
    primaryActions: [
      { label: 'Reports', href: '/reports' },
      { label: 'Dashboard', href: '/dashboard' },
    ],
  },
  auditor: {
    title: 'Auditor review workspace',
    summary: 'Trace balances, review evidence, and inspect source activity.',
    primaryActions: [
      { label: 'Trial balance', href: '/reports/trial-balance' },
      { label: 'Audit log', href: '/settings/audit-log' },
      { label: 'Reconciliation', href: '/reconciliation' },
    ],
  },
};

export function getRoleDashboardPreset(role: string): RoleDashboardPreset {
  return ROLE_DASHBOARD_PRESETS[role as Role] ?? ROLE_DASHBOARD_PRESETS.viewer;
}
