import type { ReportLineTraceability, ReportTraceabilitySource } from './types';

export function createTraceabilitySource(params: ReportTraceabilitySource): ReportTraceabilitySource {
  return params;
}

export function createReportLineTraceability(params: ReportLineTraceability): ReportLineTraceability {
  return params;
}

export function summarizeJournalTraceability(params: {
  lineId: string;
  label: string;
  amountPence: number;
  journalId: string;
  accountId?: string | null;
  fundId?: string | null;
  transactionDate: string;
}): ReportLineTraceability {
  return createReportLineTraceability({
    line_id: params.lineId,
    label: params.label,
    amount: params.amountPence,
    sources: [
      createTraceabilitySource({
        source_type: 'journal_line',
        source_id: params.journalId,
        amount: params.amountPence,
        account_id: params.accountId ?? null,
        fund_id: params.fundId ?? null,
        transaction_date: params.transactionDate,
        evidence_status: 'unknown',
        href: `/journals/${params.journalId}`,
      }),
    ],
  });
}

export function emptyTraceability(): ReportLineTraceability[] {
  return [];
}
