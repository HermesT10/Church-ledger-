'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentPortalAccess } from '@/lib/portal/current-user';
import { enforcePortalPermissionForContext } from '@/lib/portal-permissions';
import type { FundType } from '@/lib/funds/types';

export interface PortalFundSummary {
  id: string;
  name: string;
  type: FundType;
  canSubmitAgainst: boolean;
  donatedPence: number;
  usedPence: number;
  remainingPence: number;
  transactionCount: number;
}

export interface PortalFundTransaction {
  id: string;
  journalId: string;
  journalDate: string;
  description: string;
  accountName: string;
  accountType: string;
  amountPence: number;
}

async function permittedFundIds(workspaceId: string, userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('user_fund_assignments')
    .select('fund_id, can_submit_against')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('can_view', true);

  return new Map((data ?? []).map((row) => [row.fund_id as string, Boolean(row.can_submit_against)]));
}

async function fundStats(workspaceId: string, fundIds: string[]) {
  if (fundIds.length === 0) return new Map<string, { donated: number; used: number; count: number }>();
  const admin = createAdminClient();
  const { data } = await admin
    .from('journal_lines')
    .select('id, fund_id, debit_pence, credit_pence, accounts(type), journals!inner(status)')
    .eq('organisation_id', workspaceId)
    .eq('journals.status', 'posted')
    .in('fund_id', fundIds);

  const stats = new Map<string, { donated: number; used: number; count: number }>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const fundId = row.fund_id as string;
    const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts as { type?: string } | null;
    const entry = stats.get(fundId) ?? { donated: 0, used: 0, count: 0 };
    if (account?.type === 'income') {
      entry.donated += Number(row.credit_pence ?? 0) - Number(row.debit_pence ?? 0);
    }
    if (account?.type === 'expense') {
      entry.used += Number(row.debit_pence ?? 0) - Number(row.credit_pence ?? 0);
    }
    entry.count += 1;
    stats.set(fundId, entry);
  }
  return stats;
}

export async function listPortalRestrictedFunds(): Promise<{ data: PortalFundSummary[]; error: string | null }> {
  const access = await getCurrentPortalAccess();
  try {
    await enforcePortalPermissionForContext(access, 'restricted_funds', 'view');
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : 'Permission denied.' };
  }

  const admin = createAdminClient();
  const assigned = await permittedFundIds(access.orgId, access.user.id);
  let query = admin
    .from('funds')
    .select('id, name, type, opening_balance_pence')
    .eq('organisation_id', access.orgId)
    .eq('is_active', true)
    .order('name');

  if (!access.permissions.scopes.all_workspace) {
    const ids = [...assigned.keys()];
    if (ids.length === 0) return { data: [], error: null };
    query = query.in('id', ids);
  }

  const { data: funds, error } = await query;
  if (error) return { data: [], error: error.message };

  const visibleFunds = ((funds ?? []) as Record<string, unknown>[]).filter((fund) => {
    if (fund.type === 'restricted') return true;
    return access.permissions.scopes.all_workspace || assigned.has(fund.id as string);
  });
  const stats = await fundStats(access.orgId, visibleFunds.map((fund) => fund.id as string));

  return {
    data: visibleFunds.map((fund) => {
      const movement = stats.get(fund.id as string) ?? { donated: 0, used: 0, count: 0 };
      const opening = Number(fund.opening_balance_pence ?? 0);
      return {
        id: fund.id as string,
        name: fund.name as string,
        type: fund.type as FundType,
        canSubmitAgainst: access.permissions.scopes.all_workspace || Boolean(assigned.get(fund.id as string)),
        donatedPence: movement.donated,
        usedPence: movement.used,
        remainingPence: opening + movement.donated - movement.used,
        transactionCount: movement.count,
      };
    }),
    error: null,
  };
}

export async function listPortalFundTransactions(fundId: string): Promise<{ data: PortalFundTransaction[]; error: string | null }> {
  const access = await getCurrentPortalAccess();
  try {
    await enforcePortalPermissionForContext(access, 'restricted_funds', 'view', {
      scope: access.permissions.scopes.all_workspace ? undefined : 'assigned_funds',
      fundId,
    });
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : 'Permission denied.' };
  }

  const assigned = await permittedFundIds(access.orgId, access.user.id);
  if (!access.permissions.scopes.all_workspace && !assigned.has(fundId)) {
    return { data: [], error: 'This fund is not assigned to you.' };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('journal_lines')
    .select('id, journal_id, description, debit_pence, credit_pence, accounts(name, type), journals!inner(journal_date, memo, status)')
    .eq('organisation_id', access.orgId)
    .eq('fund_id', fundId)
    .eq('journals.status', 'posted')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { data: [], error: error.message };

  return {
    data: ((data ?? []) as Record<string, unknown>[]).map((row) => {
      const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts as { name?: string; type?: string } | null;
      const journal = Array.isArray(row.journals) ? row.journals[0] : row.journals as { journal_date?: string; memo?: string | null } | null;
      const accountType = account?.type ?? 'other';
      const amount = accountType === 'income'
        ? Number(row.credit_pence ?? 0) - Number(row.debit_pence ?? 0)
        : Number(row.debit_pence ?? 0) - Number(row.credit_pence ?? 0);
      return {
        id: row.id as string,
        journalId: row.journal_id as string,
        journalDate: journal?.journal_date ?? '',
        description: (row.description as string | null) ?? journal?.memo ?? account?.name ?? 'Fund transaction',
        accountName: account?.name ?? 'Account',
        accountType,
        amountPence: amount,
      };
    }),
    error: null,
  };
}
