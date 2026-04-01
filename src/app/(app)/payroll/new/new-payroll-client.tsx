'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  CalendarDays,
  Calculator,
  Layers,
  Eye,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { createPayrollRun } from '@/lib/payroll/actions';
import {
  computeGross,
  validatePayrollInputs,
  buildPayrollJournalLines,
} from '@/lib/payroll/validation';
import type { PayrollSplit, PayrollAccountIds } from '@/lib/payroll/validation';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface EmployeeOption {
  id: string;
  full_name: string;
}

interface Props {
  funds: { id: string; name: string }[];
  employees?: EmployeeOption[];
  accountsConfigured: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatPounds(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

function poundsToPence(pounds: string): number {
  const n = parseFloat(pounds || '0');
  return Math.round(n * 100);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function NewPayrollClient({ funds, employees = [], accountsConfigured }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Step state
  const [step, setStep] = useState(1);

  // Step 1: Month selection
  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); // 0-indexed
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Step 2: Totals
  const [netPay, setNetPay] = useState('');
  const [paye, setPaye] = useState('');
  const [nic, setNic] = useState('');
  const [pension, setPension] = useState('');
  const [grossOverride, setGrossOverride] = useState('');

  // Step 3: Fund splits
  const [enableSplits, setEnableSplits] = useState(false);
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>({});

  // Computed values
  const netPence = poundsToPence(netPay);
  const payePence = poundsToPence(paye);
  const nicPence = poundsToPence(nic);
  const pensionPence = poundsToPence(pension);
  const grossOverridePence = poundsToPence(grossOverride);
  const computedGross = computeGross(netPence, payePence);
  const effectiveGross =
    grossOverridePence > 0 ? grossOverridePence : computedGross;

  // Splits
  const splits: PayrollSplit[] = useMemo(() => {
    if (!enableSplits) return [];
    return Object.entries(splitAmounts)
      .filter(([, v]) => poundsToPence(v) > 0)
      .map(([fundId, v]) => ({
        fundId,
        amountPence: poundsToPence(v),
      }));
  }, [enableSplits, splitAmounts]);

  const splitsTotal = splits.reduce((sum, s) => sum + s.amountPence, 0);
  const remaining = effectiveGross - splitsTotal;

  // Validation
  const validation = useMemo(
    () =>
      validatePayrollInputs(
        {
          netPence,
          payePence,
          nicPence,
          pensionPence,
          grossPence: effectiveGross,
        },
        enableSplits && splits.length > 0 ? splits : undefined,
      ),
    [netPence, payePence, nicPence, pensionPence, effectiveGross, enableSplits, splits],
  );

  // Preview journal lines (using placeholder account IDs for display)
  const previewLines = useMemo(() => {
    if (!validation.valid && step === 4) return [];
    const placeholderIds: PayrollAccountIds = {
      salariesAccountId: 'salaries',
      erNicAccountId: 'er-nic',
      pensionAccountId: 'pension-exp',
      payeNicLiabilityId: 'paye-nic-lia',
      pensionLiabilityId: 'pension-lia',
      netPayLiabilityId: 'net-pay-lia',
    };
    try {
      return buildPayrollJournalLines({
        grossPence: effectiveGross,
        netPence,
        payePence,
        nicPence,
        pensionPence,
        splits: enableSplits && splits.length > 0 ? splits : undefined,
        accountIds: placeholderIds,
      });
    } catch {
      return [];
    }
  }, [effectiveGross, netPence, payePence, nicPence, pensionPence, enableSplits, splits, validation.valid, step]);

  const accountLabels: Record<string, string> = {
    salaries: 'Salaries Expense',
    'er-nic': 'Employer NIC Expense',
    'pension-exp': 'Pension Expense',
    'paye-nic-lia': 'PAYE/NIC Liability',
    'pension-lia': 'Pension Liability',
    'net-pay-lia': 'Net Pay Liability',
  };

  const fundNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of funds) m.set(f.id, f.name);
    return m;
  }, [funds]);

  const totalDebits = previewLines.reduce((s, l) => s + l.debitPence, 0);
  const totalCredits = previewLines.reduce((s, l) => s + l.creditPence, 0);

  // Payroll month as 'YYYY-MM-DD' (first day of month)
  const payrollMonthDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;

  /* ------------------------------------------------------------------ */
  /*  Handlers                                                          */
  /* ------------------------------------------------------------------ */

  function canAdvance(): boolean {
    switch (step) {
      case 1:
        return true;
      case 2:
        return netPence > 0 && payePence >= 0 && nicPence >= 0 && pensionPence >= 0;
      case 3:
        if (!enableSplits) return true;
        return splits.length > 0 && remaining === 0;
      case 4:
        return validation.valid;
      default:
        return false;
    }
  }

  function handleNext() {
    if (step < 4) setStep(step + 1);
  }

  function handleBack() {
    if (step > 1) setStep(step - 1);
  }

  function handleCreate() {
    startTransition(async () => {
      const result = await createPayrollRun({
        payrollMonth: payrollMonthDate,
        netPence,
        payePence,
        nicPence,
        pensionPence,
        grossPence: effectiveGross,
        splits: enableSplits && splits.length > 0 ? splits : undefined,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success('Payroll run created');
      router.push(`/payroll/${result.id}`);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Render                                                            */
  /* ------------------------------------------------------------------ */

  // Warning if payroll accounts not configured
  if (!accountsConfigured) {
    return (
      <Card className="app-surface">
        <CardContent className="p-6 text-center space-y-4">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <p className="text-sm text-muted-foreground">
            Payroll accounts must be configured before creating payroll runs.
          </p>
          <Button asChild variant="outline">
            <Link href="/settings">Go to Settings</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="app-step-bar text-sm">
        {[
          { num: 1, label: 'Month', icon: CalendarDays },
          { num: 2, label: 'Totals', icon: Calculator },
          { num: 3, label: 'Splits', icon: Layers },
          { num: 4, label: 'Review', icon: Eye },
        ].map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-px w-6 ${step >= s.num ? 'bg-primary/70' : 'bg-slate-200'}`}
              />
            )}
            <button
              onClick={() => s.num < step && setStep(s.num)}
              className={`app-step-pill ${
                step === s.num
                  ? 'app-step-pill-active'
                  : step > s.num
                    ? 'app-step-pill-complete cursor-pointer'
                    : 'app-step-pill-upcoming'
              }`}
              disabled={s.num > step}
            >
              <s.icon size={14} />
              {s.label}
            </button>
          </div>
        ))}
      </div>

      {/* Step 1: Select Month */}
      {step === 1 && (
        <Card className="app-surface">
          <CardHeader className="p-6 pb-0">
            <CardTitle className="text-base">Select Payroll Month</CardTitle>
            <CardDescription>
              Choose the month and year for this payroll run.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Month</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Year</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map(
                    (y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Payroll for:{' '}
              <span className="font-medium text-foreground">
                {MONTHS[selectedMonth]} {selectedYear}
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Enter Totals */}
      {step === 2 && (
        <Card className="app-surface">
          <CardHeader className="p-6 pb-0">
            <CardTitle className="text-base">Enter Payroll Totals</CardTitle>
            <CardDescription>
              Enter the payroll figures in pounds. Gross is auto-calculated as Net + PAYE.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Net Pay (£)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={netPay}
                  onChange={(e) => setNetPay(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Total take-home pay for all employees.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>PAYE (£)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={paye}
                  onChange={(e) => setPaye(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Income tax deducted at source.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Employer NIC (£)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={nic}
                  onChange={(e) => setNic(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Employer&apos;s National Insurance contribution.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Employer Pension (£)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={pension}
                  onChange={(e) => setPension(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Employer&apos;s pension contribution.
                </p>
              </div>
            </div>

            {/* Optional gross override */}
            <div className="space-y-1.5">
              <Label>Gross Override (£) — optional</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Leave blank to auto-compute"
                value={grossOverride}
                onChange={(e) => setGrossOverride(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                If blank, gross = net + PAYE = {formatPounds(computedGross)}.
              </p>
            </div>

            {/* Summary */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross (Net + PAYE)</span>
                <span className="font-medium">{formatPounds(effectiveGross)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">+ Employer NIC</span>
                <span className="font-medium">{formatPounds(nicPence)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">+ Employer Pension</span>
                <span className="font-medium">{formatPounds(pensionPence)}</span>
              </div>
              <div className="border-t pt-1 flex justify-between font-semibold">
                <span>Total Cost to Church</span>
                <span>
                  {formatPounds(effectiveGross + nicPence + pensionPence)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Fund Splits */}
      {step === 3 && (
        <Card className="app-surface">
          <CardHeader className="p-6 pb-0">
            <CardTitle className="text-base">Fund Splits (Optional)</CardTitle>
            <CardDescription>
              Split the gross salary expense across funds. If disabled, all expense
              lines will be untagged.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-4 space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={enableSplits}
                onCheckedChange={setEnableSplits}
              />
              <Label>Enable fund splits</Label>
            </div>

            {enableSplits && (
              <>
                <p className="text-sm text-muted-foreground">
                  Gross to allocate:{' '}
                  <span className="font-medium text-foreground">
                    {formatPounds(effectiveGross)}
                  </span>
                </p>

                {funds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active funds found. Create funds first.
                  </p>
                ) : (
                  <>
                    <div className="space-y-3">
                      {funds.map((fund) => (
                        <div
                          key={fund.id}
                          className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2"
                        >
                          <span className="text-sm min-w-[140px]">
                            {fund.name}
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className="max-w-[160px]"
                            value={splitAmounts[fund.id] ?? ''}
                            onChange={(e) =>
                              setSplitAmounts({
                                ...splitAmounts,
                                [fund.id]: e.target.value,
                              })
                            }
                          />
                          <span className="text-xs text-muted-foreground">£</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-sm">
                      <span>
                        Allocated: {formatPounds(splitsTotal)} / Remaining:{' '}
                        <span
                          className={
                            remaining === 0
                              ? 'text-emerald-600 font-medium'
                              : remaining < 0
                                ? 'text-destructive font-medium'
                                : 'text-amber-600 font-medium'
                          }
                        >
                          {formatPounds(remaining)}
                        </span>
                      </span>
                      {remaining === 0 && (
                        <Badge variant="secondary" className="text-xs">
                          Fully allocated
                        </Badge>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <>
          <Card className="app-surface">
            <CardHeader className="p-6 pb-0">
              <CardTitle className="text-base">Review &amp; Create</CardTitle>
              <CardDescription>
                Review the payroll run details and journal preview before creating.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-4 space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Month</p>
                  <p className="font-medium">
                    {MONTHS[selectedMonth]} {selectedYear}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Gross</p>
                  <p className="font-medium">{formatPounds(effectiveGross)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Net Pay</p>
                  <p className="font-medium">{formatPounds(netPence)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">PAYE</p>
                  <p className="font-medium">{formatPounds(payePence)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Employer NIC</p>
                  <p className="font-medium">{formatPounds(nicPence)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Employer Pension</p>
                  <p className="font-medium">{formatPounds(pensionPence)}</p>
                </div>
              </div>

              {/* Fund splits */}
              {enableSplits && splits.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Fund Splits</p>
                  <div className="app-table-shell">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fund</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {splits.map((s) => (
                          <TableRow key={s.fundId}>
                            <TableCell>
                              {s.fundId
                                ? fundNames.get(s.fundId) ?? s.fundId
                                : 'Untagged'}
                            </TableCell>
                            <TableCell className="text-right app-table-amount-positive">
                              {formatPounds(s.amountPence)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Journal preview */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Journal Preview</p>
                <div className="app-table-shell">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Fund</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewLines.map((line, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">
                            {accountLabels[line.accountId] ?? line.accountId}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {line.fundId
                              ? fundNames.get(line.fundId) ?? line.fundId
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm app-table-amount-positive">
                            {line.debitPence > 0
                              ? formatPounds(line.debitPence)
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm app-table-amount-negative">
                            {line.creditPence > 0
                              ? formatPounds(line.creditPence)
                              : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Totals row */}
                      <TableRow className="border-t-2 font-semibold">
                        <TableCell colSpan={2}>Total</TableCell>
                        <TableCell className="text-right">
                          {formatPounds(totalDebits)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPounds(totalCredits)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {totalDebits === totalCredits ? (
                  <p className="text-xs text-emerald-600 font-medium">
                    Journal is balanced.
                  </p>
                ) : (
                  <p className="text-xs text-destructive font-medium">
                    Journal is NOT balanced — check your inputs.
                  </p>
                )}
              </div>

              {/* Validation errors */}
              {!validation.valid && (
                <div className="space-y-1 rounded-xl border border-rose-200/70 bg-rose-50/70 p-3">
                  {validation.errors.map((err, i) => (
                    <p key={i} className="text-sm text-destructive">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <div>
          {step > 1 && (
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {step < 4 ? (
            <Button onClick={handleNext} disabled={!canAdvance()}>
              Next
              <ArrowRight size={16} className="ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={!validation.valid || isPending}
            >
              {isPending ? 'Creating...' : 'Create Draft'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
