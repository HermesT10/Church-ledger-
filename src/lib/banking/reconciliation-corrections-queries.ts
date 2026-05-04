import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type ReconciliationCorrectionListItem = {
  id: string;
  bank_line_id: string;
  created_at: string;
  correction_type: string;
  original_source_type: string;
  journal_action: string | null;
  reason: string;
  reversal_journal_id: string | null;
  original_journal_id: string | null;
};

/** Corrections for the given bank lines, newest first per line (unordered across lines). */
export async function getReconciliationCorrectionsForBankLines(
  orgId: string,
  bankLineIds: string[],
): Promise<Map<string, ReconciliationCorrectionListItem[]>> {
  const map = new Map<string, ReconciliationCorrectionListItem[]>();
  if (bankLineIds.length === 0) return map;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('reconciliation_corrections')
    .select(
      'id, bank_line_id, created_at, correction_type, original_source_type, journal_action, reason, reversal_journal_id, original_journal_id',
    )
    .eq('workspace_id', orgId)
    .in('bank_line_id', bankLineIds)
    .order('created_at', { ascending: false });

  if (error || !data) return map;

  for (const row of data) {
    const lineId = row.bank_line_id as string;
    const item: ReconciliationCorrectionListItem = {
      id: row.id as string,
      bank_line_id: lineId,
      created_at: row.created_at as string,
      correction_type: row.correction_type as string,
      original_source_type: row.original_source_type as string,
      journal_action: (row.journal_action as string | null) ?? null,
      reason: row.reason as string,
      reversal_journal_id: (row.reversal_journal_id as string | null) ?? null,
      original_journal_id: (row.original_journal_id as string | null) ?? null,
    };
    const list = map.get(lineId) ?? [];
    list.push(item);
    map.set(lineId, list);
  }

  for (const list of map.values()) {
    list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  return map;
}
