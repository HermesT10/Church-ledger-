'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPaymentRun } from '@/lib/bills/actions';
import { toast } from 'sonner';
import { Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Bill {
  id: string;
  bill_number: string | null;
  bill_date: string;
  total_pence: number;
  supplier_name: string;
}

interface BankAccount {
  id: string;
  name: string;
}

interface Props {
  orgId: string;
  bills: Bill[];
  bankAccounts: BankAccount[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPounds(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function NewPaymentRunClient({ orgId, bills, bankAccounts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = bills.length > 0 && selected.size === bills.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(bills.map((b) => b.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const { selectedCount, selectedTotal } = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const b of bills) {
      if (selected.has(b.id)) {
        total += b.total_pence;
        count++;
      }
    }
    return { selectedCount: count, selectedTotal: total };
  }, [bills, selected]);

  const handleCreate = () => {
    if (selected.size === 0) {
      toast.error('Select at least one bill.');
      return;
    }

    startTransition(async () => {
      const { data, error } = await createPaymentRun(orgId, Array.from(selected));
      if (error) {
        toast.error(error);
        return;
      }
      if (data) {
        toast.success('Payment run created.');
        router.push(`/payment-runs/${data.id}`);
      }
    });
  };

  if (bills.length === 0) {
    return (
      <Card className="app-empty-state">
        <CardContent className="py-12 text-center">
          <Banknote className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No posted bills available for payment. Post bills first from the Bills page.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="app-surface">
      <CardHeader>
        <CardTitle>Select Bills for Payment</CardTitle>
        <CardDescription>
          Choose which posted bills to include in this payment run. The bank account will be selected when posting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bills table with checkboxes */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </TableHead>
                <TableHead>Bill #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((b) => (
                <TableRow
                  key={b.id}
                  className={selected.has(b.id) ? 'bg-muted/50' : ''}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(b.id)}
                      onChange={() => toggleOne(b.id)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {b.bill_number || b.id.slice(0, 8)}
                  </TableCell>
                  <TableCell>{b.supplier_name}</TableCell>
                  <TableCell>{formatDate(b.bill_date)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPounds(b.total_pence)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Summary + action */}
        <div className="app-toolbar items-start justify-between border-t border-border/70 pt-4 sm:items-end">
          <div>
            <p className="text-sm text-muted-foreground">
              {selectedCount} bill{selectedCount !== 1 ? 's' : ''} selected
            </p>
            <p className="text-2xl font-bold">{formatPounds(selectedTotal)}</p>
          </div>
          <Button
            onClick={handleCreate}
            disabled={isPending || selected.size === 0}
          >
            {isPending ? 'Creating…' : 'Create Payment Run'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
