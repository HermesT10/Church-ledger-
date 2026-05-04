export type RegisterType = 'income' | 'expense';
export type RegisterCategoryStatus = 'active' | 'archived';
export type RegisterViewMode = 'actual' | 'budget' | 'variance';
export type RegisterGroupBy = 'category' | 'supplier' | 'account' | 'fund';
export type RegisterMappingConfidence = 'high' | 'medium' | 'low';

export interface RegisterCategoryRow {
  id: string;
  organisation_id: string;
  register_type: RegisterType;
  name: string;
  group_name: string | null;
  display_order: number;
  status: RegisterCategoryStatus;
  default_account_id: string | null;
  default_fund_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegisterCategoryMappingRow {
  id: string;
  organisation_id: string;
  register_type: RegisterType;
  register_category_id: string;
  account_id: string | null;
  income_stream_id: string | null;
  supplier_id: string | null;
  donor_id: string | null;
  lettings_hirer_id: string | null;
  payroll_component: string | null;
  fund_id: string | null;
  bank_rule_id: string | null;
  description_pattern: string | null;
  priority: number;
  mapping_type: string;
  mapping_confidence: RegisterMappingConfidence;
  needs_review: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
  created_from_transaction_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegisterMonthCell {
  month: number;
  actualPence: number;
  budgetPence: number;
  variancePence: number;
  comparisonActualPence: number | null;
  comparisonVariancePence: number | null;
  unreconciledCount: number;
}

export interface RegisterRow {
  categoryId: string;
  name: string;
  groupName: string | null;
  displayOrder: number;
  isUncategorized: boolean;
  months: RegisterMonthCell[];
  totalActualPence: number;
  totalBudgetPence: number;
  totalVariancePence: number;
  comparisonTotalActualPence: number | null;
  reviewCount: number;
  sourceType: RegisterGroupBy;
  sourceId: string | null;
}

export interface RegisterFundFilter {
  id: string;
  name: string;
  type: string;
}

export interface RegisterData {
  registerType: RegisterType;
  year: number;
  comparisonYear: number | null;
  fundId: string | null;
  funds: RegisterFundFilter[];
  rows: RegisterRow[];
  monthlyTotals: RegisterMonthCell[];
  totals: {
    actualPence: number;
    budgetPence: number;
    variancePence: number;
    comparisonActualPence: number | null;
  };
  insights: string[];
  unmappedAccountCount: number;
  groupBy: RegisterGroupBy;
  reviewItems: RegisterReviewItem[];
}

export interface RegisterDrillDownItem {
  journalId: string;
  journalDate: string;
  description: string;
  memo: string | null;
  accountName: string;
  fundName: string | null;
  amountPence: number;
  sourceType: string | null;
  sourceId: string | null;
  bankTransactionId: string | null;
  reconciliationStatus: string;
  attachmentStatus: string;
  createdBy: string | null;
  supplierName: string | null;
  supplierId: string | null;
  incomeStreamName: string | null;
  accountId: string;
  fundId: string | null;
  hasAttachment: boolean;
  mappingNeedsReview: boolean;
  /** True when this journal is a posted GL reversal (reversal_of is set). */
  isReversalJournal: boolean;
}

export interface RegisterDrillDownData {
  registerType: RegisterType;
  year: number;
  month: number;
  categoryName: string;
  totalPence: number;
  items: RegisterDrillDownItem[];
}

export interface RegisterReviewItem {
  id: string;
  lineId: string;
  month: number;
  journalId: string;
  journalDate: string;
  description: string;
  amountPence: number;
  accountId: string;
  accountName: string;
  supplierId: string | null;
  supplierName: string | null;
  fundId: string | null;
  fundName: string | null;
  currentCategoryId: string;
  currentCategoryName: string;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  suggestionReason: string | null;
  reason: string;
  confidence: RegisterMappingConfidence;
}
