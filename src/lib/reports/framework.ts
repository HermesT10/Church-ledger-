export type ReportTone = 'neutral' | 'positive' | 'caution' | 'critical';

export interface ReportFilterTag {
  label: string;
  value: string;
}

export interface ReportFootnote {
  label?: string;
  text: string;
}

export interface ReportDefinition {
  term: string;
  meaning: string;
}

export interface ReportKpi {
  label: string;
  value: string;
  helper?: string;
  tone?: ReportTone;
  href?: string;
}

export interface ReportInsight {
  title: string;
  body: string;
  tone?: ReportTone;
}

export interface ReportMetadata {
  scope: string;
  comparison?: string;
  source: string;
  filters?: ReportFilterTag[];
  footnotes?: ReportFootnote[];
}

export function formatCurrencyFromPence(
  pence: number,
  options?: { compact?: boolean; zeroDash?: boolean },
): string {
  if (options?.zeroDash && pence === 0) {
    return '—';
  }

  const pounds = pence / 100;
  const abs = Math.abs(pounds);
  const sign = pounds < 0 ? '-£' : '£';

  if (options?.compact && abs >= 1000) {
    if (abs >= 1_000_000) {
      return `${sign}${(abs / 1_000_000).toFixed(1)}m`;
    }
    return `${sign}${(abs / 1000).toFixed(1)}k`;
  }

  return `${sign}${abs.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(
  value: number | null,
  options?: { signed?: boolean },
): string {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }

  const pct = value * 100;
  const sign = options?.signed && pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export function buildMonthLabel(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

export function buildDateScope(params: {
  year?: number;
  month?: number;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  ytd?: boolean;
}): string {
  if (params.asOfDate) {
    return `As of ${params.asOfDate}`;
  }

  if (params.startDate && params.endDate) {
    return `${params.startDate} to ${params.endDate}`;
  }

  if (params.year && params.month) {
    return params.ytd
      ? `${buildMonthLabel(params.year, params.month)} (month) with year-to-date totals`
      : buildMonthLabel(params.year, params.month);
  }

  if (params.year) {
    return params.ytd ? `Year to date ${params.year}` : String(params.year);
  }

  return 'Current reporting period';
}

export function buildFundFilterLabel(
  fundId: string | null | undefined,
  funds: { id: string; name: string }[],
  fallback = 'All funds',
): string {
  if (!fundId) {
    return fallback;
  }

  return funds.find((fund) => fund.id === fundId)?.name ?? 'Selected fund';
}

export function toneFromDelta(delta: number): ReportTone {
  if (delta > 0) {
    return 'positive';
  }
  if (delta < 0) {
    return 'caution';
  }
  return 'neutral';
}

export function toneFromRisk(isHealthy: boolean, critical = false): ReportTone {
  if (isHealthy) {
    return 'positive';
  }
  return critical ? 'critical' : 'caution';
}
