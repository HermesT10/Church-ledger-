import { getActiveOrg } from '@/lib/org';
import { getCashMovementLedger, getCashInHandBalance } from '@/lib/cash/actions';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { ScrollText } from 'lucide-react';

function formatDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function formatPounds(p: number) {
  const sign = p < 0 ? '-' : '';
  return sign + '£' + (Math.abs(p) / 100).toFixed(2);
}

function typeBadge(type: string) {
  switch (type) {
    case 'collection': return <Badge className="bg-green-100 text-green-800 hover:bg-green-200 text-xs">In</Badge>;
    case 'spend': return <Badge className="bg-red-100 text-red-800 hover:bg-red-200 text-xs">Out</Badge>;
    case 'deposit': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 text-xs">Bank</Badge>;
    default: return <Badge variant="outline" className="text-xs">{type}</Badge>;
  }
}

export default async function CashLedgerPage() {
  const { orgId } = await getActiveOrg();

  const [result, currentBalance] = await Promise.all([
    getCashMovementLedger(orgId),
    getCashInHandBalance(orgId),
  ]);

  const entries = result.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cash Movement Ledger</h2>
        <div className="text-sm font-medium">
          Balance: <span className={`text-lg font-bold ${currentBalance < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatPounds(currentBalance)}</span>
        </div>
      </div>

      {entries.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/40 bg-white/70 shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Journal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={`${e.type}-${e.id}`}>
                  <TableCell>{formatDate(e.date)}</TableCell>
                  <TableCell>{typeBadge(e.type)}</TableCell>
                  <TableCell className="max-w-[300px] truncate">{e.description}</TableCell>
                  <TableCell className={`text-right font-medium ${e.amountPence >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {e.amountPence >= 0 ? '+' : ''}{formatPounds(e.amountPence)}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatPounds(e.runningBalancePence)}</TableCell>
                  <TableCell>
                    {e.journalId ? (
                      <Link href={`/journal/${e.journalId}`} className="text-blue-600 hover:underline text-xs">View</Link>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/40 bg-slate-100/55 p-8 text-center shadow-sm">
          <ScrollText className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No cash movements yet. Post a collection or spend to start the ledger.
          </p>
        </div>
      )}
    </div>
  );
}
