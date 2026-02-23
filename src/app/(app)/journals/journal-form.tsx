'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  createJournal,
  updateJournal,
  approveJournal,
  postJournal,
  deleteJournal,
} from './actions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Account {
  id: string;
  code: string;
  name: string;
}

interface Fund {
  id: string;
  name: string;
}

interface JournalHeader {
  id: string;
  journal_date: string;
  reference: string | null;
  memo: string | null;
  status: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface JournalLine {
  id: string;
  account_id: string;
  fund_id: string | null;
  supplier_id?: string | null;
  description: string | null;
  debit_pence: number;
  credit_pence: number;
}

interface LineDraft {
  key: string;
  account_id: string;
  fund_id: string;
  supplier_id: string;
  description: string;
  debit: string;
  credit: string;
}

export interface JournalFormProps {
  accounts: Account[];
  funds: Fund[];
  suppliers?: Supplier[];
  journal?: JournalHeader;
  lines?: JournalLine[];
  canEdit: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function penceToPounds(pence: number): string {
  if (pence === 0) return '';
  return (pence / 100).toFixed(2);
}

function parsePounds(value: string): number {
  const n = parseFloat(value || '0');
  return isNaN(n) ? 0 : Math.round(n * 100);
}

let nextKey = 0;
function newKey(): string {
  return `line-${++nextKey}-${Date.now()}`;
}

function emptyLine(): LineDraft {
  return {
    key: newKey(),
    account_id: '',
    fund_id: '',
    supplier_id: '',
    description: '',
    debit: '',
    credit: '',
  };
}

/* ------------------------------------------------------------------ */
/*  Line-level validation                                              */
/* ------------------------------------------------------------------ */

interface LineWarning {
  key: string;
  message: string;
}

function getLineWarnings(lines: LineDraft[]): LineWarning[] {
  const warnings: LineWarning[] = [];

  for (const l of lines) {
    const d = parsePounds(l.debit);
    const c = parsePounds(l.credit);

    if (d > 0 && c > 0) {
      warnings.push({ key: l.key, message: 'Both debit and credit set. Only one side per line.' });
    }

    if ((d > 0 || c > 0) && !l.account_id) {
      warnings.push({ key: l.key, message: 'Account is required.' });
    }

    if ((d > 0 || c > 0) && !l.fund_id) {
      warnings.push({ key: l.key, message: 'Fund is required.' });
    }
  }

  return warnings;
}

/* ------------------------------------------------------------------ */
/*  Inner form                                                         */
/* ------------------------------------------------------------------ */

function InnerForm({ accounts, funds, suppliers = [], journal, lines, canEdit }: JournalFormProps) {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const isEdit = !!journal;
  const isDraft = !journal || journal.status === 'draft';

  const [lineDrafts, setLineDrafts] = useState<LineDraft[]>(() => {
    if (lines && lines.length > 0) {
      return lines.map((l) => ({
        key: newKey(),
        account_id: l.account_id,
        fund_id: l.fund_id ?? '',
        supplier_id: l.supplier_id ?? '',
        description: l.description ?? '',
        debit: penceToPounds(l.debit_pence),
        credit: penceToPounds(l.credit_pence),
      }));
    }
    return [emptyLine(), emptyLine()];
  });

  const addLine = useCallback(() => {
    setLineDrafts((prev) => [...prev, emptyLine()]);
  }, []);

  const removeLine = useCallback((key: string) => {
    setLineDrafts((prev) => (prev.length > 2 ? prev.filter((l) => l.key !== key) : prev));
  }, []);

  const updateLine = useCallback(
    (key: string, field: keyof LineDraft, value: string) => {
      setLineDrafts((prev) =>
        prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)),
      );
    },
    [],
  );

  // Running totals & validation
  const { totalDebit, totalCredit, difference, isBalanced, lineWarnings, canSave } = useMemo(() => {
    let d = 0;
    let c = 0;
    let hasZeroLine = false;
    let hasMissingAccount = false;
    let hasMissingFund = false;

    for (const l of lineDrafts) {
      const ld = parsePounds(l.debit);
      const lc = parsePounds(l.credit);
      d += ld;
      c += lc;
      if (ld === 0 && lc === 0) hasZeroLine = true;
      if (!l.account_id && (ld > 0 || lc > 0)) hasMissingAccount = true;
      if (!l.fund_id && (ld > 0 || lc > 0)) hasMissingFund = true;
    }

    const warnings = getLineWarnings(lineDrafts);
    const balanced = d === c && d > 0 && lineDrafts.length >= 2;
    const diff = Math.abs(d - c);

    const saveable =
      balanced &&
      !hasZeroLine &&
      !hasMissingAccount &&
      !hasMissingFund &&
      warnings.length === 0;

    return {
      totalDebit: d,
      totalCredit: c,
      difference: diff,
      isBalanced: balanced,
      lineWarnings: warnings,
      canSave: saveable,
    };
  }, [lineDrafts]);

