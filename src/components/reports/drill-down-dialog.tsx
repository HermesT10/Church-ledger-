'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { getDrillDownTransactions } from '@/lib/reports/actions';
import type { DrillDownTransaction } from '@/lib/reports/actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

function p(pence: number): string {
  return (pence / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  });
}

export interface DrillDownParams {
  organisationId: string;
  accountId?: string | null;
  accountName?: string;
  startDate: string;
  endDate: string;
  fundId?: string | null;
  fundName?: string;
  title?: string;
}

interface Props {
  params: DrillDownParams | null;
  onClose: () => void;
}

const PAGE_SIZE = 25;

export function DrillDownDialog({ params, onClose }: Props) {
  const [transactions, setTransactions] = useState<DrillDownTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(
    async (p: number) => {
      if (!params) return;
      setLoading(true);
      try {
        const { data, total: t } = await getDrillDownTransactions({
          organisationId: params.organisationId,
          accountId: params.accountId,
          startDate: params.startDate,
          endDate: params.endDate,
          fundId: params.fundId,
          page: p,
          pageSize: PAGE_SIZE,
        });
        setTransactions(data);
        setTotal(t);
      } finally {
        setLoading(false);
      }
    },
    [params],
  );

  useEffect(() => {
    if (params) {
      setPage(1);
      fetchData(1);
    }
  }, [params, fetchData]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchData(newPage);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Dialog open={!!params} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {params?.title ?? `Transactions: ${params?.accountName ?? params?.fundName ?? 'Drill-down'}`}
          </DialogTitle>
          {params && (
            <p className="text-sm text-muted-foreground">
              {params.startDate} to {params.endDate}
              {total > 0 && ` — ${total} transaction${total !== 1 ? 's' : ''}`}
            </p>
          )}
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && transactions.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No transactions found for this period.
          </p>
        )}

        {!loading && transactions.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Fund</TableHead>
                  <TableHead className="w-28 text-right">Debit</TableHead>
                  <TableHead className="w-28 text-right">Credit</TableHead>
                  <TableHead className="w-28 text-right">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn, idx) => (
                  <TableRow key={`${txn.journalId}-${idx}`}>
                    <TableCell className="font-mono text-xs">
                      {txn.journalDate}
                    </TableCell>
                    <TableCell className="text-sm">
                      {txn.description || txn.memo || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {txn.accountName ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {txn.fundName ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {txn.debitPence > 0 ? p(txn.debitPence) : ''}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {txn.creditPence > 0 ? p(txn.creditPence) : ''}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/journals/${txn.journalId}`}>Journal</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-1 pt-3">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
