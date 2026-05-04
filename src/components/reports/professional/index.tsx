import Link from 'next/link';
import type { ReactNode } from 'react';
import { CheckCircle2, Download, FileText, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type {
  ProfessionalReportMetadata,
  ReportExportFormat,
  ReportSnapshot,
  ReportValidationResult,
} from '@/lib/reports/engine/types';

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleDateString('en-GB');
}

function severityVariant(severity: ReportValidationResult['severity']) {
  if (severity === 'blocker') return 'destructive' as const;
  if (severity === 'warning') return 'secondary' as const;
  return 'outline' as const;
}

export function ReportCover({ metadata, children }: { metadata: ProfessionalReportMetadata; children?: ReactNode }) {
  return (
    <Card className="rounded-3xl border-border/70 bg-card shadow-card">
      <CardContent className="p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Professional report pack</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{metadata.report_title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatDate(metadata.period_start)} to {formatDate(metadata.period_end)} · Version {metadata.version}
        </p>
        {children ? <div className="mt-6">{children}</div> : null}
      </CardContent>
    </Card>
  );
}

export function ReportHeader({ metadata }: { metadata: ProfessionalReportMetadata }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-3xl border border-border/70 bg-card p-5 shadow-card">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Report</p>
        <h2 className="mt-1 text-xl font-bold">{metadata.report_title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {metadata.report_type.replaceAll('_', ' ')} · {metadata.basis} basis
        </p>
      </div>
      <Badge>{metadata.status}</Badge>
    </div>
  );
}

export function ReportFooter({ metadata }: { metadata: ProfessionalReportMetadata }) {
  return (
    <p className="text-center text-xs text-muted-foreground">
      Generated {new Date(metadata.generated_at).toLocaleString('en-GB')} · Report ID {metadata.report_id}
    </p>
  );
}

export function ReportMetadataPanel({ metadata }: { metadata: ProfessionalReportMetadata }) {
  const rows = [
    ['Workspace', metadata.workspace_id],
    ['Report type', metadata.report_type],
    ['Financial year', metadata.financial_year ?? 'Not set'],
    ['Basis', metadata.basis],
    ['Period', `${formatDate(metadata.period_start)} to ${formatDate(metadata.period_end)}`],
    ['Funds included', metadata.funds_included.length > 0 ? metadata.funds_included.join(', ') : 'All funds'],
    ['Status', metadata.status],
    ['Version', metadata.version],
  ];
  return (
    <Card className="rounded-3xl border-border/70 bg-card shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileText size={18} /> Report Metadata</CardTitle>
        <CardDescription>Consistent metadata used for review, approval, traceability, and exports.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-border/70 bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 break-words text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="rounded-3xl border-border/70 bg-card shadow-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ReportTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/70">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => <TableHead key={header}>{header}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {row.map((cell, cellIndex) => <TableCell key={`${index}-${cellIndex}`}>{cell}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ReportChart({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
      <p className="mb-3 text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

export function ReportNarrativeBlock({ title = 'Trustee Narrative', items }: { title?: string; items: string[] }) {
  return (
    <Card className="rounded-3xl border-border/70 bg-card shadow-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Plain-English commentary for trustee and leadership review.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <p key={item} className="text-sm leading-6 text-muted-foreground">{item}</p>
        ))}
      </CardContent>
    </Card>
  );
}

export function ReportNotesBlock({ notes }: { notes: string[] }) {
  return (
    <ReportSection title="Report Notes" description="Notes and caveats to carry into exported packs.">
      {notes.length > 0 ? (
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No notes have been added yet.</p>
      )}
    </ReportSection>
  );
}

export function ReportApprovalBlock({ snapshot }: { snapshot: ReportSnapshot }) {
  const blockers = snapshot.validation.filter((item) => item.severity === 'blocker');
  return (
    <Card className="rounded-3xl border-border/70 bg-card shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck size={18} /> Approval Readiness</CardTitle>
        <CardDescription>Approval is blocked when report validation finds accounting blockers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={blockers.length > 0 ? 'destructive' : 'default'}>
            {blockers.length > 0 ? `${blockers.length} blocker(s)` : 'Ready for review'}
          </Badge>
          <Badge variant="outline">{snapshot.metadata.status}</Badge>
        </div>
        <ReportValidationPanel validation={snapshot.validation} />
      </CardContent>
    </Card>
  );
}

export function ReportAppendix({ children }: { children: ReactNode }) {
  return (
    <ReportSection title="Appendix" description="Supporting schedules, validation details, and traceability.">
      {children}
    </ReportSection>
  );
}

export function ReportExportActions({
  reportId,
  formats,
}: {
  reportId: string;
  formats: ReportExportFormat[];
}) {
  return (
    <Card className="rounded-3xl border-border/70 bg-card shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Download size={18} /> Export Actions</CardTitle>
        <CardDescription>Export adapters use the saved professional report snapshot and metadata.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {formats.map((format) => (
          <Button key={format} variant="outline" size="sm" asChild>
            <Link href={`/reports/export-pack?report=${reportId}&format=${format}`}>{format.toUpperCase()}</Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

export function ReportValidationPanel({ validation }: { validation: ReportValidationResult[] }) {
  if (validation.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
        <CheckCircle2 size={16} className="text-success" />
        No validation issues found for this snapshot.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {validation.map((item) => (
        <div key={item.id} className="rounded-2xl border border-border/70 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-semibold">
              {item.severity === 'blocker' ? <TriangleAlert size={16} className="text-destructive" /> : null}
              {item.title}
            </p>
            <Badge variant={severityVariant(item.severity)}>{item.severity}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">{item.message}</p>
          <p className="mt-1 text-xs text-muted-foreground">Rule: {item.rule}</p>
        </div>
      ))}
    </div>
  );
}

export function ProfessionalReportSnapshotPanel({ snapshot }: { snapshot: ReportSnapshot | null }) {
  if (!snapshot) return null;
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 px-4 pt-6 sm:px-6 lg:px-8">
      <ReportHeader metadata={snapshot.metadata} />
      <ReportMetadataPanel metadata={snapshot.metadata} />
      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <ReportNarrativeBlock items={snapshot.commentary} />
        <ReportApprovalBlock snapshot={snapshot} />
      </div>
      <ReportExportActions reportId={snapshot.metadata.report_id} formats={snapshot.definition.supportedExportFormats} />
    </div>
  );
}
