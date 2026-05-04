'use server';

import { getActiveOrg } from '@/lib/org';
import { logAuditEvent } from '@/lib/audit';
import { createClient } from '@/lib/supabase/server';
import { getAnnualReport, getAGMReport, getBalanceSheetReport, getCashFlowReport, getFundMovementsReport } from '@/lib/reports/actions';
import { getSOFAReport, getTrialBalance } from '@/lib/reports/glReports';
import { getBankReconciliationSummaryReport, getGiftAidSummaryReport } from '@/lib/reports/summaryReports';
import { buildAnnualAccountsBalanceSheet, validateAnnualAccountsBalanceSheet } from './balance-sheet';
import { ANNUAL_ACCOUNTS_EXPORTS } from './exports';
import { buildDefaultAnnualAccountsNarrative } from './narrative';
import { buildAnnualAccountsNotes } from './notes';
import { buildAnnualAccountsSOFA } from './sofa';
import { validateAnnualAccountsPack } from './validation';
import type {
  AnnualAccountsApproval,
  AnnualAccountsBasis,
  AnnualAccountsCharityDetails,
  AnnualAccountsDraft,
  AnnualAccountsExaminerDetails,
  AnnualAccountsPack,
  AnnualAccountsStep,
  AnnualAccountsTrusteeOfficer,
} from './types';

function addressFromOrganisation(org: Record<string, unknown> | null | undefined) {
  return [
    org?.address_line1,
    org?.address_line2,
    org?.county,
    org?.postcode,
    org?.country,
  ]
    .filter(Boolean)
    .join(', ');
}

function defaultExaminerDetails(): AnnualAccountsExaminerDetails {
  return {
    name: '',
    firm: '',
    address: '',
    qualification: '',
    reportText: 'Independent examiner/auditor report to be completed or attached before final approval.',
  };
}

function defaultApproval(): AnnualAccountsApproval {
  return {
    approvedByName: '',
    approvedByUserId: null,
    approvedAt: null,
    trusteeMeetingDate: null,
    signatureName: '',
    final: false,
  };
}

function currentYear() {
  return new Date().getFullYear();
}

type AnnualPayrollSummary = {
  grossPayPence: number;
  employerNicPence: number;
  employerPensionPence: number;
  totalEmployerCostPence: number;
};

type LoosePayrollTotalsQuery = {
  select(columns: string): LoosePayrollTotalsQuery;
  eq(column: string, value: unknown): LoosePayrollTotalsQuery;
  gte(column: string, value: unknown): LoosePayrollTotalsQuery;
  lte(column: string, value: unknown): Promise<{
    data: Array<Record<string, unknown>> | null;
    error: { message: string } | null;
  }>;
};

type LoosePayrollTotalsClient = {
  from(table: string): LoosePayrollTotalsQuery;
};

type TrusteeMembershipRow = {
  id: string;
  role: string | null;
  joined_at: string | null;
  user_id: string | null;
  profiles:
    | {
        full_name?: string | null;
        email?: string | null;
      }
    | {
        full_name?: string | null;
        email?: string | null;
      }[]
    | null;
};