  // Serialise lines as JSON for the hidden input
  const linesJson = JSON.stringify(
    lineDrafts.map(({ account_id, fund_id, supplier_id, description, debit, credit }) => ({
      account_id,
      fund_id: fund_id || null,
      supplier_id: supplier_id || null,
      description,
      debit,
      credit,
    })),
  );

  const formAction = isEdit ? updateJournal : createJournal;

  // Map warnings by line key for inline display
  const warningsByKey = new Map<string, string[]>();
  for (const w of lineWarnings) {
    const existing = warningsByKey.get(w.key) ?? [];
    existing.push(w.message);
    warningsByKey.set(w.key, existing);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEdit
            ? isDraft
              ? 'Edit Journal'
              : `Journal (${journal!.status})`
            : 'New Journal'}
        </CardTitle>
        <CardDescription>
          {!canEdit
            ? 'This journal is read-only.'
            : isEdit && !isDraft
              ? 'This journal can no longer be edited.'
              : isEdit
                ? 'Edit the journal header and lines below.'
                : 'Create a new double-entry journal with at least two balanced lines.'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!isDraft && journal && (
          <div className="mb-4 rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
            Status: <strong className="capitalize">{journal.status}</strong>
            {journal.status === 'posted' && ' — this journal has been posted to the ledger.'}
          </div>
        )}

        <form className="flex flex-col gap-6">
          {isEdit && <input type="hidden" name="id" value={journal!.id} />}
          <input type="hidden" name="lines" value={linesJson} />

          {/* Header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="journal_date">
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="journal_date"
                name="journal_date"
                type="date"
                required
                defaultValue={journal?.journal_date ?? ''}
                disabled={!canEdit || !isDraft}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="reference">Reference</Label>
              <Input
                id="reference"
                name="reference"
                type="text"
                defaultValue={journal?.reference ?? ''}
                disabled={!canEdit || !isDraft}
                placeholder="e.g. JNL-001"
              />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-1">
              <Label htmlFor="memo">Description</Label>
              <Textarea
                id="memo"
                name="memo"
                rows={2}
                defaultValue={journal?.memo ?? ''}
                disabled={!canEdit || !isDraft}
                placeholder="e.g. Reallocation of youth expenses between funds"
              />
            </div>
          </div>

          {/* Line editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">
                Journal Lines <span className="text-destructive">*</span>
              </Label>
              {canEdit && isDraft && (
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  + Add Line
                </Button>
              )}
            </div>

            {/* Column headers */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_0.8fr_1fr_100px_100px_36px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>
                Account <span className="text-destructive">*</span>
              </span>
              <span>
                Fund <span className="text-destructive">*</span>
              </span>
              <span>Supplier</span>
              <span>Description</span>
              <span className="text-right">Debit (£)</span>
              <span className="text-right">Credit (£)</span>
              <span />
            </div>

            {lineDrafts.map((line, idx) => {
              const lineW = warningsByKey.get(line.key);
              const d = parsePounds(line.debit);
              const c = parsePounds(line.credit);
              const isZero = d === 0 && c === 0;
              const hasBothSides = d > 0 && c > 0;
              const rowBorder = hasBothSides
                ? 'border-red-300 bg-red-100/75'
                : isZero && (line.account_id || line.fund_id)
                  ? 'border-amber-300 bg-amber-100/75'
                  : 'border-border';

              return (
                <div key={line.key} className="space-y-1">
                  <div
                    className={`grid grid-cols-1 sm:grid-cols-[1fr_1fr_0.8fr_1fr_100px_100px_36px] gap-2 items-start border rounded-md p-2 sm:p-1.5 ${rowBorder}`}
                  >
                    {/* Account */}
                    <select
                      value={line.account_id}
                      onChange={(e) => updateLine(line.key, 'account_id', e.target.value)}
                      disabled={!canEdit || !isDraft}
                      required
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Select account…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} – {a.name}
                        </option>
                      ))}
                    </select>

                    {/* Fund (required) */}
                    <select
                      value={line.fund_id}
                      onChange={(e) => updateLine(line.key, 'fund_id', e.target.value)}
                      disabled={!canEdit || !isDraft}
                      required
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Select fund…</option>
                      {funds.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>

                    {/* Supplier (optional) */}
                    <select
                      value={line.supplier_id}
                      onChange={(e) => updateLine(line.key, 'supplier_id', e.target.value)}
                      disabled={!canEdit || !isDraft}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">No supplier</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>

                    {/* Description */}
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                      disabled={!canEdit || !isDraft}
                      placeholder="Description"
                      className="text-sm"
                    />

                    {/* Debit */}
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.debit}
                      onChange={(e) => {
                        updateLine(line.key, 'debit', e.target.value);
                        if (e.target.value && parsePounds(e.target.value) > 0) {
                          updateLine(line.key, 'credit', '');
                        }
                      }}
                      disabled={!canEdit || !isDraft}
                      placeholder="0.00"
                      className="text-right text-sm"
                    />

                    {/* Credit */}
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.credit}
                      onChange={(e) => {
                        updateLine(line.key, 'credit', e.target.value);
                        if (e.target.value && parsePounds(e.target.value) > 0) {
                          updateLine(line.key, 'debit', '');
                        }
                      }}
                      disabled={!canEdit || !isDraft}
                      placeholder="0.00"
                      className="text-right text-sm"
                    />

