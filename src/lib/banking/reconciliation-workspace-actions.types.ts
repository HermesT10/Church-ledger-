import type { BankLedgerLinkValidation } from './ledger-link.types';
import type { ManualTransactionLineInput, TransactionType } from '@/lib/transactions/types';

export type ReconciliationWorkspaceBankLine = {
  id: string;
  bank_account_id: string;
  txn_date: string;
  transaction_time: string | null;
  description: string | null;
  additional_description: string | null;
  display_description: string | null;
  reference: string | null;
  amount_pence: number;
  amount: number | null;
  direction: 'in' | 'out' | null;
  money_in: number | null;
  money_out: number | null;
  balance_pence: number | null;
  running_balance: number | null;
  status: string | null;
  reconciled: boolean;
  allocated: boolean;
  posted_journal_id: string | null;
  matched_source_type: string | null;
  matched_source_id: string | null;
  raw: Record<string, unknown> | null;
};

export type ReconciliationQueueFilter = 'needs_reconciliation' | 'reconciled' | 'excluded' | 'all';

export type ReconciliationQueueCounts = Record<ReconciliationQueueFilter, number>;

export type ReconciliationWorkspaceData = {
  bankAccounts: { id: string; name: string }[];
  selectedBankAccountId: string | null;
  selectedBankAccountLedgerLink: BankLedgerLinkValidation | null;
  filter: ReconciliationQueueFilter;
  counts: ReconciliationQueueCounts;
  transactions: ReconciliationWorkspaceBankLine[];
};

export type CreateAndReconcileInput = {
  bankTransactionId: string;
  type: TransactionType | 'donation' | 'lettings_income' | 'gift_aid_hmrc_payment' | 'payroll_payment' | 'exclude';
  description: string;
  accountId?: string | null;
  fundId?: string | null;
  incomeStreamId?: string | null;
  donorId?: string | null;
  supplierId?: string | null;
  quickCreateDonor?: {
    fullName: string;
    title?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    townCity?: string | null;
    postcode?: string | null;
    email?: string | null;
  } | null;
  quickCreateSupplier?: {
    name: string;
    email?: string | null;
    phone?: string | null;
    bankAlias?: string | null;
  } | null;
  giftAidEligible?: boolean;
  addGiftAidFollowUp?: boolean;
  generateGiftAidDeclarationLink?: boolean;
  rememberBankReference?: boolean;
  transferFromAccountId?: string | null;
  transferToAccountId?: string | null;
  lines?: ManualTransactionLineInput[];
  /** Lettings Income: reconcile to an existing charge (mutually exclusive with createNewLetting). */
  lettingsChargeId?: string | null;
  /** Lettings Income: create hirer + charge then reconcile (mutually exclusive with lettingsChargeId). */
  createNewLetting?: boolean;
  /** Hirer / customer name when createNewLetting. */
  lettingName?: string | null;
  /** Booking notes stored on lettings_charges.description when createNewLetting. */
  lettingChargeNotes?: string | null;
  /** Charge period (YYYY-MM-DD); month/year derived for the charge. Defaults to bank txn date. */
  lettingPeriodDate?: string | null;
};

export type ExclusionReason = 'duplicate' | 'opening_balance' | 'informational_line' | 'bank_metadata' | 'other';
