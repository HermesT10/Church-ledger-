'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { generateTrusteeExportPack, type TrusteePackReport } from '@/lib/exports/actions';
import { ReportShell } from '@/components/reports/report-shell';

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
    >
      <div className="space-y-6">
      <Card className="rounded-2xl shadow-sm border">
        <CardHeader>
          <CardTitle className="text-base">Generate Reports</CardTitle>
          <CardDescription>
            Select a financial year and generate all key reports as CSV files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
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
          </div>
        </CardContent>
      </Card>

      {reports.length > 0 && (
        <Card className="rounded-2xl shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Generated Reports ({reports.length})</CardTitle>
              <CardDescription>
                Click on individual reports to download, or download all at once.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadAll}>
              Download All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {reports.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-md border text-sm hover:bg-muted/50">
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
        </Card>
      )}
      </div>
    </ReportShell>
  );
}
