import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createYearEndCloseRun, listYearEndCloseRuns } from '@/lib/year-end-close/actions';

async function createRun(formData: FormData) {
  'use server';

  const financialYear = Number(formData.get('financialYear') ?? new Date().getFullYear());
  const periodStart = String(formData.get('periodStart') ?? `${financialYear}-01-01`);
  const periodEnd = String(formData.get('periodEnd') ?? `${financialYear}-12-31`);
  const basis = formData.get('basis') === 'cash' ? 'cash' : 'accruals';

  const result = await createYearEndCloseRun({ financialYear, periodStart, periodEnd, basis });
  if (result.data?.runId) redirect(`/year-end-close/${result.data.runId}`);
}

export default async function YearEndClosePage() {
  const { data: runs, error } = await listYearEndCloseRuns();
  const year = new Date().getFullYear();

  return (
    <PageShell>
      <PageHeader
        title="Year-End Close"
        subtitle="Guide treasurers through financial year close, trustee approval, period locking, filing pack export, and Charity Commission annual return preparation."
        actions={<Button asChild><Link href="/reports/annual/accounts-builder">Open annual accounts</Link></Button>}
      />

      {error && <SoftAlert variant="error">{error}</SoftAlert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Close runs</CardTitle>
            <CardDescription>Select an existing close run or create the next financial year close.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {runs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 p-6 text-sm text-muted-foreground">
                No year-end close runs exist yet.
              </div>
            ) : (
              runs.map((run) => (
                <Link
                  key={run.id}
                  href={`/year-end-close/${run.id}`}
                  className="flex items-center justify-between rounded-2xl border border-border/70 bg-surface-muted/40 p-4 transition hover:border-primary/30 hover:bg-primary/5"
                >
                  <div>
                    <p className="font-semibold text-foreground">Financial year {run.financialYear}</p>
                    <p className="text-sm text-muted-foreground">{run.periodStart} to {run.periodEnd} · {run.basis}</p>
                  </div>
                  <Badge variant="outline">{run.status.replaceAll('_', ' ')}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create close run</CardTitle>
            <CardDescription>Creates the persisted run and seeds all 23 workflow steps.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createRun} className="space-y-4">
              <label className="block text-sm font-medium">
                Financial year
                <input name="financialYear" defaultValue={year} type="number" className="mt-2 h-10 w-full rounded-xl border border-input bg-card px-3 text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">
                  Start
                  <input name="periodStart" defaultValue={`${year}-01-01`} type="date" className="mt-2 h-10 w-full rounded-xl border border-input bg-card px-3 text-sm" />
                </label>
                <label className="block text-sm font-medium">
                  End
                  <input name="periodEnd" defaultValue={`${year}-12-31`} type="date" className="mt-2 h-10 w-full rounded-xl border border-input bg-card px-3 text-sm" />
                </label>
              </div>
              <label className="block text-sm font-medium">
                Accounting basis
                <select name="basis" defaultValue="accruals" className="mt-2 h-10 w-full rounded-xl border border-input bg-card px-3 text-sm">
                  <option value="accruals">Accruals</option>
                  <option value="cash">Cash</option>
                </select>
              </label>
              <Button type="submit" className="w-full">Create year-end close</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
