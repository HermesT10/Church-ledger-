import type { Module } from '@/lib/permissions';

export const FINANCIAL_EVIDENCE_BUCKET = 'financial-evidence';

export const EVIDENCE_MODULE_BY_ENTITY_TYPE: Record<string, Module> = {
  bills: 'bills',
  'invoice-submissions': 'workflows',
  'cash-collection-submissions': 'cash',
  'portal-expense-submissions': 'transactions',
  journals: 'journals',
  'payment-runs': 'payment_runs',
  'payroll-runs': 'payroll',
  'cash-spends': 'cash',
  'gift-aid': 'gift_aid',
  'bank-imports': 'banking',
  reconciliations: 'reconciliation',
  transactions: 'transactions',
};

export function buildEvidenceAccessPath(storagePath: string): string {
  return `/api/evidence?path=${encodeURIComponent(storagePath)}`;
}