                    {/* Remove */}
                    {canEdit && isDraft && (
                      <button
                        type="button"
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30"
                        onClick={() => removeLine(line.key)}
                        disabled={lineDrafts.length <= 2}
                        title={`Remove line ${idx + 1}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* Inline warnings */}
                  {lineW && lineW.length > 0 && (
                    <div className="ml-1 flex flex-col gap-0.5">
                      {lineW.map((msg, wi) => (
                        <span key={wi} className="text-xs text-red-600 flex items-center gap-1">
                          <AlertTriangle size={12} />
                          {msg}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Totals row */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_0.8fr_1fr_100px_100px_36px] gap-2 px-1.5 pt-3 border-t text-sm font-semibold">
              <span className="sm:col-span-4 text-right">Totals</span>
              <span className="text-right font-mono">{(totalDebit / 100).toFixed(2)}</span>
              <span className="text-right font-mono">{(totalCredit / 100).toFixed(2)}</span>
              <span />
            </div>

            {/* Balance indicator */}
            <div className="px-1.5 flex items-center gap-2">
              {totalDebit === 0 && totalCredit === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Enter amounts to see balance status.
                </span>
              ) : isBalanced ? (
                <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                  <CheckCircle2 size={14} />
                  Balanced — {(totalDebit / 100).toFixed(2)}
                </span>
              ) : (
                <span className="text-xs font-medium text-red-600 flex items-center gap-1">
                  <AlertTriangle size={14} />
                  Unbalanced — difference: £{(difference / 100).toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {canEdit && isDraft && (
            <div className="flex gap-2 flex-wrap pt-2">
              <Button formAction={formAction} disabled={!canSave}>
                {isEdit ? 'Save Changes' : 'Create Journal'}
              </Button>
              {isEdit && (
                <>
                  <Button formAction={approveJournal} variant="secondary" disabled={!canSave}>
                    Approve
                  </Button>
                  <Button formAction={postJournal} variant="secondary" disabled={!canSave}>
                    Post
                  </Button>
                  <Button formAction={deleteJournal} variant="outline">
                    Delete
                  </Button>
                </>
              )}
              <Button asChild variant="outline">
                <Link href="/journals">Cancel</Link>
              </Button>
            </div>
          )}

          {/* Validation summary */}
          {canEdit && isDraft && !canSave && (totalDebit > 0 || totalCredit > 0) && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-1">
              <p className="font-medium flex items-center gap-1.5">
                <AlertTriangle size={14} />
                Cannot save — please fix the following:
              </p>
              <ul className="list-disc list-inside text-xs space-y-0.5">
                {!isBalanced && <li>Total debits must equal total credits</li>}
                {lineDrafts.some((l) => {
                  const ld = parsePounds(l.debit);
                  const lc = parsePounds(l.credit);
                  return ld === 0 && lc === 0;
                }) && <li>Remove or fill zero-value lines</li>}
                {lineDrafts.some((l) => {
                  const ld = parsePounds(l.debit);
                  const lc = parsePounds(l.credit);
                  return (ld > 0 || lc > 0) && !l.account_id;
                }) && <li>Every line with an amount needs an account</li>}
                {lineDrafts.some((l) => {
                  const ld = parsePounds(l.debit);
                  const lc = parsePounds(l.credit);
                  return (ld > 0 || lc > 0) && !l.fund_id;
                }) && <li>Every line with an amount needs a fund</li>}
                {lineWarnings.length > 0 && <li>Fix line-level warnings above</li>}
              </ul>
            </div>
          )}

          {(!canEdit || !isDraft) && (
            <Button asChild variant="outline" className="self-start">
              <Link href="/journals">Back to Journals</Link>
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Exported wrapper with Suspense boundary                            */
/* ------------------------------------------------------------------ */

export function JournalForm(props: JournalFormProps) {
  return (
    <Suspense>
      <InnerForm {...props} />
    </Suspense>
  );
}
