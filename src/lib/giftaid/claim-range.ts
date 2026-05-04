export const GIFT_AID_CLAIM_DATE_PRESETS = [
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'financial_year_to_date',
  'custom',
] as const;

export type GiftAidClaimDatePreset =
  (typeof GIFT_AID_CLAIM_DATE_PRESETS)[number];

export interface GiftAidClaimDateRange {
  preset: GiftAidClaimDatePreset;
  startDate: string;
  endDate: string;
}

export const GIFT_AID_CLAIM_DATE_PRESET_LABELS: Record<
  GiftAidClaimDatePreset,
  string
> = {
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  last_quarter: 'Last quarter',
  financial_year_to_date: 'Financial year to date',
  custom: 'Custom range',
};

const HMRC_CLAIM_LIMIT_YEARS = 4;

function makeUtcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function startOfMonth(date: Date) {
  return makeUtcDate(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function endOfMonth(date: Date) {
  return makeUtcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 0);
}

function addMonths(date: Date, months: number) {
  return makeUtcDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    date.getUTCDate()
  );
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getQuarterStart(date: Date) {
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return makeUtcDate(date.getUTCFullYear(), quarterStartMonth, 1);
}

function getQuarterEnd(date: Date) {
  const quarterStart = getQuarterStart(date);
  return makeUtcDate(
    quarterStart.getUTCFullYear(),
    quarterStart.getUTCMonth() + 3,
    0
  );
}

function getFinancialYearStart(date: Date, fiscalYearStartMonth: number) {
  const normalizedStartMonth = Math.min(
    12,
    Math.max(1, Math.trunc(fiscalYearStartMonth || 1))
  );
  const currentMonth = date.getUTCMonth() + 1;
  const year =
    currentMonth >= normalizedStartMonth
      ? date.getUTCFullYear()
      : date.getUTCFullYear() - 1;

  return makeUtcDate(year, normalizedStartMonth - 1, 1);
}

export function isValidDateInput(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

export function resolveGiftAidClaimDateRange(params: {
  preset: GiftAidClaimDatePreset;
  fiscalYearStartMonth?: number;
  customStartDate?: string | null;
  customEndDate?: string | null;
  now?: Date;
}): GiftAidClaimDateRange {
  const now = params.now ?? new Date();

  if (
    params.preset === 'custom' &&
    isValidDateInput(params.customStartDate) &&
    isValidDateInput(params.customEndDate)
  ) {
    return {
      preset: 'custom',
      startDate: params.customStartDate!,
      endDate: params.customEndDate!,
    };
  }

  if (params.preset === 'last_month') {
    const anchor = addMonths(startOfMonth(now), -1);
    return {
      preset: 'last_month',
      startDate: toDateInputValue(startOfMonth(anchor)),
      endDate: toDateInputValue(endOfMonth(anchor)),
    };
  }

  if (params.preset === 'this_quarter') {
    return {
      preset: 'this_quarter',
      startDate: toDateInputValue(getQuarterStart(now)),
      endDate: toDateInputValue(getQuarterEnd(now)),
    };
  }

  if (params.preset === 'last_quarter') {
    const anchor = addMonths(getQuarterStart(now), -3);
    return {
      preset: 'last_quarter',
      startDate: toDateInputValue(getQuarterStart(anchor)),
      endDate: toDateInputValue(getQuarterEnd(anchor)),
    };
  }

  if (params.preset === 'financial_year_to_date') {
    return {
      preset: 'financial_year_to_date',
      startDate: toDateInputValue(
        getFinancialYearStart(now, params.fiscalYearStartMonth ?? 1)
      ),
      endDate: toDateInputValue(now),
    };
  }

  return {
    preset: 'this_month',
    startDate: toDateInputValue(startOfMonth(now)),
    endDate: toDateInputValue(endOfMonth(now)),
  };
}

export function isGiftAidClaimDateRangeInvalid(params: {
  startDate: string;
  endDate: string;
}) {
  return (
    !isValidDateInput(params.startDate) ||
    !isValidDateInput(params.endDate) ||
    params.startDate > params.endDate
  );
}

export function isDonationOutsideHmrcClaimTimeLimit(params: {
  donationDate: string | null | undefined;
  asOfDate?: Date;
}) {
  if (!isValidDateInput(params.donationDate)) {
    return false;
  }

  const asOfDate = params.asOfDate ?? new Date();
  const threshold = makeUtcDate(
    asOfDate.getUTCFullYear() - HMRC_CLAIM_LIMIT_YEARS,
    asOfDate.getUTCMonth(),
    asOfDate.getUTCDate()
  );

  return params.donationDate! < toDateInputValue(threshold);
}

export function buildGiftAidClaimBuilderWarnings(params: {
  outsideHmrcLimitCount: number;
  alreadyClaimedCount: number;
  missingDonorDetailsCount: number;
  invalidDeclarationCount: number;
  eligibleDonationCount: number;
  duplicateWarnings?: string[];
}) {
  const warnings = new Set<string>();

  if (params.outsideHmrcLimitCount > 0) {
    warnings.add(
      `${params.outsideHmrcLimitCount} donation(s) in the selected range fall outside the HMRC Gift Aid claim time limit and were excluded.`
    );
  }

  if (params.alreadyClaimedCount > 0) {
    warnings.add(
      `${params.alreadyClaimedCount} donation(s) in this range have already been included in another Gift Aid claim and were excluded.`
    );
  }

  if (params.missingDonorDetailsCount > 0) {
    warnings.add(
      `${params.missingDonorDetailsCount} donation(s) are missing donor details required for the HMRC schedule.`
    );
  }

  if (params.invalidDeclarationCount > 0) {
    warnings.add(
      `${params.invalidDeclarationCount} donation(s) are missing a valid Gift Aid declaration for the selected donation date.`
    );
  }

  if (params.eligibleDonationCount > 1000) {
    warnings.add(
      'This spreadsheet export would exceed 1,000 Gift Aid donations. Split the selected range into smaller batches before export.'
    );
  }

  for (const duplicateWarning of params.duplicateWarnings ?? []) {
    if (duplicateWarning) {
      warnings.add(duplicateWarning);
    }
  }

  return Array.from(warnings);
}
