'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { generateTrusteeExportPack, type TrusteePackReport } from '@/lib/exports/actions';
import { ReportShell } from '@/components/reports/report-shell';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { ReportTableCard } from '@/components/reports/report-table-card';
import type { ReportDefinition, ReportMetadata } from '@/lib/reports/framework';

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportPackClient() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<TrusteePackReport[]>([]);

  const metadata: ReportMetadata = {
    scope: `Board pack and CSV export set for ${year}`,
    source: 'Generated from the live reporting services that underpin trustee and finance reports.',
    filters: [{ label: 'Financial year', value: String(year) }],
    footnotes: [
      {
        text: 'CSV exports are intended for working papers, auditors, and offline analysis.',
      },
      {
        text: 'For PDF-style board presentation, use the linked print-friendly annual or leadership views.',
      },
    ],
  };

  const definitions: ReportDefinition[] = [
    {
      term: 'Export pack',
      meaning: 'A collection of CSV outputs produced from the same reporting logic as the on-screen finance reports.',
    },
    {
      term: 'Board pack',
      meaning: 'A presentation-oriented print or PDF view for trustees and leadership rather than a raw data file.',
    },
  ];

  async function handleGenerate() {
    setLoading(true);
    const asOfDate = new Date().toISOString().slice(0, 10);

    const { data, error } = await generateTrusteeExportPack({ year, asOfDate });
    setLoading(false);

    if (error) {
      toast.error(error);
      return;
    }

    setReports(data);
    toast.success(`Generated ${data.length} report(s).`);
  }

  function handleDownloadAll() {
    for (const r of reports) {
      downloadCsv(r.name, r.csv);
    }
    toast.success('All reports downloaded.');
  }

  return (
    <ReportShell
      title="Trustee Export Pack"
      description="Generate a complete set of financial reports as CSV files for trustee review, audit, or regulatory submission."
      activeReport="/reports/export-pack"
      metadata={metadata}
      definitions={definitions}
    >
      <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate Reports</CardTitle>
          <CardDescription>
            Select a financial year and generate all key reports as CSV files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReportFilterBar className="border-0 bg-transparent p-0 shadow-none">
            <div>
              <label className="text-sm text-muted-foreground">Financial Year</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="flex h-9 w-28 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              />
            </div>
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? 'Generating...' : 'Generate All Reports'}
            </Button>
          </ReportFilterBar>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Print-Friendly Board Pack</CardTitle>
          <CardDescription>
            Use these presentation-ready routes when trustees need a clean PDF or print output instead of raw CSVs.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/reports/leadership-snapshot">Leadership Snapshot</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/reports/trustee-snapshot">Trustee Snapshot</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/reports/annual">Annual Board Pack</Link>
          </Button>
        </CardContent>
      </Card>

      {reports.length > 0 && (
        <ReportTableCard
          title={`Generated Reports (${reports.length})`}
          description="Click on individual reports to download, or download all at once."
        >
          <div className="flex justify-end px-6 pt-6">
            <Button variant="outline" size="sm" onClick={handleDownloadAll}>
              Download All
            </Button>
          </div>
          <CardContent>
            <div className="space-y-2">
              {reports.map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3 text-sm hover:bg-surface-muted">
                  <span className="font-mono text-xs">{r.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => downloadCsv(r.name, r.csv)}
                  >
                    Download
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </ReportTableCard>
      )}
      </div>
    </ReportShell>
  );
}