export async function loadAnnualAccountsPack(params?: {
  financialYear?: number;
  basis?: AnnualAccountsBasis;
}): Promise<{ data: AnnualAccountsPack | null; error: string | null }> {
  const { orgId, user } = await getActiveOrg();
  const year = params?.financialYear ?? currentYear();
  const basis = params?.basis ?? 'accruals';
  const periodStart = `${year}-01-01`;
  const periodEnd = `${year}-12-31`;
  const priorYear = year - 1;
  const supabase = await createClient();

  const [
    organisationRes,
    bankAccountsRes,
    trusteesRes,
    payrollCountRes,
    payrollTotalsRes,
    annualRes,
    agmRes,
    sofaRes,
    priorSofaRes,
    balanceSheetRes,
    priorBalanceSheetRes,
    cashFlowRes,
    fundMovementsRes,
    trialBalanceRes,
    giftAidRes,
    bankReconciliationRes,
  ] = await Promise.all([
    supabase
      .from('organisations')
      .select('id, name, legal_name, charity_number, address_line1, address_line2, county, postcode, country')
      .eq('id', orgId)
      .maybeSingle(),
    supabase.from('bank_accounts').select('id, name').eq('organisation_id', orgId).eq('is_active', true).order('name'),
    supabase
      .from('memberships')
      .select('id, role, joined_at, user_id, profiles(full_name, email)')
      .eq('organisation_id', orgId)
      .eq('status', 'active')
      .in('role', ['admin', 'treasurer', 'trustee']),
    supabase
      .from('payroll_runs')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .gte('payroll_month', periodStart)
      .lte('payroll_month', periodEnd),
    (supabase as unknown as LoosePayrollTotalsClient)
      .from('payroll_runs')
      .select('total_gross_pence, total_nic_pence, total_pension_pence, total_employer_nic_pence, total_employer_pension_pence, total_employer_cost_pence')
      .eq('organisation_id', orgId)
      .gte('payroll_month', periodStart)
      .lte('payroll_month', periodEnd),
    getAnnualReport({ organisationId: orgId, year }),
    getAGMReport({ organisationId: orgId, year }),
    getSOFAReport({ year }),
    getSOFAReport({ year: priorYear }),
    getBalanceSheetReport({ organisationId: orgId, asOfDate: periodEnd }),
    getBalanceSheetReport({ organisationId: orgId, asOfDate: `${priorYear}-12-31` }),
    getCashFlowReport({ organisationId: orgId, year }),
    getFundMovementsReport({ organisationId: orgId, year, mode: 'YTD' }),
    getTrialBalance({ asOfDate: periodEnd }),
    getGiftAidSummaryReport({ organisationId: orgId }),
    getBankReconciliationSummaryReport({ organisationId: orgId }),
  ]);

  if (organisationRes.error) {
    return { data: null, error: organisationRes.error.message };
  }

  const organisation = organisationRes.data as Record<string, unknown> | null;
  const charityDetails: AnnualAccountsCharityDetails = {
    charityName: String(organisation?.name ?? ''),
    legalName: String(organisation?.legal_name ?? organisation?.name ?? ''),
    charityNumber: String(organisation?.charity_number ?? ''),
    principalAddress: addressFromOrganisation(organisation),
    governingDocument: 'Governing document to be confirmed by trustees.',
    charityObjects: 'Charitable objects to be confirmed from the governing document.',
    publicBenefitStatement: '',
    treasurerName: '',
    bankAccountNames: (bankAccountsRes.data ?? []).map((account) => account.name ?? 'Unnamed bank account'),
  };

  const trusteesAndOfficers: AnnualAccountsTrusteeOfficer[] = ((trusteesRes.data ?? []) as TrusteeMembershipRow[]).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: String(row.user_id ?? row.id),
      name: String(profile?.full_name ?? profile?.email ?? 'Unnamed trustee/officer'),
      role: String(row.role ?? 'trustee'),
      email: profile?.email ?? null,
      appointedAt: row.joined_at ?? null,
      resignedAt: null,
    };
  });

  const sofaRows = buildAnnualAccountsSOFA({
    sofa: sofaRes.data,
    priorYearSOFA: priorSofaRes.data,
    fundMovements: fundMovementsRes.data,
  });
  const balanceSheetRows = buildAnnualAccountsBalanceSheet({
    balanceSheet: balanceSheetRes.data,
    priorYearBalanceSheet: priorBalanceSheetRes.data,
    fundMovements: fundMovementsRes.data,
  });
  const narrativeSections = buildDefaultAnnualAccountsNarrative(charityDetails);
  const payrollSummary = ((payrollTotalsRes.data ?? []) as Array<Record<string, unknown>>).reduce<AnnualPayrollSummary>(
    (acc, run) => {
      const gross = Number(run.total_gross_pence ?? 0);
      const employerNic = Number(run.total_employer_nic_pence ?? run.total_nic_pence ?? 0);
      const employerPension = Number(run.total_employer_pension_pence ?? run.total_pension_pence ?? 0);
      acc.grossPayPence += gross;
      acc.employerNicPence += employerNic;
      acc.employerPensionPence += employerPension;
      acc.totalEmployerCostPence += Number(run.total_employer_cost_pence ?? gross + employerNic + employerPension);
      return acc;
    },
    {
      grossPayPence: 0,
      employerNicPence: 0,
      employerPensionPence: 0,
      totalEmployerCostPence: 0,
    },
  );
  const notes = buildAnnualAccountsNotes({
    fundMovements: fundMovementsRes.data,
    giftAid: giftAidRes.data,
    payrollRunCount: payrollCountRes.count ?? 0,
    payrollSummary,
    hasPriorYearData: Boolean(annualRes.data?.priorYear),
  });
  const approval = defaultApproval();

  const packWithoutValidation = {
    financialYear: year,
    basis,
    periodStart,
    periodEnd,
    generatedAt: new Date().toISOString(),
    generatedBy: user.email ?? user.id,
    charityDetails,
    trusteesAndOfficers,
    examinerDetails: defaultExaminerDetails(),
    narrativeSections,
    sofaRows,
    balanceSheetRows,
    cashflow: cashFlowRes.data,
    notes,
    evidenceIndex: [
      ...notes.map((note) => ({
        id: note.id,
        title: note.title,
        source: note.sourceRefs.join(', '),
        reference: note.id,
        date: periodEnd,
        amountPence: note.amountPence ?? null,
      })),
    ],
    approval,
    sourceReports: {
      annual: annualRes.data,
      agm: agmRes.data,
      sofa: sofaRes.data,
      balanceSheet: balanceSheetRes.data,
      cashflow: cashFlowRes.data,
      fundMovements: fundMovementsRes.data,
      trialBalance: trialBalanceRes.data,
      giftAid: giftAidRes.data,
      bankReconciliation: bankReconciliationRes.data,
      priorYear: annualRes.data?.priorYear ?? null,
      payrollRunCount: payrollCountRes.count ?? 0,
      payrollSummary,
      yearEndClose: { complete: false },
    },
  } satisfies Omit<AnnualAccountsPack, 'validationResults' | 'exports'>;

  const validationResults = [
    ...validateAnnualAccountsBalanceSheet({
      balanceSheet: balanceSheetRes.data,
      rows: balanceSheetRows,
      trialBalanceIsBalanced: Boolean(trialBalanceRes.data?.isBalanced),
      bankDifferencePence: bankReconciliationRes.data?.totals.differencePence ?? 0,
    }),
    ...validateAnnualAccountsPack(packWithoutValidation),
  ];

  return {
    data: {
      ...packWithoutValidation,
      validationResults,
      exports: ANNUAL_ACCOUNTS_EXPORTS,
    },
    error: null,
  };
}

