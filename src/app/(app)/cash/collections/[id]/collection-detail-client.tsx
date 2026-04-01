'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { postCashCollection } from '@/lib/cash/actions';
import type { CashCollectionDetail } from '@/lib/cash/types';
import { toast } from 'sonner';
import { CheckCircle, FileText, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function formatDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function formatPounds(p: number) { return '£' + (p / 100).toFixed(2); }

function statusBadge(status: string) {
  switch (status) {
    case 'banked': return <Badge className="bg-green-100 text-green-800 hover:bg-green-200 text-base">Banked</Badge>;
    case 'posted': return <Badge className="text-base">Posted</Badge>;
    default: return <Badge variant="outline" className="text-base">Draft</Badge>;
  }
}

export function CollectionDetailClient({ collection: c, canEdit }: { collection: CashCollectionDetail; canEdit: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handlePost = () => {
    startTransition(async () => {
      const { success, error } = await postCashCollection(c.id);
      if (error) { toast.error(error); return; }
      if (success) { toast.success('Collection posted. GL entries created.'); router.refresh(); }
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Date</p><p className="text-lg font-semibold">{formatDate(c.collected_date)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Service</p><p className="text-lg font-semibold">{c.service_name}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total</p><p className="text-lg font-semibold">{formatPounds(c.total_amount_pence)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Status</p><div className="mt-1">{statusBadge(c.status)}</div></CardContent></Card>
      </div>

      {/* Signatures */}
      <Card className="app-surface">
        <CardHeader><CardTitle className="text-base">Count Verification</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-[1.25rem] border border-border/70 bg-background/70 p-3">
              <p className="text-sm font-medium">{c.counted_by_name_1}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {c.counter_1_confirmed
                  ? <span className="text-green-600 flex items-center gap-1"><CheckCircle size={12} /> Confirmed</span>
                  : <span className="text-amber-600">Not confirmed</span>
                }
              </p>
            </div>
            <div className="rounded-[1.25rem] border border-border/70 bg-background/70 p-3">
              <p className="text-sm font-medium">{c.counted_by_name_2}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {c.counter_2_confirmed
                  ? <span className="text-green-600 flex items-center gap-1"><CheckCircle size={12} /> Confirmed</span>
                  : <span className="text-amber-600">Not confirmed</span>
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card className="app-surface">
        <CardHeader><CardTitle className="text-base">Collection Lines</CardTitle><CardDescription>{c.lines.length} line(s)</CardDescription></CardHeader>
        <CardContent>
          <div className="app-table-shell">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fund</TableHead>
                  <TableHead>Income Account</TableHead>
                  <TableHead>Donor</TableHead>
                  <TableHead className="text-center">Gift Aid</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.fund_name}</TableCell>
                    <TableCell>{l.income_account_name}</TableCell>
                    <TableCell>{l.donor_name ?? 'Anonymous'}</TableCell>
                    <TableCell className="text-center">{l.gift_aid_eligible ? '✓' : '—'}</TableCell>
                    <TableCell className="text-right font-medium app-table-amount-positive">{formatPounds(l.amount_pence)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex justify-end border-t border-border/70 pt-3">
            <span className="text-sm font-semibold">Total: {formatPounds(c.total_amount_pence)}</span>
          </div>
        </CardContent>
      </Card>

      {c.notes && (
        <Card className="app-surface"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Notes</p><p className="mt-1 text-sm">{c.notes}</p></CardContent></Card>
      )}

      <Card className="app-surface">
        <CardHeader><CardTitle className="text-base">Actions</CardTitle></CardHeader>
        <CardContent className="app-toolbar">
          {c.status === 'draft' && canEdit && (
            <Button onClick={handlePost} disabled={isPending}>
              {isPending ? 'Posting…' : 'Post Collection'}
            </Button>
          )}
          {c.posted_transaction_id && (
            <Button asChild variant="outline">
              <Link href={`/journal/${c.posted_transaction_id}`}><FileText size={14} className="mr-1" /> View Journal</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/cash/collections"><ArrowLeft size={14} className="mr-1" /> Back</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
