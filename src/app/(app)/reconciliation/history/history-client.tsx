'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Lock,
  Unlock,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import {
  getReconciliationHistory,
  undoReconciliation,
} from '@/lib/reconciliation/actions';
import type { ReconciliationWithMeta } from '@/lib/reconciliation/types';

interface Props {
  bankAccounts: { id: string; name: string }[];
  isAdmin: boolean;
}

function penceToPounds(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function ReconciliationHistoryClient({ bankAccounts, isAdmin }: Props) {
  const [selectedBankId, setSelectedBankId] = useState(bankAccounts[0]?.id ?? '');
  const [history, setHistory] = useState<ReconciliationWithMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadHistory = useCallback(
    (bankId: string) => {
      startTransition(async () => {
        const res = await getReconciliationHistory(bankId);
        setHistory(res.data);
        setLoaded(true);
      });
    },
    [],
  );

  useEffect(() => {
    if (selectedBankId) {
      loadHistory(selectedBankId);
    }
  }, [selectedBankId, loadHistory]);

  const handleUndo = useCallback(
    async (recId: string) => {
      if (!confirm('Are you sure? This will unlock the reconciliation and unreconcile all its bank lines.')) {
        return;
      }
      const res = await undoReconciliation(recId);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success('Reconciliation undone.');
        loadHistory(selectedBankId);
      }
    },
    [selectedBankId, loadHistory],
  );

  return (
    <div className="space-y-6">
      <div className="app-tab-bar">
        <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href="/reconciliation"
          className="app-tab-link"
        >
          Journal Matching
        </Link>
        <Link
          href="/reconciliation/statement"
          className="app-tab-link"
        >
          Statement Reconciliation
        </Link>
        <Link
          href="/reconciliation/clearing"
          className="app-tab-link"
        >
          Clearing Accounts
        </Link>
        <span className="app-tab-link-active">
          History
        </span>
        </div>
      </div>

      {/* Bank account selector */}
      <Card className="app-surface">
        <CardContent className="py-4">
          <div className="app-filter-bar gap-4">
            <label className="text-sm font-medium">Bank Account</label>
            <select
              value={selectedBankId}
              onChange={(e) => {
                setSelectedBankId(e.target.value);
                setLoaded(false);
              }}
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {bankAccounts.map((ba) => (
                <option key={ba.id} value={ba.id}>
                  {ba.name}
                </option>
              ))}
            </select>
            {isPending && (
              <span className="text-xs text-muted-foreground">Loading...</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* History table */}
      {loaded && (
        <Card className="app-surface">
          <CardHeader>
            <CardTitle>Past Reconciliations ({history.length})</CardTitle>
            <CardDescription>
              Each row is a completed or in-progress reconciliation session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                <p>No reconciliation sessions found for this account.</p>
              </div>
            ) : (
              <div className="app-table-shell">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Statement Date</TableHead>
                      <TableHead className="text-right">Opening</TableHead>
                      <TableHead className="text-right">Closing</TableHead>
                      <TableHead className="text-right">Cleared</TableHead>
                      <TableHead>Lines</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reconciled By</TableHead>
                      <TableHead>Reconciled At</TableHead>
                      {isAdmin && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((rec) => (
                      <TableRow key={rec.id}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {formatDate(rec.statement_date)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-500">
                          {penceToPounds(rec.opening_balance_pence)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-500">
                          {penceToPounds(rec.statement_closing_balance_pence)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-slate-500">
                          {rec.cleared_balance_pence != null
                            ? penceToPounds(rec.cleared_balance_pence)
                            : '—'}
                        </TableCell>
                        <TableCell>{rec.lines_cleared}</TableCell>
                        <TableCell>
                          {rec.locked ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200">
                              <Lock className="mr-1 h-3 w-3" />
                              Locked
                            </Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                              <Unlock className="mr-1 h-3 w-3" />
                              Draft
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {rec.reconciled_by_name ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {rec.reconciled_at
                            ? formatDate(rec.reconciled_at)
                            : '—'}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            {rec.locked && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => handleUndo(rec.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                Undo
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
