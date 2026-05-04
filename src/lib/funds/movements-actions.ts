'use server';

import { z } from 'zod';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';

const transferCreateSchema = z.object({
  fromFundId: z.string().uuid(),
  toFundId: z.string().uuid(),
  amountPence: z.number().int().positive(),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(2000).optional().nullable(),
});

const adjustmentCreateSchema = z.object({
  fundId: z.string().uuid(),
  amountPence: z.number().int().positive(),
  direction: z.enum(['increase', 'decrease']),
  adjustmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1).max(2000),
});

export type FundTransferRow = {
  id: string;
  organisation_id: string;
  from_fund_id: string;
  to_fund_id: string;
  amount_pence: number;
  transfer_date: string;
  reason: string | null;
  status: 'draft' | 'approved' | 'posted' | 'reversed';
  posted_journal_id: string | null;
  created_at: string;
};

export type FundAdjustmentRow = {
  id: string;
  organisation_id: string;
  fund_id: string;
  amount_pence: number;
  direction: 'increase' | 'decrease';
  adjustment_date: string;
  reason: string;
  status: 'draft' | 'approved' | 'posted' | 'reversed';
  posted_journal_id: string | null;
  created_at: string;
};

export async function listFundTransfers(): Promise<{ data: FundTransferRow[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('fund_transfers')
    .select('*')
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100);

  return { data: (data ?? []) as FundTransferRow[], error: error?.message ?? null };
}

export async function createFundTransferDraft(raw: z.infer<typeof transferCreateSchema>): Promise<{ ok: boolean; error: string | null; id?: string }> {
  await assertWriteAllowed();
  const { orgId, user, role } = await getActiveOrg();
  if (role !== 'admin' && role !== 'treasurer') {
    return { ok: false, error: 'Permission denied.' };
  }

  const parsed = transferCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.flatten().formErrors.join(' ') };
  }
  if (parsed.data.fromFundId === parsed.data.toFundId) {
    return { ok: false, error: 'Choose two different funds.' };
  }

  const supabase = await createClient();
  const row = parsed.data;

  const { data, error } = await supabase
    .from('fund_transfers')
    .insert({
      organisation_id: orgId,
      from_fund_id: row.fromFundId,
      to_fund_id: row.toFundId,
      amount_pence: row.amountPence,
      transfer_date: row.transferDate,
      reason: row.reason ?? null,
      status: 'draft',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'fund_transfer_create_draft',
    entityType: 'fund_transfer',
    entityId: data.id,
    metadata: {
      from: row.fromFundId,
      to: row.toFundId,
      amountPence: row.amountPence,
    },
  });

  return { ok: true, error: null, id: data.id };
}

export async function approveFundTransfer(transferId: string): Promise<{ ok: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, user, role } = await getActiveOrg();
  if (role !== 'admin' && role !== 'treasurer') {
    return { ok: false, error: 'Permission denied.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('fund_transfers')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', transferId)
    .eq('organisation_id', orgId)
    .eq('status', 'draft');

  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'fund_transfer_approve',
    entityType: 'fund_transfer',
    entityId: transferId,
  });

  return { ok: true, error: null };
}

export async function listFundAdjustments(): Promise<{ data: FundAdjustmentRow[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('fund_adjustments')
    .select('*')
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100);

  return { data: (data ?? []) as FundAdjustmentRow[], error: error?.message ?? null };
}

export async function createFundAdjustmentDraft(
  raw: z.infer<typeof adjustmentCreateSchema>,
): Promise<{ ok: boolean; error: string | null; id?: string }> {
  await assertWriteAllowed();
  const { orgId, user, role } = await getActiveOrg();
  if (role !== 'admin' && role !== 'treasurer') {
    return { ok: false, error: 'Permission denied.' };
  }

  const parsed = adjustmentCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.flatten().formErrors.join(' ') };
  }

  const supabase = await createClient();
  const row = parsed.data;

  const { data, error } = await supabase
    .from('fund_adjustments')
    .insert({
      organisation_id: orgId,
      fund_id: row.fundId,
      amount_pence: row.amountPence,
      direction: row.direction,
      adjustment_date: row.adjustmentDate,
      reason: row.reason,
      status: 'draft',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'fund_adjustment_create_draft',
    entityType: 'fund_adjustment',
    entityId: data.id,
    metadata: { fundId: row.fundId, direction: row.direction },
  });

  return { ok: true, error: null, id: data.id };
}
