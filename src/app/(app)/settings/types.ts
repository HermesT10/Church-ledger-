/* Settings types (shared, not a server action file) */

export interface OrgSettings {
  organisationName: string;
  overspendAmountPence: number;
  overspendPercent: number;
  fiscalYearStartMonth: number;
  timezone: string;
  dateFormat: string;
  defaultBankAccountId: string | null;
  defaultCreditorsAccountId: string | null;
  forecastRiskTolerancePence: number;
  requireFundOnJournalLines: boolean;
  allowFundLevelBudgets: boolean;
  emailNotifications: boolean;
  overspendAlertNotifications: boolean;
  monthEndReminder: boolean;
  payrollSalariesAccountId: string | null;
  payrollErNicAccountId: string | null;
  payrollPensionAccountId: string | null;
  payrollPayeNicLiabilityId: string | null;
  payrollPensionLiabilityId: string | null;
  payrollNetPayLiabilityId: string | null;
  // Gift Aid account mappings
  giftAidIncomeAccountId: string | null;
  giftAidBankAccountId: string | null;
  giftAidDefaultFundId: string | null;
  giftAidUseProportionalFunds: boolean;
  // Cash Management
  cashInHandAccountId: string | null;
  // Donations
  defaultDonationsIncomeAccountId: string | null;
  defaultDonationsBankAccountId: string | null;
  defaultDonationsFeeAccountId: string | null;
  // Workflow settings
  receiptComplianceDays: number;
}

export interface MemberRow {
  userId: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: 'invited' | 'active' | 'disabled';
  createdAt: string;
  joinedAt: string | null;
  expiresAt: string | null;
}
