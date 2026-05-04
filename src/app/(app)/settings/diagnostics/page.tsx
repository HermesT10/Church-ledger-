import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { PageShell } from '@/components/page-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCacheStats } from '@/lib/cache';
import { getRuntimeMetadata } from '@/lib/env.server';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { FINANCE_LIFECYCLE_POLICIES } from '@/lib/accounting/lifecycle';

export default async function DiagnosticsPage() {
  const { role } = await getActiveOrg();

  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/settings');
  }

  const runtime = getRuntimeMetadata();
  const cache = getCacheStats();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('now' as never);

  const dbStatus = error ? 'Degraded' : 'Healthy';

  return (
    <PageShell>
      <PageHeader
        title="Diagnostics"
        subtitle="Operational health, release metadata, and cache visibility."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Runtime</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="font-medium">Environment:</span> {runtime.appEnv}</p>
            <p><span className="font-medium">Release:</span> {runtime.release ?? 'unavailable'}</p>
            <p><span className="font-medium">Site URL:</span> {runtime.siteUrl}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Database</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="font-medium">Status:</span> {dbStatus}</p>
            <p><span className="font-medium">Checked at:</span> {error ? 'failed' : String(data)}</p>
            <p>
              <Link className="text-primary underline underline-offset-4" href="/api/health" target="_blank">
                Open health endpoint
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Cache Telemetry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="font-medium">Entries:</span> {cache.size ?? 0}</p>
            <p><span className="font-medium">Hits:</span> {cache.hits}</p>
            <p><span className="font-medium">Misses:</span> {cache.misses}</p>
            <p><span className="font-medium">Invalidations:</span> {cache.invalidations}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Finance Workflow Controls</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
          {FINANCE_LIFECYCLE_POLICIES.map((policy) => (
            <div key={policy.module} className="rounded-xl border p-3">
              <p className="font-medium">{policy.module.replace(/_/g, ' ')}</p>
              <p className="text-muted-foreground">Posting: {policy.postingControl.replace(/_/g, ' ')}</p>
              <p className="text-muted-foreground">States: {policy.states.join(' -> ')}</p>
              <p className="text-muted-foreground">
                {policy.reversalRequiredAfterPosting ? 'Reversal required after posting' : 'No posted reversal workflow required'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </PageShell>
  );
}
