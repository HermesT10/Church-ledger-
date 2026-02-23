/* ------------------------------------------------------------------ */
/*  Financial Periods — shared types                                   */
/* ------------------------------------------------------------------ */

export type PeriodStatus = 'open' | 'closed' | 'locked';

export interface FinancialPeriod {
  id: string;
  organisation_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: PeriodStatus;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
}

export const PERIOD_STATUS_LABELS: Record<PeriodStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  locked: 'Locked',
};
