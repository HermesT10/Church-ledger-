import type { ReportExportFormat, ReportStatus, ReportTypeKey } from '@/lib/reports/engine/types';
import type { ReportTone } from '@/lib/reports/framework';

export type TrusteePackType =
  | 'monthly_dashboard'
  | 'trustee_snapshot'
  | 'leadership_snapshot'
  | 'quarterly'
  | 'agm';

export const TRUSTEE_PACK_SECTION_KEYS = [
  'cover',
  'executive_summary',
  'key_financial_kpis',
  'income_expenditure',
  'budget_vs_actual',
  'restricted_funds',
  'cash_position',
  'bank_reconciliation',
  'gift_aid',
  'lettings_income',
  'supplier_spend',
  'payroll_summary',
  'risks_alerts',
  'recommended_actions',
  'appendices',
] as const;

export type TrusteePackSectionKey = (typeof TRUSTEE_PACK_SECTION_KEYS)[number];

export type TrusteePackChartType =
  | 'income_vs_expenses'
  | 'budget_variance'
  | 'restricted_funds_remaining'
  | 'cash_trend'
  | 'top_expense_categories'
  | 'supplier_spend';

export interface TrusteePackMetric {
  label: string;
  value: string;
  helper?: string;
  tone?: ReportTone;
}

export interface TrusteePackChartPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

export interface TrusteePackChart {
  type: TrusteePackChartType;
  title: string;
  description: string;
  data: TrusteePackChartPoint[];
  emptyState?: string;
}

export interface TrusteePackTable {
  headers: string[];
  rows: string[][];
}

export interface TrusteePackSection {
  key: TrusteePackSectionKey;
  title: string;
  description: string;
  status: 'populated' | 'empty' | 'not_applicable' | 'needs_review';
  metrics: TrusteePackMetric[];
  narrative: string[];
  table?: TrusteePackTable;
  charts: TrusteePackChart[];
  sourceRefs: string[];
}

export interface TrusteePackKpi extends TrusteePackMetric {
  source: string;
}

export interface TrusteePackAction {
  id: string;
  title: string;
  body: string;
  priority: 'low' | 'medium' | 'high';
  source: string;
}

export interface TrusteePackCommentaryItem {
  id: string;
  title: string;
  body: string;
  tone: ReportTone;
  source: string;
  calculation: string;
  editableText: string;
  adminOverrideText?: string | null;
}

export interface TrusteePackDefinition {
  term: string;
  meaning: string;
}

export interface TrusteePackApproval {
  status: ReportStatus;
  preparedBy?: string | null;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  trusteeReviewNotes: string[];
  internalComments: string[];
}

export interface TrusteePackExport {
  format: ReportExportFormat;
  label: string;
  description: string;
  requiresApproval: boolean;
}

export interface TrusteePack {
  id: string;
  type: TrusteePackType;
  reportType: ReportTypeKey;
  title: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  generatedBy?: string | null;
  sections: TrusteePackSection[];
  kpis: TrusteePackKpi[];
  commentary: TrusteePackCommentaryItem[];
  definitions: TrusteePackDefinition[];
  actions: TrusteePackAction[];
  approval: TrusteePackApproval;
  exports: TrusteePackExport[];
  sourceReports: Record<string, unknown>;
}

export interface TrusteePackExportResult {
  format: ReportExportFormat;
  filename: string;
  mimeType: string;
  content: string;
  metadata: {
    reportType: TrusteePackType;
    status: ReportStatus;
    generatedAt: string;
    sectionCount: number;
    commentaryCount: number;
  };
}
