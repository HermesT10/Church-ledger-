import type { AnnualAccountsBasis, AnnualAccountsPack } from '@/lib/annual-accounts/types';

export type YearEndCloseBasis = AnnualAccountsBasis;

export type YearEndCloseRunStatus =
  | 'draft'
  | 'in_progress'
  | 'ready_for_review'
  | 'approved'
  | 'locked'
  | 'exported'
  | 'submitted'
  | 'archived';

export type YearEndCloseStepStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked' | 'waived';

export type YearEndCloseValidationStatus = 'passed' | 'warning' | 'blocked' | 'needs_review' | 'not_applicable';

export type YearEndCloseApprovalType =
  | 'trustee_review'
  | 'examiner_review'
  | 'final_approval'
  | 'submission_signoff';

export type FilingPackStatus = 'draft' | 'generated' | 'approved' | 'exported' | 'submitted' | 'archived';

export const YEAR_END_CLOSE_STEP_KEYS = [
  'confirm-financial-year-dates',
  'confirm-accounting-basis',
  'reconcile-bank-accounts',
  'review-unreconciled-transactions',
  'review-unposted-drafts',
  'review-income-register',
  'review-expense-register',
  'review-restricted-funds',
  'review-fund-transfers',
  'review-gift-aid-records',
  'review-payroll-records',
  'review-debtors-creditors',
  'review-fixed-assets',
  'review-loans-liabilities',
  'generate-trial-balance',
  'validate-balance-sheet',
  'generate-annual-accounts',
  'trustee-review',
  'independent-examination-checklist',
  'final-approval',
  'lock-financial-year',
  'export-filing-pack',
  'mark-submitted',
] as const;

export type YearEndCloseStepKey = (typeof YEAR_END_CLOSE_STEP_KEYS)[number];

export interface YearEndCloseEvidenceItem {
  id: string;
  title: string;
  source: string;
  href?: string;
  reference?: string;
  uploadedAt?: string;
}

export interface YearEndCloseDocumentItem {
  id: string;
  title: string;
  fileName?: string;
  storagePath?: string;
  source?: string;
}

export interface YearEndCloseBlocker {
  id: string;
  stepKey: YearEndCloseStepKey;
  severity: 'blocker' | 'warning' | 'info';
  title: string;
  message: string;
  source: string;
  count?: number;
  href?: string;
  recommendedAction: string;
  waivable: boolean;
}

export interface YearEndCloseStepDefinition {
  stepKey: YearEndCloseStepKey;
  stepNumber: number;
  title: string;
  description: string;
  dependencies: YearEndCloseStepKey[];
  validationSource:
    | 'periods'
    | 'basis'
    | 'bank_reconciliation'
    | 'bank_transactions'
    | 'drafts'
    | 'income_register'
    | 'expense_register'
    | 'funds'
    | 'fund_transfers'
    | 'gift_aid'
    | 'payroll'
    | 'balance_sheet_notes'
    | 'trial_balance'
    | 'balance_sheet'
    | 'annual_accounts'
    | 'approvals'
    | 'period_lock'
    | 'filing_pack'
    | 'submission';
  recommendedAction: string;
  canWaive: boolean;
}

export interface YearEndCloseStep {
  id: string;
  workspaceId: string;
  runId: string;
  stepKey: YearEndCloseStepKey;
  stepNumber: number;
  title: string;
  description: string;
  status: YearEndCloseStepStatus;
  assignedTo?: string | null;
  dueDate?: string | null;
  evidence: YearEndCloseEvidenceItem[];
  documents: YearEndCloseDocumentItem[];
  notes?: string | null;
  blockers: YearEndCloseBlocker[];
  waiverReason?: string | null;
  completedBy?: string | null;
  completedAt?: string | null;
}

export interface YearEndCloseRun {
  id: string;
  workspaceId: string;
  financialPeriodId?: string | null;
  financialYear: number;
  periodStart: string;
  periodEnd: string;
  basis: YearEndCloseBasis;
  status: YearEndCloseRunStatus;
  annualAccountsReportVersionId?: string | null;
  filingPackId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  lockedBy?: string | null;
  lockedAt?: string | null;
  submittedBy?: string | null;
  submittedAt?: string | null;
  submissionReference?: string | null;
  createdAt: string;
  updatedAt: string;
  steps: YearEndCloseStep[];
}

export interface YearEndCloseValidationSummary {
  runId: string;
  generatedAt: string;
  status: YearEndCloseValidationStatus;
  blockers: YearEndCloseBlocker[];
  stepStatuses: Partial<Record<YearEndCloseStepKey, YearEndCloseStepStatus>>;
  sourceCounts: Record<string, number>;
}

export interface AnnualReturnField {
  fieldKey: string;
  label: string;
  suggestedValue: string | number | boolean | null;
  source: string;
  confidence: 'low' | 'medium' | 'high';
  needsReview: boolean;
  notes: string;
}

export interface AnnualReturnAssistantSummary {
  generatedAt: string;
  financialYear: number;
  fields: AnnualReturnField[];
  checklist: {
    id: string;
    title: string;
    status: 'ready' | 'needs_review' | 'missing';
    source: string;
  }[];
}

export interface FilingPackDocument {
  id: string;
  title: string;
  description: string;
  format: 'pdf' | 'docx' | 'excel' | 'csv' | 'json';
  source: string;
  required: boolean;
}

export interface FilingPackPayload {
  runId: string;
  financialYear: number;
  generatedAt: string;
  annualAccounts: AnnualAccountsPack;
  annualReturnSummary: AnnualReturnAssistantSummary;
  documents: FilingPackDocument[];
  schedules: Record<string, unknown>;
  examinerChecklist: {
    id: string;
    title: string;
    source: string;
    status: 'ready' | 'needs_review' | 'missing';
  }[];
}

export interface FilingPack {
  id?: string;
  workspaceId: string;
  runId: string;
  financialYear: number;
  status: FilingPackStatus;
  annualAccountsReportVersionId?: string | null;
  annualReturnSummary: AnnualReturnAssistantSummary;
  packPayload: FilingPackPayload;
  evidenceIndex: YearEndCloseEvidenceItem[];
  exportManifest: FilingPackDocument[];
  generatedAt?: string | null;
  submittedAt?: string | null;
  submissionReference?: string | null;
}
