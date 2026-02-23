import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { listCashDeposits } from '@/lib/cash/actions';
import { Plus, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function formatDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function formatPounds(p: number) { return '£' + (p / 100).toFixed(2); }

function statusBadge(status: string) {
  switch (status) {
    case 'matched': return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Matched</Badge>;
    case 'posted': return <Badge>Posted</Badge>;
    default: return <Badge variant="outline">Draft</Badge>;
  }
}

export default async function DepositsPage() {
  const { orgId, role } = await getActiveOrg();
  const canEdit = role === 'admin' || role === 'treasurer';
  const { data: deposits } = await listCashDeposits(orgId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cash Deposits to Bank</h2>
        {canEdit && (
          <Button asChild size="sm">
            <Link href="/cash/deposits/new"><Plus size={14} className="mr-1" /> New Deposit</Link>
          </Button>
        )}
      </div>

      {deposits.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/40 bg-white/70 shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Bank Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Collections</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deposits.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{formatDate(d.deposit_date)}</TableCell>
                  <TableCell className="font-medium">{d.bank_account_name}</TableCell>
                  <TableCell className="text-right font-medium">{formatPounds(d.total_amount_pence)}</TableCell>
                  <TableCell className="text-right">{d.collection_count}</TableCell>
                  <TableCell>{statusBadge(d.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/40 bg-slate-100/55 p-8 text-center shadow-sm">
          <Landmark className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No cash deposits yet.{' '}
            {canEdit && 'Deposit cash from collections into your bank account.'}
          </p>
        </div>
      )}
    </div>
  );
}
