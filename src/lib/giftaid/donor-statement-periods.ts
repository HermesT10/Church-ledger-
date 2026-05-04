/** Pure helpers — resolve statement date ranges from UK tax / calendar / fiscal year. */

export type DonorStatementPeriodType =
  | 'uk_tax_year'
  | 'fiscal_year'
  | 'calendar_year'
  | 'custom';

export interface ResolvedDonorStatementPeriod {
  period_start: string;
  period_end: string;
  period_type: DonorStatementPeriodType;
  label: string;
}

/** UK tax year starting 6 April of `startYear` (e.g. startYear 2024 → 2024-04-06 .. 2025-04-05). */
export function ukTaxYearBounds(startYear: number): { start: string; end: string } {
  const start = `${startYear}-04-06`;
  const end = `${startYear + 1}-04-05`;
  return { start, end };
}

export function ukTaxYearLabel(startYear: number): string {
  const a = String(startYear).slice(-2);
  const b = String(startYear + 1).slice(-2);
  return `${startYear}-${startYear + 1} (UK tax ${a}/${b})`;
}

function padMonth(m: number): string {
  return m < 10 ? `0${m}` : String(m);
}

/** Fiscal year: 12 months starting `fiscalYearStartMonth` (1–12), for `anchorCalendarYear` (Jan–Dec containing fiscal year start). */
export function fiscalYearBounds(
  anchorCalendarYear: number,
  fiscalYearStartMonth: number,
): { start: string; end: string; label: string } {
  const sm = Math.min(12, Math.max(1, fiscalYearStartMonth));
  const startDate = new Date(Date.UTC(anchorCalendarYear, sm - 1, 1));
  const endDate = new Date(Date.UTC(anchorCalendarYear + 1, sm - 1, 0));
  const start = `${startDate.getUTCFullYear()}-${padMonth(startDate.getUTCMonth() + 1)}-${padMonth(startDate.getUTCDate())}`;
  const end = `${endDate.getUTCFullYear()}-${padMonth(endDate.getUTCMonth() + 1)}-${padMonth(endDate.getUTCDate())}`;
  return {
    start,
    end,
    label: `Financial year to ${end}`,
  };
}

export function calendarYearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function resolveDonorStatementPeriod(params: {
  period_type: DonorStatementPeriodType;
  /** UK tax: year of 6 April start. Calendar: calendar year. Fiscal: calendar year of fiscal start month. */
  anchor_year: number;
  fiscal_year_start_month?: number | null;
  custom_start?: string | null;
  custom_end?: string | null;
}): ResolvedDonorStatementPeriod {
  const { period_type, anchor_year } = params;

  if (period_type === 'custom') {
    const s = params.custom_start;
    const e = params.custom_end;
    if (!s || !e) {
      throw new Error('Custom period requires start and end dates.');
    }
    return {
      period_start: s.slice(0, 10),
      period_end: e.slice(0, 10),
      period_type: 'custom',
      label: `${s.slice(0, 10)} to ${e.slice(0, 10)}`,
    };
  }

  if (period_type === 'uk_tax_year') {
    const { start, end } = ukTaxYearBounds(anchor_year);
    return {
      period_start: start,
      period_end: end,
      period_type: 'uk_tax_year',
      label: ukTaxYearLabel(anchor_year),
    };
  }

  if (period_type === 'calendar_year') {
    const { start, end } = calendarYearBounds(anchor_year);
    return {
      period_start: start,
      period_end: end,
      period_type: 'calendar_year',
      label: `Calendar ${anchor_year}`,
    };
  }

  const fm = params.fiscal_year_start_month ?? 4;
  const { start, end, label } = fiscalYearBounds(anchor_year, fm);
  return {
    period_start: start,
    period_end: end,
    period_type: 'fiscal_year',
    label,
  };
}
