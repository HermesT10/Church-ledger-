import { createClient } from '@/lib/supabase/server';

/** Reads organisation_settings.require_fund_on_journal_lines for the workspace. */
export async function getRequireFundOnJournalLines(orgId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('organisation_settings')
    .select('require_fund_on_journal_lines')
    .eq('organisation_id', orgId)
    .maybeSingle();
  return Boolean(data?.require_fund_on_journal_lines);
}
