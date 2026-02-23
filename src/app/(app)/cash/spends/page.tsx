import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { listCashSpends } from '@/lib/cash/actions';
import { Plus, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function formatDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function formatPounds(p: number) { return '£' + (p / 100).toFixed(2); }

export default async function SpendsPage() {
  const { orgId, role } = await getActiveOrg();
  const canEdit = role === 'admin' || role === 'treasurer';
  const { data: spends } = await listCashSpends(orgId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cash Spends</h2>
        {canEdit && (
          <Button asChild size="sm">
            <Link href="/cash/spends/new"><Plus size={14} className="mr-1" /> New Spend</Link>
          </Button>
        )}
      </div>

      {spends.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/40 bg-white/70 shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Paid To</TableHead>
                <TableHead>Spent By</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spends.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{formatDate(s.spend_date)}</TableCell>
                  <TableCell className="font-medium">{s.paid_to}</TableCell>
                  <TableCell>{s.spent_by}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{s.description}</TableCell>
                  <TableCell>{s.fund_name}</TableCell>
                  <TableCell>{s.expense_account_name}</TableCell>
                  <TableCell className="text-right font-medium">{formatPounds(s.amount_pence)}</TableCell>
                  <TableCell>
                    {s.receipt_url ? (
                      <a href={s.receipt_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">View</a>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.status === 'posted' ? 'default' : 'outline'}>
                      {s.status === 'posted' ? 'Posted' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/cash/spends/${s.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/40 bg-slate-100/55 p-8 text-center shadow-sm">
          <Wallet className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No cash spends yet.{' '}
            {canEdit && 'Record petty cash expenditure to get started.'}
          </p>
        </div>
      )}
    </div>
  );
}
