import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePlatformAdmin } from '@/lib/platform-admin';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function aggregateCounts<T extends string>(items: T[]): Array<{ key: T; count: number }> {
  const counts = new Map<T, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 6);
}

export default async function InternalAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  await requirePlatformAdmin();
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? '';
  const admin = createAdminClient();

  let organisationsQuery = admin
    .from('organisations')
    .select('id, name, legal_name, city, country, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (query) {
    organisationsQuery = organisationsQuery.or(
      `name.ilike.%${query}%,legal_name.ilike.%${query}%,city.ilike.%${query}%`,
    );
  }

  const { data: organisations } = await organisationsQuery;
  const organisationIds = (organisations ?? []).map((organisation) => organisation.id);

  const [{ data: memberships }, { data: onboardingRows }, { data: subscriptions }, { data: recentEvents }] =
    organisationIds.length > 0
      ? await Promise.all([
          admin
            .from('memberships')
            .select('organisation_id, status')
            .in('organisation_id', organisationIds),
          admin
            .from('onboarding_progress')
            .select('organisation_id, current_step, is_completed')
            .in('organisation_id', organisationIds),
          admin
            .from('organisation_subscriptions')
            .select(`
              organisation_id,
              status,
              seat_count,
              seat_limit,
              subscription_plans:plan_id (
                name
              )
            `)
            .in('organisation_id', organisationIds),
          admin
            .from('product_events')
            .select('organisation_id, event_type, module_key, created_at, path')
            .in('organisation_id', organisationIds)
            .order('created_at', { ascending: false })
            .limit(200),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const membershipCounts = new Map<string, { active: number; disabled: number }>();
  for (const membership of memberships ?? []) {
    const current = membershipCounts.get(membership.organisation_id) ?? { active: 0, disabled: 0 };
    if (membership.status === 'disabled') {
      current.disabled += 1;
    } else if (membership.status === 'active') {
      current.active += 1;
    }
    membershipCounts.set(membership.organisation_id, current);
  }

  const onboardingByOrg = new Map(
    (onboardingRows ?? []).map((row) => [row.organisation_id, row] as const),
  );
  const subscriptionsByOrg = new Map(
    (subscriptions ?? []).map((row) => [row.organisation_id, row] as const),
  );

  const moduleUsage = aggregateCounts(
    (recentEvents ?? [])
      .map((event) => event.module_key)
      .filter((value): value is string => Boolean(value)),
  );
  const failureEvents = (recentEvents ?? []).filter((event) => event.event_type.includes('failed')).slice(0, 8);

  return (
    <PageShell>
      <PageHeader
        title="Internal Admin"
        subtitle="Platform-only support console for onboarding, subscriptions, and usage diagnostics."
        actions={
          <form action="/internal" className="flex items-center gap-2">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search organisations"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <Card className="md:col-span-4 rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Top Module Usage</CardTitle>
            <CardDescription>Most-viewed modules captured from product events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {moduleUsage.length === 0 ? (
              <p className="text-sm text-muted-foreground">No product usage captured yet.</p>
            ) : (
              moduleUsage.map((entry) => (
                <div key={entry.key} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm">{entry.key.replace(/-/g, ' ')}</span>
                  <Badge variant="secondary">{entry.count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-8 rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Recent Support-Relevant Failures</CardTitle>
            <CardDescription>Invite and onboarding issues surfaced from product events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {failureEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent failure events were recorded.</p>
            ) : (
              failureEvents.map((event) => (
                <div key={`${event.organisation_id}-${event.created_at}-${event.event_type}`} className="rounded-lg border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{event.event_type.replace(/_/g, ' ')}</p>
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.created_at).toLocaleString('en-GB')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{event.path ?? 'No path captured'}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Organisation Directory</CardTitle>
          <CardDescription>
            Search workspaces, inspect onboarding progress, and spot subscription/support risks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Onboarding</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(organisations ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No organisations matched that search.
                    </TableCell>
                  </TableRow>
                ) : (
                  (organisations ?? []).map((organisation) => {
                    const memberCount = membershipCounts.get(organisation.id) ?? { active: 0, disabled: 0 };
                    const onboarding = onboardingByOrg.get(organisation.id);
                    const subscription = subscriptionsByOrg.get(organisation.id);
                    const plan = Array.isArray(subscription?.subscription_plans)
                      ? subscription.subscription_plans[0] ?? null
                      : subscription?.subscription_plans ?? null;

                    return (
                      <TableRow key={organisation.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{organisation.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {organisation.legal_name ?? 'No legal name recorded'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {[organisation.city, organisation.country].filter(Boolean).join(', ') || 'Not set'}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{memberCount.active} active</p>
                            <p className="text-xs text-muted-foreground">{memberCount.disabled} disabled</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={onboarding?.is_completed ? 'secondary' : 'outline'} className="text-[10px]">
                            {onboarding?.is_completed
                              ? 'Completed'
                              : `Step ${onboarding?.current_step ?? 1}`}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{plan?.name ?? 'No plan row'}</p>
                            <p className="text-xs text-muted-foreground">
                              {subscription?.status ?? 'trial'} · {subscription?.seat_count ?? memberCount.active} seats
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link href="/settings/diagnostics">Diagnostics</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
