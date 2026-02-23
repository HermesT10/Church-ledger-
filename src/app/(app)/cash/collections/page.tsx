import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { listCashCollections } from '@/lib/cash/actions';
import { Plus, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatPounds(p: number) { return '£' + (p / 100).toFixed(2); }

function statusBadge(status: string) {
  switch (status) {
    case 'banked': return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Banked</Badge>;
    case 'posted': return <Badge>Posted</Badge>;
    default: return <Badge variant="outline">Draft</Badge>;
  }
}

export default async function CollectionsPage() {
  const { orgId, role } = await getActiveOrg();
  const canEdit = role === 'admin' || role === 'treasurer';
  const { data: collections } = await listCashCollections(orgId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cash Collections</h2>
        {canEdit && (
          <Button asChild size="sm">
            <Link href="/cash/collections/new">
              <Plus size={14} className="mr-1" /> New Collection
            </Link>
          </Button>
        )}
      </div>

      {collections.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/40 bg-white/70 shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Service / Event</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Counter 1</TableHead>
                <TableHead>Counter 2</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Banked</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collections.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{formatDate(c.collected_date)}</TableCell>
                  <TableCell className="font-medium">{c.service_name}</TableCell>
                  <TableCell className="text-right font-medium">{formatPounds(c.total_amount_pence)}</TableCell>
                  <TableCell>
                    {c.counted_by_name_1}
                    {c.counter_1_confirmed && <span className="ml-1 text-green-600 text-xs">✓</span>}
                  </TableCell>
                  <TableCell>
                    {c.counted_by_name_2}
                    {c.counter_2_confirmed && <span className="ml-1 text-green-600 text-xs">✓</span>}
                  </TableCell>
                  <TableCell>{statusBadge(c.status)}</TableCell>
                  <TableCell>{c.banked_at ? formatDate(c.banked_at) : '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/cash/collections/${c.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/40 bg-slate-100/55 p-8 text-center shadow-sm">
          <Coins className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No cash collections yet.{' '}
            {canEdit && 'Record your first collection to get started.'}
          </p>
        </div>
      )}
    </div>
  );
}
