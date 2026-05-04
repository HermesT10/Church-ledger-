import type { AnnualAccountsCharityDetails, AnnualAccountsNarrativeSections } from './types';

export function buildDefaultAnnualAccountsNarrative(
  charityDetails: AnnualAccountsCharityDetails,
): AnnualAccountsNarrativeSections {
  const charityName = charityDetails.charityName || charityDetails.legalName || 'the charity';

  return {
    objectivesActivities: `${charityName} exists to advance its charitable objects through worship, pastoral care, community support and related church activities. Trustees should review this section against the governing document.`,
    publicBenefit:
      charityDetails.publicBenefitStatement ||
      'The trustees have had regard to the Charity Commission guidance on public benefit when planning activities and applying the charity resources.',
    achievementsPerformance:
      'Trustees should summarise the main activities, achievements and outcomes for the financial year.',
    financialReview:
      'Trustees should explain the financial performance for the year, significant income and expenditure movements, and the position at year end.',
    reservesPolicy:
      'Trustees should state the reserves policy, target level of free reserves, actual reserves held and any planned action where reserves are above or below target.',
    principalRisks:
      'Trustees should identify the principal risks facing the charity and the controls used to manage them.',
    futurePlans:
      'Trustees should outline the charity plans for the next reporting period.',
    structureGovernance:
      'Trustees should describe the governance structure, trustee appointment process and key management arrangements.',
    referenceAdminDetails:
      `${charityName}${charityDetails.charityNumber ? `, charity number ${charityDetails.charityNumber}` : ''}. Principal address: ${charityDetails.principalAddress || 'to be confirmed'}.`,
    reviewed: false,
  };
}
