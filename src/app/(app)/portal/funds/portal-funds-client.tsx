'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { PortalFundSummary, PortalFundTransaction } from '@/lib/portal/funds';
import { listPortalFundTransactions } from '@/lib/portal/funds';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function money(pence: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

export function PortalFundsClient({ funds }: { funds: PortalFundSummary[] }) {
  const [selected, setSelected] = useState<PortalFundSummary | null>(null);
  const [transactions, setTransactions] = useState<PortalFundTransaction[]>([]);
  const [isPending, startTransition] = useTransition();

  function openFund(fund: PortalFundSummary) {
    setSelected(fund);
    startTransition(async () => {
      const result = await listPortalFundTransactions(fund.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setTransactions(result.data);
    });
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border/70 bg-card shadow-card">
        <CardHeader>
          <CardTitle>Restricted Funds</CardTitle>
          <p className="text-sm text-muted-foreground">Funds your admin has explicitly assigned to your portal account.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Donated</p>
              <p className="mt-1 text-xl font-semibold">{money(funds.reduce((sum, fund) => sum + fund.donatedPence, 0))}</p>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Used</p>
              <p className="mt-1 text-xl font-semibold">{money(funds.reduce((sum, fund) => sum + fund.usedPence, 0))}</p>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Remaining</p>
              <p className="mt-1 text-xl font-semibold">{money(funds.reduce((sum, fund) => sum + fund.remainingPence, 0))}</p>
            </div>
          </div>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fund</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Donated</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {funds.map((fund) => (
                  <TableRow key={fund.id}>
                    <TableCell className="font-medium">{fund.name}</TableCell>
                    <TableCell><Badge variant="outline">{fund.type}</Badge></TableCell>
                    <TableCell>{money(fund.donatedPence)}</TableCell>
                    <TableCell>{money(fund.usedPence)}</TableCell>
                    <TableCell>{money(fund.remainingPence)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openFund(fund)}>Transactions</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {funds.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No restricted funds have been assigned to you.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(selected)} onOpenChange={(value) => !value && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>{money(selected.remainingPence)} remaining · {selected.transactionCount} transactions</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-3">
                {isPending ? <p className="text-sm text-muted-foreground">Loading transactions...</p> : null}
                {transactions.map((transaction) => (
                  <div key={transaction.id} className="rounded-2xl border border-border/70 p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-medium">{transaction.description}</p>
                        <p className="text-muted-foreground">{transaction.accountName} · {new Date(transaction.journalDate).toLocaleDateString('en-GB')}</p>
                      </div>
                      <p className="font-semibold">{money(transaction.amountPence)}</p>
                    </div>
                  </div>
                ))}
                {!isPending && transactions.length === 0 ? <p className="text-sm text-muted-foreground">No transactions available for this fund.</p> : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
