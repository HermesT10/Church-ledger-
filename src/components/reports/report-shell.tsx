'use client';

import Link from 'next/link';
import { REPORT_TABS } from './report-tabs';
import { Card, CardContent } from '@/components/ui/card';
import type {
  ReportDefinition,
  ReportInsight,
  ReportKpi,
  ReportMetadata,
  ReportTone,
} from '@/lib/reports/framework';

interface ReportShellProps {
  title: string;
  description?: string;
  asOfDate?: string;
  activeReport: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  error?: string | null;
  metadata?: ReportMetadata;
  kpis?: ReportKpi[];
  insights?: ReportInsight[];
  definitions?: ReportDefinition[];
}

function toneClasses(tone: ReportTone = 'neutral'): string {
  switch (tone) {
    case 'positive':
      return 'border-success/20 bg-success-soft text-success';
    case 'caution':
      return 'border-warning/20 bg-warning-soft text-warning';
    case 'critical':
      return 'border-danger/20 bg-danger-soft text-danger';
    default:
      return 'border-border bg-muted/30 text-foreground';
  }
}

export function ReportShell({
  title,
  description,
  asOfDate,
  activeReport,
  action,
  children,
  error,
  metadata,
  kpis,
  insights,
  definitions,
}: ReportShellProps) {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card px-6 py-5 shadow-card lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {title}
            {asOfDate && (
              <span className="ml-1 text-base font-normal text-muted-foreground">
                as of {asOfDate}
              </span>
            )}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        {action && <div className="flex flex-wrap justify-start gap-3 lg:justify-end">{action}</div>}
      </div>

      <details className="group rounded-2xl border border-border/70 bg-card p-2 shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold">
          <span>Switch report</span>
          <span className="text-xs font-normal text-muted-foreground">
            {REPORT_TABS.find((tab) => tab.href === activeReport)?.label ?? 'Choose report'}
          </span>
        </summary>
        <div className="mt-2 grid gap-2 border-t border-border/60 pt-2 sm:grid-cols-2 xl:grid-cols-4">
          {REPORT_TABS.map((tab) => {
            const isActive = activeReport === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={
                  isActive
                    ? 'rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground'
                    : 'rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </details>

      {error && (
        <p className="rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
      )}

      {metadata && (
        <Card>
          <CardContent className="grid gap-4 p-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Report Scope
                </p>
                <p className="mt-1 text-sm">{metadata.scope}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Source Of Truth
                </p>
                <p className="mt-1 text-sm">{metadata.source}</p>
              </div>

              {metadata.footnotes && metadata.footnotes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Notes
                  </p>
                  <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                    {metadata.footnotes.map((footnote) => (
                      <p key={`${footnote.label ?? 'note'}-${footnote.text}`}>
                        {footnote.label ? <span className="font-medium text-foreground">{footnote.label}: </span> : null}
                        {footnote.text}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {metadata.comparison && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Comparison
                  </p>
                  <p className="mt-1 text-sm">{metadata.comparison}</p>
                </div>
              )}

              {metadata.filters && metadata.filters.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Active Filters
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {metadata.filters.map((filter) => (
                      <span
                        key={`${filter.label}-${filter.value}`}
                        className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">{filter.label}:</span> {filter.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {kpis && kpis.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            kpi.href ? (
              <Link key={kpi.label} href={kpi.href} className="block">
                <Card className={toneClasses(kpi.tone)}>
                  <CardContent className="p-6">
                    <p className="text-sm text-muted-foreground">{kpi.label}</p>
                    <p className="mt-2 text-2xl font-bold tracking-tight">{kpi.value}</p>
                    {kpi.helper && (
                      <p className="mt-2 text-xs text-muted-foreground">{kpi.helper}</p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ) : (
              <Card
                key={kpi.label}
                className={toneClasses(kpi.tone)}
              >
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{kpi.value}</p>
                  {kpi.helper && (
                    <p className="mt-2 text-xs text-muted-foreground">{kpi.helper}</p>
                  )}
                </CardContent>
              </Card>
            )
          ))}
        </div>
      )}

      {insights && insights.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {insights.map((insight) => (
            <div
              key={`${insight.title}-${insight.body}`}
              className={`rounded-2xl border p-5 shadow-card ${toneClasses(insight.tone)}`}
            >
              <h2 className="text-base font-semibold">{insight.title}</h2>
              <p className="mt-2 text-sm leading-6">{insight.body}</p>
            </div>
          ))}
        </div>
      )}

      {children}

      {definitions && definitions.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Glossary And Definitions</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Trustee-friendly definitions that explain how to read this report.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {definitions.map((definition) => (
                <div key={definition.term} className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm font-semibold">{definition.term}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {definition.meaning}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
