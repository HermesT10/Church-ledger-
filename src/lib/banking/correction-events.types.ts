export type CorrectionEventType = 'bank_statement_import_removed';

export interface CorrectionEventRow {
  id: string;
  workspace_id: string;
  organisation_id: string;
  event_type: CorrectionEventType;
  bank_statement_import_id: string;
  bank_account_id: string;
  created_by: string;
  reason: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
