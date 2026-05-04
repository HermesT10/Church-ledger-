import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { CorrectionEventRow } from '@/lib/banking/correction-events.types';

export async function listCorrectionEventsForStatementImport(
  orgId: string,
  statementImportId: string,
): Promise<{ data: CorrectionEventRow[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('correction_events')
    .select('*')
    .eq('workspace_id', orgId)
    .eq('bank_statement_import_id', statementImportId)
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as CorrectionEventRow[], error: null };
}

export async function insertBankStatementImportRemovalEvent(params: {
  orgId: string;
  statementImportId: string;
  bankAccountId: string;
  userId: string;
  reason: string;
  metadata: Record<string, unknown>;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from('correction_events').insert({
    workspace_id: params.orgId,
    organisation_id: params.orgId,
    event_type: 'bank_statement_import_removed',
    bank_statement_import_id: params.statementImportId,
    bank_account_id: params.bankAccountId,
    created_by: params.userId,
    reason: params.reason.trim(),
    metadata: params.metadata,
  });
  return { error: error?.message ?? null };
}
