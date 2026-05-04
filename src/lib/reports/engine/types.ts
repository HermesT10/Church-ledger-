export type ReportBasis = 'cash' | 'accruals';
export type ReportStatus = 'draft' | 'review' | 'approved' | 'exported' | 'archived';
export type ReportExportFormat = 'pdf' | 'csv' | 'excel' | 'docx';
export type ReportValidationSeverity = 'info' | 'warning' | 'blocker';

export type ReportTypeKey =
  | 'monthly_dashboard'
  | 'income_statement'
  | 'income_expense_summary'
  | 'balance_sheet'
  | 'sofa'
  | 'cash_flow'
  | 'trial_balance'
  | 'budget_vs_actual'
  | 'fund_movements'
  | 'bank_reconciliation_summary'
  | 'gift_aid_summary'
  | 'lettings'
  | 'forecast'
  | 'cash_position'
  | 'supplier_spend'
  | 'payroll_summary'
  | 'payroll_employer_costs'
  | 'payroll_by_fund_ministry'
  | 'payroll_pension_contributions'
  | 'payroll_paye_nic_liability'
  | 'payroll_vs_budget'
  | 'trustee_snapshot'
  | 'leadership_snapshot'
  | 'quarterly'
  | 'annual'
  | 'agm'
  | 'export_pack';

export interface ReportFilters {
  year?: number;
  month?: number;
  quarter?: number;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  fundId?: string | null;
  budgetId?: string | null;
  basis?: ReportBasis;
  [key: string]: string | number | boolean | null | undefined;
}

export interface ProfessionalReportMetadata {
  report_id: string;
  workspace_id: string;
  report_type: ReportTypeKey;
  report_title: string;
  period_start: string;
  period_end: string;
  financial_year: number | null;
  basis: ReportBasis;
  funds_included: string[];
  filters_applied: ReportFilters;
  generated_by: string;
  generated_at: string;
  prepared_by: string;
  reviewed_by: string | null;
  approved_by: string | null;
  status: ReportStatus;
  version: number;
}

export interface ReportDefinition {
  key: ReportTypeKey;
  title: string;
  description: string;
  requiredDataSources: string[];
  supportedFilters: string[];
  supportedExportFormats: ReportExportFormat[];
  defaultLayout: 'dashboard' | 'statement' | 'pack' | 'table' | 'snapshot';
  trusteeExplanation: string;
  validationRules: string[];
}

export interface ReportValidationResult {
  id: string;
  severity: ReportValidationSeverity;
  rule: string;
  title: string;
  message: string;
  sourceType?: string;
  sourceId?: string;
  amountPence?: number;
}

export interface ReportTraceabilitySource {
  source_type: string;
  source_id: string;
  amount: number;
  account_id: string | null;
  fund_id: string | null;
  transaction_date: string;
  evidence_status: 'attached' | 'missing' | 'not_required' | 'unknown';
  href: string | null;
}

export interface ReportLineTraceability {
  line_id: string;
  label: string;
  amount: number;
  sources: ReportTraceabilitySource[];
}

export interface ReportSnapshot {
  metadata: ProfessionalReportMetadata;
  definition: ReportDefinition;
  data: unknown;
  validation: ReportValidationResult[];
  traceability: ReportLineTraceability[];
  commentary: string[];
  generated_at: string;
}

export interface ReportExportResult {
  reportId: string;
  format: ReportExportFormat;
  fileName: string;
  contentType: string;
  payload: string;
  checksumSha256: string;
}
