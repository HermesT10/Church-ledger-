'use server';

import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  mergeWithDefaults,
  type WidgetConfig,
} from './widgetRegistry';
import { assertWriteAllowed } from '@/lib/demo';

/* ------------------------------------------------------------------ */
/*  getDashboardLayout                                                 */
/* ------------------------------------------------------------------ */

export async function getDashboardLayout(): Promise<WidgetConfig[]> {
  const user = await requireSession();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('dashboard_layout')
    .eq('id', user.id)
    .single();

  return mergeWithDefaults(
    profile?.dashboard_layout as WidgetConfig[] | null
  );
}

/* ------------------------------------------------------------------ */
/*  saveDashboardLayout                                                */
/* ------------------------------------------------------------------ */

export async function saveDashboardLayout(
  layout: WidgetConfig[]
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const user = await requireSession();
  const supabase = await createClient();

  const { error } = await supabase
    .from('profiles')
    .update({ dashboard_layout: layout as unknown as Record<string, unknown> })
    .eq('id', user.id);

  return { error: error?.message ?? null };
}
