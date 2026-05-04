'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { loadAnnualAccountsPack, saveAnnualAccountsDraft } from '@/lib/annual-accounts/data';
import type { AnnualAccountsBasis, AnnualAccountsNarrativeSections, AnnualAccountsPack } from '@/lib/annual-accounts/types';
import { logAuditEvent } from '@/lib/audit';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { buildCharityAccountsAssistantSnapshot } from './logic';
import type { CharityAccountsAssistantSnapshot } from './types';

type DraftNarrativeRow = {
  id: string;
  narrative_sections: AnnualAccountsNarrativeSections | null;
  approval: AnnualAccountsPack['approval'] | null;
};

function mergeDraftIntoPack(pack: AnnualAccountsPack, draft: DraftNarrativeRow | null): AnnualAccountsPack {
  if (!draft) return pack;

  return {
    ...pack,
    narrativeSections: draft.narrative_sections ?? pack.narrativeSections,
    approval: draft.approval ?? pack.approval,
  };
}

async function loadAnnualAccountsDraft(params: {
  workspaceId: string;
  financialYear: number;
  basis: AnnualAccountsBasis;
}): Promise<DraftNarrativeRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('annual_accounts_drafts')
    .select('id, narrative_sections, approval')
    .eq('workspace_id', params.workspaceId)
    .eq('financial_year', params.financialYear)
    .eq('basis', params.basis)
    .maybeSingle();

  return (data as DraftNarrativeRow | null) ?? null;
}

export async function getCharityAccountsAssistantSnapshot(params?: {
  financialYear?: number;
  basis?: AnnualAccountsBasis;
}): Promise<{ data: CharityAccountsAssistantSnapshot | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const financialYear = params?.financialYear ?? new Date().getFullYear();
  const basis = params?.basis ?? 'accruals';
  const [packResult, draft] = await Promise.all([
    loadAnnualAccountsPack({ financialYear, basis }),
    loadAnnualAccountsDraft({ workspaceId: orgId, financialYear, basis }),
  ]);

  if (!packResult.data) {
    return { data: null, error: packResult.error ?? 'Could not build the annual accounts assistant snapshot.' };
  }

  const pack = mergeDraftIntoPack(packResult.data, draft);
  return {
    data: buildCharityAccountsAssistantSnapshot({ pack, basis }),
    error: null,
  };
}

export async function saveTrusteeReportNarrativeAction(formData: FormData): Promise<void> {
  const financialYear = Number(formData.get('financialYear') ?? new Date().getFullYear());
  const basis = formData.get('basis') === 'cash' ? 'cash' : 'accruals';
  const snapshotResult = await getCharityAccountsAssistantSnapshot({ financialYear, basis });

  if (!snapshotResult.data) {
    redirect(`/reports/charity-accounts-assistant?year=${financialYear}&basis=${basis}&error=load`);
  }

  const { orgId, user } = await getActiveOrg();
  const snapshot = snapshotResult.data;
  const narrativeSections: AnnualAccountsNarrativeSections = {
    ...snapshot.narrativeSections,
    objectivesActivities: String(formData.get('objectivesActivities') ?? ''),
    publicBenefit: String(formData.get('publicBenefit') ?? ''),
    achievementsPerformance: String(formData.get('achievementsPerformance') ?? ''),
    financialReview: String(formData.get('financialReview') ?? ''),
    reservesPolicy: String(formData.get('reservesPolicy') ?? ''),
    principalRisks: String(formData.get('principalRisks') ?? ''),
    futurePlans: String(formData.get('futurePlans') ?? ''),
    reviewed: formData.get('reviewed') === 'on',
  };

  const pack: AnnualAccountsPack = {
    ...snapshot.annualAccounts,
    narrativeSections,
  };

  const saved = await saveAnnualAccountsDraft({
    financialYear,
    basis,
    currentStep: 'add-trustee-narrative',
    pack,
  });

  if (saved.error) {
    redirect(`/reports/charity-accounts-assistant?year=${financialYear}&basis=${basis}&error=save`);
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'charity_accounts_assistant_trustee_narrative_saved',
    entityType: 'annual_accounts_draft',
    entityId: saved.data?.id,
    metadata: { financialYear, basis },
  });

  revalidatePath('/reports/charity-accounts-assistant');
  redirect(`/reports/charity-accounts-assistant?year=${financialYear}&basis=${basis}&saved=narrative`);
}
