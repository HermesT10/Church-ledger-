'use server';

import { z } from 'zod';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import type { IncomeStreamRow } from '@/lib/income-streams/types';

const codeSchema = z.string().trim().min(1).max(48).regex(/^[A-Za-z0-9_-]+$/, 'Code: letters, numbers, underscore, hyphen only');

const upsertIncomeStreamSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  defaultFundId: z.string().uuid().nullable().optional(),
  defaultIncomeAccountId: z.string().uuid().nullable().optional(),
});

export async function listIncomeStreams(options?: {
  activeOnly?: boolean;
}): Promise<{ data: IncomeStreamRow[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  let q = supabase
    .from('income_streams')
    .select('*')
    .eq('organisation_id', orgId)
    .order('name');

  if (options?.activeOnly) q = q.eq('status', 'active');

  const { data, error } = await q;
  return { data: (data ?? []) as IncomeStreamRow[], error: error?.message ?? null };
}

export async function createIncomeStream(
  raw: z.infer<typeof upsertIncomeStreamSchema>,
): Promise<{ ok: boolean; error: string | null; id?: string }> {
  await assertWriteAllowed();
  const { orgId, user, role } = await getActiveOrg();
  if (role !== 'admin' && role !== 'treasurer') {
    return { ok: false, error: 'Permission denied.' };
  }

  const parsed = upsertIncomeStreamSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.flatten().formErrors.join(' ') };
  }

  const supabase = await createClient();
  const row = parsed.data;

  const { data, error } = await supabase
    .from('income_streams')
    .insert({
      organisation_id: orgId,
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      default_fund_id: row.defaultFundId ?? null,
      default_income_account_id: row.defaultIncomeAccountId ?? null,
      status: 'active',
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'income_stream_create',
    entityType: 'income_stream',
    entityId: data.id,
    metadata: { code: row.code, name: row.name },
  });

  return { ok: true, error: null, id: data.id };
}

export async function updateIncomeStream(params: {
  id: string;
  patch: z.infer<typeof upsertIncomeStreamSchema>;
}): Promise<{ ok: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { user, role, orgId } = await getActiveOrg();
  if (role !== 'admin' && role !== 'treasurer') {
    return { ok: false, error: 'Permission denied.' };
  }

  const parsed = upsertIncomeStreamSchema.safeParse(params.patch);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.flatten().formErrors.join(' ') };
  }

  const supabase = await createClient();
  const row = parsed.data;

  const { error } = await supabase
    .from('income_streams')
    .update({
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      default_fund_id: row.defaultFundId ?? null,
      default_income_account_id: row.defaultIncomeAccountId ?? null,
    })
    .eq('id', params.id)
    .eq('organisation_id', orgId);

  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'income_stream_update',
    entityType: 'income_stream',
    entityId: params.id,
    metadata: { code: row.code },
  });

  return { ok: true, error: null };
}

export async function archiveIncomeStream(id: string): Promise<{ ok: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { user, role, orgId } = await getActiveOrg();
  if (role !== 'admin' && role !== 'treasurer') {
    return { ok: false, error: 'Permission denied.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('income_streams')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('organisation_id', orgId);

  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'income_stream_archive',
    entityType: 'income_stream',
    entityId: id,
  });

  return { ok: true, error: null };
}
