'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import type { FinancialPeriod } from './types';

/* ------------------------------------------------------------------ */
/*  List financial periods                                             */
/* ------------------------------------------------------------------ */

export async function listPeriods(): Promise<{
  data: FinancialPeriod[];
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('financial_periods')
    .select('*')
    .eq('organisation_id', orgId)
    .order('start_date', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

/* ------------------------------------------------------------------ */
/*  Create financial period                                            */
/* ------------------------------------------------------------------ */

export async function createPeriod(params: {
  name: string;
  startDate: string;
  endDate: string;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'settings');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  if (!params.name?.trim()) return { success: false, error: 'Period name is required.' };
  if (!params.startDate || !params.endDate) return { success: false, error: 'Start and end dates are required.' };
  if (params.endDate < params.startDate) return { success: false, error: 'End date must be after start date.' };

  const supabase = await createClient();

  const { error } = await supabase.from('financial_periods').insert({
    organisation_id: orgId,
    name: params.name.trim(),
    start_date: params.startDate,
    end_date: params.endDate,
    status: 'open',
  });

  if (error) {
    if (error.message.includes('unique') || error.message.includes('duplicate')) {
      return { success: false, error: 'A period with these dates already exists.' };
    }
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  Close / Lock period                                                */
/* ------------------------------------------------------------------ */

export async function closePeriod(
  periodId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'settings');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('financial_periods')
    .update({
      status: 'closed',
      closed_by: user.id,
      closed_at: new Date().toISOString(),
    })
    .eq('id', periodId)
    .eq('organisation_id', orgId)
    .eq('status', 'open');

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}

export async function lockPeriod(
  periodId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'settings');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('financial_periods')
    .update({
      status: 'locked',
      closed_by: user.id,
      closed_at: new Date().toISOString(),
    })
    .eq('id', periodId)
    .eq('organisation_id', orgId)
    .in('status', ['open', 'closed']);

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  Reopen period (admin only)                                         */
/* ------------------------------------------------------------------ */

export async function reopenPeriod(
  periodId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role } = await getActiveOrg();

  if (role !== 'admin') {
    return { success: false, error: 'Only admins can reopen periods.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('financial_periods')
    .update({ status: 'open', closed_by: null, closed_at: null })
    .eq('id', periodId)
    .eq('organisation_id', orgId);

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  Check if a date falls within a locked period                       */
/* ------------------------------------------------------------------ */

export async function isDateInLockedPeriod(
  journalDate: string,
): Promise<boolean> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data } = await supabase
    .from('financial_periods')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('status', 'locked')
    .lte('start_date', journalDate)
    .gte('end_date', journalDate)
    .limit(1);

  return (data?.length ?? 0) > 0;
}
