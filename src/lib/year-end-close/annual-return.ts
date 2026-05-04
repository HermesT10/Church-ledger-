import type { AnnualAccountsPack } from '@/lib/annual-accounts/types';
import type { AnnualReturnAssistantSummary, AnnualReturnField } from './types';

function poundsFromPence(value: number) {
  return Math.round(value) / 100;
}

function sumRows(
  rows: { section?: string; totalCurrentYearPence?: number; currentYearPence?: number }[],
  section: string,
) {
  return rows
    .filter((row) => row.section === section)
    .reduce((total, row) => total + (row.totalCurrentYearPence ?? row.currentYearPence ?? 0), 0);
}

function field(input: AnnualReturnField): AnnualReturnField {
  return input;
}

export function buildAnnualReturnAssistantSummary(pack: AnnualAccountsPack): AnnualReturnAssistantSummary {
  const incomePence = sumRows(pack.sofaRows, 'income');
  const expenditurePence = sumRows(pack.sofaRows, 'expenditure');
  const hasPayroll = Number((pack.sourceReports.payrollRunCount as number | undefined) ?? 0) > 0;
  const giftAid = pack.sourceReports.giftAid as { dashboard?: { recentBatchCount?: number; unclaimedAmountPence?: number } } | null | undefined;

  const fields = [
    field({
      fieldKey: 'income',
      label: 'Total income',
      suggestedValue: poundsFromPence(incomePence),
      source: 'Annual accounts SOFA',
      confidence: 'high',
      needsReview: false,
      notes: 'Use the final annual accounts SOFA as the canonical source.',
    }),
    field({
      fieldKey: 'expenditure',
      label: 'Total expenditure',
      suggestedValue: poundsFromPence(Math.abs(expenditurePence)),
      source: 'Annual accounts SOFA',
      confidence: 'high',
      needsReview: false,
      notes: 'Use the final annual accounts SOFA as the canonical source.',
    }),
    field({
      fieldKey: 'trustees',
      label: 'Trustees and officers',
      suggestedValue: pack.trusteesAndOfficers.map((trustee) => trustee.name).join(', '),
      source: 'Annual accounts trustee/officer list',
      confidence: pack.trusteesAndOfficers.length > 0 ? 'medium' : 'low',
      needsReview: pack.trusteesAndOfficers.length === 0,
      notes: 'Review appointments, resignations, and spelling before filing.',
    }),
    field({
      fieldKey: 'staff_payroll',
      label: 'Staff and payroll',
      suggestedValue: hasPayroll,
      source: 'Payroll runs and annual accounts notes',
      confidence: 'medium',
      needsReview: hasPayroll,
      notes: hasPayroll ? 'Payroll activity exists; confirm staff disclosures.' : 'No payroll activity detected in supporting data.',
    }),
    field({
      fieldKey: 'gift_aid',
      label: 'Gift Aid',
      suggestedValue: giftAid?.dashboard?.recentBatchCount ?? 0,
      source: 'Gift Aid summary',
      confidence: giftAid ? 'medium' : 'low',
      needsReview: Boolean(giftAid?.dashboard?.unclaimedAmountPence),
      notes: 'Confirm claim status and any outstanding reclaim amount.',
    }),
    field({
      fieldKey: 'public_benefit',
      label: 'Public benefit narrative',
      suggestedValue: pack.narrativeSections.publicBenefit || pack.charityDetails.publicBenefitStatement || null,
      source: 'Trustees Annual Report narrative',
      confidence: pack.narrativeSections.publicBenefit ? 'medium' : 'low',
      needsReview: !pack.narrativeSections.publicBenefit,
      notes: 'Trustees should review the wording before Charity Commission filing.',
    }),
    field({
      fieldKey: 'activities_achievements',
      label: 'Activities and achievements',
      suggestedValue: pack.narrativeSections.achievementsPerformance || pack.narrativeSections.objectivesActivities || null,
      source: 'Trustees Annual Report narrative',
      confidence: pack.narrativeSections.achievementsPerformance ? 'medium' : 'low',
      needsReview: !pack.narrativeSections.achievementsPerformance,
      notes: 'Summarise ministry, community, and charitable activities.',
    }),
    field({
      fieldKey: 'reserves_policy',
      label: 'Reserves policy',
      suggestedValue: pack.narrativeSections.reservesPolicy || null,
      source: 'Trustees Annual Report narrative',
      confidence: pack.narrativeSections.reservesPolicy ? 'medium' : 'low',
      needsReview: !pack.narrativeSections.reservesPolicy,
      notes: 'Confirm unrestricted reserves policy and reserves level.',
    }),
    field({
      fieldKey: 'risk_notes',
      label: 'Risk notes',
      suggestedValue: pack.narrativeSections.principalRisks || null,
      source: 'Trustees Annual Report narrative',
      confidence: pack.narrativeSections.principalRisks ? 'medium' : 'low',
      needsReview: !pack.narrativeSections.principalRisks,
      notes: 'Confirm principal risks and mitigations.',
    }),
    field({
      fieldKey: 'grants_fundraising',
      label: 'Grants and fundraising',
      suggestedValue: 'Review income notes and restricted fund movements.',
      source: 'SOFA, notes, and fund movements',
      confidence: 'low',
      needsReview: true,
      notes: 'Classify grants and fundraising activity before filing.',
    }),
  ];

  return {
    generatedAt: new Date().toISOString(),
    financialYear: pack.financialYear,
    fields,
    checklist: fields.map((item) => ({
      id: item.fieldKey,
      title: item.label,
      status: item.suggestedValue === null || item.suggestedValue === '' ? 'missing' : item.needsReview ? 'needs_review' : 'ready',
      source: item.source,
    })),
  };
}
