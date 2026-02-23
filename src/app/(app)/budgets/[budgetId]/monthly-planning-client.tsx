'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  approveBudget,
  archiveBudget,
  createNewVersion,
  addBudgetItem,
  deleteBudgetItem,
  saveBudgetGrid,
} from '@/lib/budgets/actions';
import {
  VARIANCE_COLORS,
  VARIANCE_LABELS,
  MONTH_LABELS,
  type BudgetRow,
  type MonthlyPlanningData,
  type MonthlyPlanningSection,
  type MonthlyPlanningRow,
  type FundRef,
  type AccountRef,
  type GridUpdate,
} from '@/lib/budgets/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CheckCircle,
  Archive,
  Plus,
  Trash2,
  Copy,
  Lock,
  ArrowUpDown,
} from 'lucide-react';

function fmt(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

function fmtVariance(pence: number): string {
  const prefix = pence >= 0 ? '+' : '';
  return prefix + '£' + (pence / 100).toFixed(2);
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

interface Props {
  budget: BudgetRow;
  planningData: MonthlyPlanningData | null;
  month: number;
  fundId: string | null;
  funds: FundRef[];
  accounts: AccountRef[];
  canEdit: boolean;
}

export function MonthlyPlanningClient({
  budget,
  planningData,
  month,
  fundId,
  funds,
  accounts,
  canEdit,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [addType, setAddType] = useState<'income' | 'expense' | null>(null);
  const [addAccountId, setAddAccountId] = useState('');
  const [addFundId, setAddFundId] = useState(fundId ?? '');
  const [addAmount, setAddAmount] = useState('');

  // Inline editing state
  const [editedCells, setEditedCells] = useState<Record<string, number>>({});

  const isDraft = budget.status === 'draft';
  const isApproved = budget.status === 'approved';

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params: Record<string, string> = {};
    if (month) params.month = String(month);
    if (fundId) params.fund = fundId;
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== undefined) params[k] = v;
      else delete params[k];
    }
    const qs = new URLSearchParams(params).toString();
    return `/budgets/${budget.id}${qs ? '?' + qs : ''}`;
  }

  /* ---- Actions ---- */

  async function handleApprove() {
    setLoading(true);
    const { error } = await approveBudget(budget.id);
    setLoading(false);
    if (error) toast.error(error);
    else {
      toast.success('Budget approved and locked.');
      router.refresh();
    }
  }

  async function handleArchive() {
    setLoading(true);
    const { error } = await archiveBudget(budget.id);
    setLoading(false);
    if (error) toast.error(error);
    else {
      toast.success('Budget archived.');
      router.refresh();
    }
  }

  async function handleNewVersion() {
    setLoading(true);
    const { data, error } = await createNewVersion(budget.id);
    setLoading(false);
    if (error) toast.error(error);
    else if (data) {
      toast.success(`New draft v${data.version_number} created.`);
      router.push(`/budgets/${data.id}`);
    }
  }

  async function handleAddItem() {
    if (!addAccountId || !addAmount) return;
    setLoading(true);
    const amountPence = Math.round(parseFloat(addAmount) * 100);
    const { error } = await addBudgetItem({
      budgetId: budget.id,
      accountId: addAccountId,
      fundId: addFundId || null,
      monthlyAmountPence: amountPence,
    });
    setLoading(false);
    if (error) toast.error(error);
    else {
      toast.success('Budget item added.');
      setAddType(null);
      setAddAccountId('');
      setAddAmount('');
      router.refresh();
    }
  }

  async function handleDeleteItem(accountId: string, rowFundId: string | null) {
    setLoading(true);
    const { error } = await deleteBudgetItem({
      budgetId: budget.id,
      accountId,
      fundId: rowFundId,
    });
    setLoading(false);
    if (error) toast.error(error);
    else {
      toast.success('Budget item removed.');
      router.refresh();
    }
  }

  function handleCellEdit(accountId: string, value: string) {
    const pence = Math.round(parseFloat(value || '0') * 100);
    setEditedCells((prev) => ({ ...prev, [accountId]: pence }));
  }

  async function handleSaveEdits() {
    const updates: GridUpdate[] = [];
    for (const [accountId, pence] of Object.entries(editedCells)) {
      updates.push({
        accountId,
        fundId: fundId,
        monthIndex: month,
        amountPence: pence,
      });
    }
    if (updates.length === 0) return;

    setLoading(true);
    const result = await saveBudgetGrid(budget.id, updates);
    setLoading(false);
    if (result.success) {
      toast.success('Changes saved.');
      setEditedCells({});
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to save.');
    }
  }

  const hasEdits = Object.keys(editedCells).length > 0;

  /* ---- Render ---- */

  const filteredAccounts = addType
    ? accounts.filter((a) => a.type === addType)
    : [];

  function renderSection(section: MonthlyPlanningSection) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold uppercase tracking-wide">
              {section.label}
            </CardTitle>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAddType(section.type);
                  setAddFundId(fundId ?? '');
                }}
              >
                <Plus size={14} className="mr-1" /> Add {section.type === 'income' ? 'Income' : 'Expense'} Item
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Account</TableHead>
                  <TableHead className="text-right min-w-[120px]">Planned</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actual</TableHead>
                  <TableHead className="text-right min-w-[120px]">Variance</TableHead>
                  <TableHead className="text-center min-w-[100px]">Status</TableHead>
                  {canEdit && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {section.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground py-6">
                      No {section.type} items budgeted for this month.
                    </TableCell>
                  </TableRow>
                ) : (
                  section.rows.map((row) => {
                    const editedValue = editedCells[row.accountId];
                    const displayPlanned = editedValue !== undefined ? editedValue : row.plannedPence;

                    return (
                      <TableRow key={row.accountId}>
                        <TableCell className="font-medium text-sm">
                          <Link
                            href={`/budgets/${budget.id}?month=${month}${fundId ? '&fund=' + fundId : ''}&drill=${row.accountId}`}
                            className="hover:underline"
                          >
                            {row.accountCode} — {row.accountName}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">
                          {canEdit ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-28 text-right text-sm h-8 ml-auto"
                              defaultValue={(row.plannedPence / 100).toFixed(2)}
                              onChange={(e) => handleCellEdit(row.accountId, e.target.value)}
                            />
                          ) : (
                            <span className="font-mono text-sm">{fmt(displayPlanned)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmt(row.actualPence)}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${row.variancePence < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {fmtVariance(row.variancePence)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={VARIANCE_COLORS[row.status]}>
                            {VARIANCE_LABELS[row.status]}
                          </Badge>
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 h-8 w-8 p-0"
                              onClick={() => handleDeleteItem(row.accountId, row.fundId)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}

                {/* Section totals */}
                {section.rows.length > 0 && (
                  <TableRow className="border-t-2 font-semibold bg-muted/30">
                    <TableCell>Total {section.label}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(section.totalPlanned)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(section.totalActual)}</TableCell>
                    <TableCell className={`text-right font-mono text-sm ${section.totalVariance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {fmtVariance(section.totalVariance)}
                    </TableCell>
                    <TableCell />
                    {canEdit && <TableCell />}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">
            {budget.name} — {budget.year}
          </h1>
          <div className="flex items-center gap-2">
            <Badge variant={isDraft ? 'outline' : isApproved ? 'default' : 'secondary'}>
              {budget.status}
            </Badge>
            <span className="text-xs text-muted-foreground">v{budget.version_number}</span>
            {isApproved && <Lock size={12} className="text-muted-foreground" />}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Month selector */}
          <select
            value={month}
            onChange={(e) => router.push(buildUrl({ month: e.target.value }))}
            className="flex h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            {MONTH_LABELS.map((label, idx) => (
              <option key={idx} value={idx + 1}>{label}</option>
            ))}
          </select>

          {/* Fund filter */}
          <select
            value={fundId ?? ''}
            onChange={(e) => router.push(buildUrl({ fund: e.target.value || undefined }))}
            className="flex h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            <option value="">All Funds</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          {/* Action buttons */}
          {canEdit && hasEdits && (
            <Button onClick={handleSaveEdits} disabled={loading} size="sm">
              {loading ? 'Saving…' : `Save Changes (${Object.keys(editedCells).length})`}
            </Button>
          )}

          {isDraft && canEdit && (
            <Button onClick={handleApprove} disabled={loading} size="sm" variant="default">
              <CheckCircle size={14} className="mr-1" /> Approve
            </Button>
          )}

          {isApproved && canEdit && (
            <>
              <Button onClick={handleNewVersion} disabled={loading} size="sm" variant="outline">
                <Copy size={14} className="mr-1" /> New Version
              </Button>
              <Button onClick={handleArchive} disabled={loading} size="sm" variant="secondary">
                <Archive size={14} className="mr-1" /> Archive
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Planning sections */}
      {planningData ? (
        <>
          {renderSection(planningData.income)}
          {renderSection(planningData.expense)}

          {/* Net Position */}
          <Card className="border-2">
            <CardContent className="pt-6">
              <div className="grid grid-cols-3 gap-6 text-center">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Net Planned (Surplus/Deficit)
                  </p>
                  <p className={`text-xl font-bold mt-1 ${planningData.netPlanned >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmt(planningData.netPlanned)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Net Actual (Surplus/Deficit)
                  </p>
                  <p className={`text-xl font-bold mt-1 ${planningData.netActual >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmt(planningData.netActual)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Net Variance
                  </p>
                  <p className={`text-xl font-bold mt-1 ${planningData.netVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmtVariance(planningData.netVariance)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <ArrowUpDown className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              No planning data available. Add income and expense items to get started.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add Item Dialog */}
      <Dialog open={addType !== null} onOpenChange={(open) => !open && setAddType(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add {addType === 'income' ? 'Income' : 'Expense'} Item
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Account</Label>
              <select
                className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
                value={addAccountId}
                onChange={(e) => setAddAccountId(e.target.value)}
              >
                <option value="">Select account…</option>
                {filteredAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Fund</Label>
              <select
                className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
                value={addFundId}
                onChange={(e) => setAddFundId(e.target.value)}
              >
                <option value="">General / No fund</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Monthly Planned Amount (£)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                This amount will be spread evenly across all 12 months.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddType(null)}>Cancel</Button>
              <Button onClick={handleAddItem} disabled={loading || !addAccountId || !addAmount}>
                {loading ? 'Adding…' : 'Add Item'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
