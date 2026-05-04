import type { ReportExportFormat } from '@/lib/reports/engine/types';

export type AnnualAccountsBasis = 'cash' | 'accruals';

export const ANNUAL_ACCOUNTS_STEPS = [
  'select-financial-year',
  'select-accounting-basis',
  'confirm-charity-details',
  'review-trustees-officers',
  'review-financial-statements',
  'review-notes',
  'add-trustee-narrative',
  'attach-examiner-details',
  'validate-pack',
  'trustee-approval',
  'export-final-pack',
] as const;

export type AnnualAccountsStep = (typeof ANNUAL_ACCOUNTS_STEPS)[number];

export type AnnualAccountsDraftStatus = 'draft' | 'review' | 'approved' | 'final' | 'archived';

export interface AnnualAccountsCharityDetails {
  charityName: string;
  legalName: string;
  charityNumber: string;
  principalAddress: string;
  governingDocument: string;
  charityObjects: string;
  publicBenefitStatement: string;
  treasurerName: string;
  bankAccountNames: string[];
}

export interface AnnualAccountsTrusteeOfficer {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  appointedAt?: string | null;
  resignedAt?: string | null;
}

export interface AnnualAccountsExaminerDetails {
  name: string;
  firm: string;
  address: string;
  qualification: string;
  reportText: string;
}

export interface AnnualAccountsNarrativeSections {
  objectivesActivities: string;
  publicBenefit: string;
  achievementsPerformance: string;
  financialReview: string;
  reservesPolicy: string;
  principalRisks: string;
  futurePlans: string;
  structureGovernance: string;
  referenceAdminDetails: string;
  reviewed: boolean;
}

export interface AnnualAccountsNote {
  id: string;
  title: string;
  category:
    | 'accounting-policy'
    | 'income'
    | 'expenditure'
    | 'funds'
    | 'assets'
    | 'liabilities'
    | 'payroll'
    | 'trustees'
    | 'related-parties'
    | 'reserves'
    | 'comparatives';
  required: boolean;
  recommended: boolean;
  text: string;
  amountPence?: number;
  missingReason?: string;
  sourceRefs: string[];
}

export interface AnnualAccountsValidationResult {
  id: string;
  severity: 'blocker' | 'warning' | 'info';
  title: string;
  message: string;
  status: 'passed' | 'failed' | 'needs_review';
  source?: string;
}

export interface AnnualAccountsApproval {
  approvedByName: string;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  trusteeMeetingDate?: string | null;
  signatureName: string;
  final: boolean;
}

export interface AnnualAccountsFundColumns {
  unrestrictedPence: number;
  restrictedPence: number;
  designatedPence: number;
  totalCurrentYearPence: number;
  totalPriorYearPence: number;
}

export interface AnnualAccountsSOFARow extends AnnualAccountsFundColumns {
  id: string;
  section: 'income' | 'expenditure' | 'gains-losses' | 'fund-movement';
  label: string;
}

export interface AnnualAccountsBalanceSheetRow {
  id: string;
  section:
    | 'fixed-assets'
    | 'current-assets'
    | 'debtors'
    | 'cash'
    | 'creditors-current'
    | 'creditors-long-term'
    | 'net-assets'
    | 'funds';
  label: string;
  currentYearPence: number;
  priorYearPence: number;
}

export interface AnnualAccountsEvidenceIndexItem {
  id: string;
  title: string;
  source: string;
  reference: string;
  date?: string | null;
  amountPence?: number | null;
}

export interface AnnualAccountsPack {
  financialYear: number;
  basis: AnnualAccountsBasis;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  generatedBy?: string | null;
  charityDetails: AnnualAccountsCharityDetails;
  trusteesAndOfficers: AnnualAccountsTrusteeOfficer[];
  examinerDetails: AnnualAccountsExaminerDetails;
  narrativeSections: AnnualAccountsNarrativeSections;
  sofaRows: AnnualAccountsSOFARow[];
  balanceSheetRows: AnnualAccountsBalanceSheetRow[];
  cashflow: unknown;
  notes: AnnualAccountsNote[];
  evidenceIndex: AnnualAccountsEvidenceIndexItem[];
  validationResults: AnnualAccountsValidationResult[];
  approval: AnnualAccountsApproval;
  exports: AnnualAccountsExportDescriptor[];
  sourceReports: Record<string, unknown>;
}

export interface AnnualAccountsDraft {
  id?: string;
  workspaceId: string;
  financialYear: number;
  basis: AnnualAccountsBasis;
  currentStep: AnnualAccountsStep;
  charityDetails: AnnualAccountsCharityDetails;
  trusteesAndOfficers: AnnualAccountsTrusteeOfficer[];
  examinerDetails: AnnualAccountsExaminerDetails;
  narrativeSections: AnnualAccountsNarrativeSections;
  notes: AnnualAccountsNote[];
  validationResults: AnnualAccountsValidationResult[];
  approval: AnnualAccountsApproval;
  status: AnnualAccountsDraftStatus;
  reportVersionId?: string | null;
}

export interface AnnualAccountsExportDescriptor {
  format: ReportExportFormat | 'evidence-index';
  label: string;
  description: string;
  requiresApproval: boolean;
}