export async function saveAnnualAccountsDraft(input: {
  financialYear: number;
  basis: AnnualAccountsBasis;
  currentStep: AnnualAccountsStep;
  pack: AnnualAccountsPack;
}): Promise<{ data: { id: string } | null; error: string | null }> {
  const { orgId, user } = await getActiveOrg();
  const supabase = await createClient();

  const payload = {
    workspace_id: orgId,
    financial_year: input.financialYear,
    basis: input.basis,
    current_step: input.currentStep,
    charity_details: input.pack.charityDetails,
    trustees_and_officers: input.pack.trusteesAndOfficers,
    examiner_details: input.pack.examinerDetails,
    narrative_sections: input.pack.narrativeSections,
    notes: input.pack.notes,
    validation_results: input.pack.validationResults,
    approval: input.pack.approval,
    status: input.pack.approval.final ? 'approved' : 'draft',
    updated_by: user.id,
    created_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('annual_accounts_drafts')
    .upsert(payload, { onConflict: 'workspace_id,financial_year,basis' })
    .select('id')
    .single();

  if (error) return { data: null, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'annual_accounts_draft_saved',
    entityType: 'annual_accounts_draft',
    entityId: data.id,
    metadata: { financialYear: input.financialYear, basis: input.basis, currentStep: input.currentStep },
  });

  return { data: { id: data.id }, error: null };
}

export async function approveAnnualAccountsPack(input: {
  financialYear: number;
  basis: AnnualAccountsBasis;
  pack: AnnualAccountsPack;
  trusteeMeetingDate?: string | null;
  signatureName?: string | null;
}): Promise<{ data: { reportVersionId: string } | null; error: string | null }> {
  const { orgId, user } = await getActiveOrg();
  const supabase = await createClient();
  const now = new Date().toISOString();
  const approval = {
    ...input.pack.approval,
    approvedByName: input.pack.approval.approvedByName || user.email || user.id,
    approvedByUserId: user.id,
    approvedAt: now,
    trusteeMeetingDate: input.trusteeMeetingDate ?? input.pack.approval.trusteeMeetingDate ?? null,
    signatureName: input.signatureName ?? input.pack.approval.signatureName ?? '',
    final: true,
  };
  const snapshot: AnnualAccountsPack = { ...input.pack, approval };

  const { data, error } = await supabase
    .from('report_versions')
    .insert({
      workspace_id: orgId,
      report_type: 'annual',
      report_title: `Annual Accounts ${input.financialYear}`,
      period_start: `${input.financialYear}-01-01`,
      period_end: `${input.financialYear}-12-31`,
      financial_year: input.financialYear,
      basis: input.basis,
      filters_applied: { basis: input.basis, builder: true },
      validation_summary: snapshot.validationResults,
      traceability_summary: snapshot.evidenceIndex,
      snapshot_payload: snapshot,
      generated_by: user.id,
      prepared_by: user.id,
      approved_by: user.id,
      approved_at: now,
      status: 'approved',
      version: 1,
    })
    .select('id')
    .single();

  if (error) return { data: null, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'annual_accounts_approved',
    entityType: 'report_version',
    entityId: data.id,
    metadata: { financialYear: input.financialYear, basis: input.basis },
  });

  return { data: { reportVersionId: data.id }, error: null };
}

function emptyAnnualAccountsDraft(params: {
  workspaceId: string;
  financialYear: number;
  basis: AnnualAccountsBasis;
  pack: AnnualAccountsPack;
}): AnnualAccountsDraft {
  return {
    workspaceId: params.workspaceId,
    financialYear: params.financialYear,
    basis: params.basis,
    currentStep: 'select-financial-year',
    charityDetails: params.pack.charityDetails,
    trusteesAndOfficers: params.pack.trusteesAndOfficers,
    examinerDetails: params.pack.examinerDetails,
    narrativeSections: params.pack.narrativeSections,
    notes: params.pack.notes,
    validationResults: params.pack.validationResults,
    approval: params.pack.approval,
    status: 'draft',
    reportVersionId: null,
  };
}
