import type { AnnualAccountsBasis, AnnualAccountsNarrativeSections, AnnualAccountsPack } from '@/lib/annual-accounts/types';
import type { AnnualReturnAssistantSummary } from '@/lib/year-end-close/types';

export type CharityAccountsAssistantStepKey =
  | 'charity-details'
  | 'financial-records'
  | 'supporting-schedules'
  | 'accounts-production'
  | 'trustee-report'
  | 'independent-examination'
  | 'annual-return-data-pack'
  | 'final-pack';

export type CharityAccountsChecklistStatus = 'ready' | 'needs_review' | 'missing' | 'blocked';

export interface CharityAccountsChecklistItem {
  id: string;
  stepKey: CharityAccountsAssistantStepKey;
  title: string;
  description: string;
  status: CharityAccountsChecklistStatus;
  source: string;
  href?: string;
  blocker?: boolean;
}

export interface CharityAccountsReadinessSummary {
  score: number;
  status: 'ready' | 'needs_review' | 'blocked';
  readyCount: number;
  totalCount: number;
  blockers: CharityAccountsChecklistItem[];
  warnings: CharityAccountsChecklistItem[];
}

export interface CharityAccountsSupportingSchedule {
  id: string;
  title: string;
  description: string;
  status: CharityAccountsChecklistStatus;
  source: string;
  href?: string;
}

export interface CharityAccountsFinalPackDocument {
  id: string;
  title: string;
  description: string;
  format: 'pdf' | 'docx' | 'excel' | 'csv' | 'json' | 'pack';
  source: string;
  required: boolean;
  href?: string;
}

export interface CharityAccountsAnnualReturnDataPack {
  generatedAt: string;
  financialYear: number;
  grossIncomePence: number;
  grossExpenditurePence: number;
  trusteeCount: number;
  trustees: string[];
  hasStaffOrPayroll: boolean;
  activities: string | null;
  grants: string | null;
  publicBenefitNarrative: string | null;
  reservesPolicy: string | null;
  riskNotes: string | null;
  keyFinancialFigures: Array<{ label: string; amountPence: number }>;
  assistantSummary: AnnualReturnAssistantSummary;
}

export interface CharityAccountsAssistantSnapshot {
  financialYear: number;
  basis: AnnualAccountsBasis;
  generatedAt: string;
  annualAccounts: AnnualAccountsPack;
  charityDetails: AnnualAccountsPack['charityDetails'];
  trusteesAndOfficers: AnnualAccountsPack['trusteesAndOfficers'];
  narrativeSections: AnnualAccountsNarrativeSections;
  checklist: CharityAccountsChecklistItem[];
  readiness: CharityAccountsReadinessSummary;
  supportingSchedules: CharityAccountsSupportingSchedule[];
  annualReturnDataPack: CharityAccountsAnnualReturnDataPack;
  finalPackDocuments: CharityAccountsFinalPackDocument[];
}
