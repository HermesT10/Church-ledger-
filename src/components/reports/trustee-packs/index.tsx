'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TrusteePack, TrusteePackSection } from '@/lib/reports/trustee-packs/types';
import { TrusteePackChartView } from './charts';

function statusVariant(status: TrusteePackSection['status']) {
  if (status === 'needs_review') return 'destructive' as const;
  if (status === 'empty' || status === 'not_applicable') return 'secondary' as const;
  return 'outline' as const;
}

function SectionCard({ section }: { section: TrusteePackSection }) {
  return (
    <Card className="rounded-3xl border-border/70 shadow-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </div>
          <Badge variant={statusVariant(section.status)}>{section.status.replaceAll('_', ' ')}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {section.metrics.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {section.metrics.map((metric) => (
              <div key={`${section.key}-${metric.label}`} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-xl font-bold">{metric.value}</p>
                {metric.helper ? <p className="mt-1 text-xs text-muted-foreground">{metric.helper}</p> : null}
              </div>
            ))}
          </div>
        )}

        {section.narrative.length > 0 && (
          <div className="space-y-2">
            {section.narrative.map((line) => (
              <p key={line} className="text-sm leading-6 text-muted-foreground">{line}</p>
            ))}
          </div>
        )}

        {section.charts.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {section.charts.map((chart) => <TrusteePackChartView key={`${section.key}-${chart.type}`} chart={chart} />)}
          </div>
        )}

        {section.table && (
          <Table>
            <TableHeader>
              <TableRow>
                {section.table.headers.map((header) => <TableHead key={header}>{header}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.table.rows.length > 0 ? (
                section.table.rows.map((row, rowIndex) => (
                  <TableRow key={`${section.key}-row-${rowIndex}`}>
                    {row.map((cell, cellIndex) => <TableCell key={`${section.key}-${rowIndex}-${cellIndex}`}>{cell}</TableCell>)}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={section.table.headers.length} className="text-muted-foreground">
                    No rows available for this section.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function TrusteePackCover({ pack }: { pack: TrusteePack }) {
  return (
    <Card className="rounded-3xl border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 shadow-card">
      <CardContent className="p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Trustee reporting pack</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight">{pack.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {pack.periodLabel} · Generated {new Date(pack.generatedAt).toLocaleString('en-GB')}
        </p>
      </CardContent>
    </Card>
  );
}

export function TrusteePackCommentary({ pack }: { pack: TrusteePack }) {
  return (
    <Card className="rounded-3xl border-border/70 shadow-card">
      <CardHeader>
        <CardTitle>Executive Commentary</CardTitle>
        <CardDescription>Deterministic, explainable commentary generated from report data.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-2">
        {pack.commentary.map((item) => (
          <div key={item.id} className="rounded-2xl border border-border/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{item.title}</h3>
              <Badge variant={item.tone === 'critical' ? 'destructive' : 'outline'}>{item.tone}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.adminOverrideText ?? item.editableText}</p>
            <p className="mt-2 text-xs text-muted-foreground">Calculation: {item.calculation}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function TrusteePackRisksAndActions({ pack }: { pack: TrusteePack }) {
  return (
    <Card className="rounded-3xl border-border/70 shadow-card">
      <CardHeader>
        <CardTitle>Recommended Trustee Actions</CardTitle>
        <CardDescription>Action-oriented follow-up for trustees and leadership.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pack.actions.map((action) => (
          <div key={action.id} className="rounded-2xl border border-border/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{action.title}</h3>
              <Badge variant={action.priority === 'high' ? 'destructive' : 'outline'}>{action.priority}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{action.body}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function TrusteePackApprovalPanel({ pack }: { pack: TrusteePack }) {
  return (
    <Card className="rounded-3xl border-border/70 shadow-card">
      <CardHeader>
        <CardTitle>Review And Approval</CardTitle>
        <CardDescription>Lifecycle state, named approval and trustee notes.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm md:grid-cols-2">
        <p><span className="font-semibold">Status:</span> {pack.approval.status}</p>
        <p><span className="font-semibold">Prepared by:</span> {pack.approval.preparedBy ?? 'Not recorded'}</p>
        <p><span className="font-semibold">Reviewed by:</span> {pack.approval.reviewedBy ?? 'Pending review'}</p>
        <p><span className="font-semibold">Approved by:</span> {pack.approval.approvedByName ?? pack.approval.approvedBy ?? 'Pending approval'}</p>
      </CardContent>
    </Card>
  );
}

export function TrusteePackExportActions({ pack }: { pack: TrusteePack }) {
  return (
    <Card className="rounded-3xl border-border/70 shadow-card">
      <CardHeader>
        <CardTitle>Exports</CardTitle>
        <CardDescription>PDF, Word and Excel exports use the shared document-production templates, metadata, versioning, and draft/final controls.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {pack.exports.map((item) => (
          <Button key={item.format} type="button" variant="outline" disabled={item.requiresApproval && pack.approval.status !== 'approved'}>
            {item.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

export function TrusteePackAppendixDefinitions({ pack }: { pack: TrusteePack }) {
  return (
    <Card className="rounded-3xl border-border/70 shadow-card">
      <CardHeader>
        <CardTitle>Plain-English Definitions</CardTitle>
        <CardDescription>Definitions used in trustee and leadership packs.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {pack.definitions.map((definition) => (
          <div key={definition.term} className="rounded-2xl border border-border/70 p-4">
            <p className="font-semibold">{definition.term}</p>
            <p className="mt-1 text-sm text-muted-foreground">{definition.meaning}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function TrusteePackPanel({ pack }: { pack: TrusteePack | null }) {
  if (!pack) return null;
  return (
    <div className="space-y-6">
      <TrusteePackCover pack={pack} />
      <TrusteePackCommentary pack={pack} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {pack.kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-border/70 bg-card p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
            <p className="mt-2 text-2xl font-bold">{kpi.value}</p>
            {kpi.helper ? <p className="mt-1 text-xs text-muted-foreground">{kpi.helper}</p> : null}
          </div>
        ))}
      </div>
      {pack.sections.filter((section) => section.key !== 'cover' && section.key !== 'key_financial_kpis').map((section) => (
        <SectionCard key={section.key} section={section} />
      ))}
      <TrusteePackRisksAndActions pack={pack} />
      <TrusteePackApprovalPanel pack={pack} />
      <TrusteePackExportActions pack={pack} />
      <TrusteePackAppendixDefinitions pack={pack} />
    </div>
  );
}
