'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { listLettingsChargesForReconciliationSearch } from '@/lib/banking/reconciliation-workspace-actions';
import { createInvoiceAccountInline } from '@/lib/invoices/actions';
import type { BankReconciliationMatchSuggestion } from '@/lib/banking/reconciliation-matching';
import type { ReconciliationWorkspaceBankLine } from '@/lib/banking/reconciliation-workspace-actions.types';

type Option = { id: string; name: string };

export type LettingsSubmode = 'overview' | 'pick_charge' | 'create';

type Props = {
  selectedLine: ReconciliationWorkspaceBankLine;
  funds: Option[];
  /** Income accounts available for lettings (and any inline-created). */
  accounts: Option[];
  incomeStreams: Option[];
  lettingsSubmode: LettingsSubmode;
  setLettingsSubmode: (mode: LettingsSubmode) => void;
  lettingName: string;
  setLettingName: (v: string) => void;
  lettingChargeNotes: string;
  setLettingChargeNotes: (v: string) => void;
  lettingPeriodDate: string;
  setLettingPeriodDate: (v: string) => void;
  fundId: string;
  setFundId: (v: string) => void;
  accountId: string;
  setAccountId: (v: string) => void;
  incomeStreamId: string;
  setIncomeStreamId: (v: string) => void;
  /** Optional posting overrides when matching an existing charge (empty = use charge defaults). */
  overrideFundId: string;
  setOverrideFundId: (v: string) => void;
  overrideAccountId: string;
  setOverrideAccountId: (v: string) => void;
  overrideIncomeStreamId: string;
  setOverrideIncomeStreamId: (v: string) => void;
  onIncomeAccountCreated?: (account: Option) => void;
  lettingsSuggestionCount: number;
  lettingsPickedChargeId: string;
  setLettingsPickedChargeId: (v: string) => void;
  formatPounds: (pence: number | null | undefined) => string;
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function LettingsReconcilePanel({
  selectedLine,
  funds,
  accounts,
  incomeStreams,
  lettingsSubmode,
  setLettingsSubmode,
  lettingName,
  setLettingName,
  lettingChargeNotes,
  setLettingChargeNotes,
  lettingPeriodDate,
  setLettingPeriodDate,
  fundId,
  setFundId,
  accountId,
  setAccountId,
  incomeStreamId,
  setIncomeStreamId,
  overrideFundId,
  setOverrideFundId,
  overrideAccountId,
  setOverrideAccountId,
  overrideIncomeStreamId,
  setOverrideIncomeStreamId,
  onIncomeAccountCreated,
  lettingsSuggestionCount,
  lettingsPickedChargeId,
  setLettingsPickedChargeId,
  formatPounds,
}: Props) {
  const [pickQuery, setPickQuery] = useState('');
  const [debouncedPickQuery, setDebouncedPickQuery] = useState('');
  const [pickResults, setPickResults] = useState<BankReconciliationMatchSuggestion[]>([]);
  const [pickLoading, startPickTransition] = useTransition();
  const [inlineOpen, setInlineOpen] = useState(false);
  const [inlineName, setInlineName] = useState('');
  const [inlineSaving, startInlineTransition] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPickQuery(pickQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [pickQuery]);

  useEffect(() => {
    if (lettingsSubmode !== 'pick_charge') return;
    startPickTransition(async () => {
      const result = await listLettingsChargesForReconciliationSearch(selectedLine.id, debouncedPickQuery || null);
      if (result.error) toast.error(result.error);
      setPickResults(result.data);
    });
  }, [lettingsSubmode, selectedLine.id, debouncedPickQuery]);

  const showNoMatchHint = lettingsSuggestionCount === 0;

  function submitInlineAccount() {
    const name = inlineName.trim();
    if (!name) {
      toast.error('Account name is required.');
      return;
    }
    startInlineTransition(async () => {
      const res = await createInvoiceAccountInline({ name, type: 'income' });
      if (res.error || !res.data) {
        toast.error(res.error ?? 'Could not create account.');
        return;
      }
      const label = `${res.data.code} ${res.data.name}`;
      onIncomeAccountCreated?.({ id: res.data.id, name: label });
      setAccountId(res.data.id);
      toast.success('Income account created.');
      setInlineOpen(false);
      setInlineName('');
    });
  }

  return (
    <div className="space-y-4">
      {showNoMatchHint && lettingsSubmode === 'overview' ? (
        <p className="text-sm text-muted-foreground">
          No matching letting charge found. You can match an existing record or create a new letting from this payment.
        </p>
      ) : lettingsSubmode === 'overview' ? (
        <p className="text-sm text-muted-foreground">
          Use a suggested match above, or match an existing charge or create a new letting below.
        </p>
      ) : null}

      {lettingsSubmode === 'overview' ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setLettingsSubmode('pick_charge')}>
            Match existing
          </Button>
          <Button type="button" size="sm" onClick={() => setLettingsSubmode('create')}>
            Create new letting
          </Button>
        </div>
      ) : null}

      {lettingsSubmode === 'pick_charge' ? (
        <div className="space-y-3 rounded-xl border border-border/70 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="lettings-pick-search">Search charges</Label>
              <Input
                id="lettings-pick-search"
                value={pickQuery}
                onChange={(e) => setPickQuery(e.target.value)}
                placeholder="Hirer name or reference"
              />
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLettingsSubmode('overview')}>
              Back
            </Button>
          </div>
          {pickLoading && <p className="text-xs text-muted-foreground">Loading charges…</p>}
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {pickResults.length === 0 && !pickLoading ? (
              <p className="text-xs text-muted-foreground">No charges found. Try another search or create new.</p>
            ) : (
              pickResults.map((row) => (
                <label
                  key={row.source_id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/60 p-2 text-sm hover:bg-muted/40"
                >
                  <input
                    type="radio"
                    name="lettings-pick"
                    className="mt-1"
                    checked={lettingsPickedChargeId === row.source_id}
                    onChange={() => setLettingsPickedChargeId(row.source_id)}
                  />
                  <div>
                    <div className="font-medium">{row.source_label}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.source_date ? formatDate(row.source_date) : '—'}
                      {row.source_amount_pence != null ? ` · ${formatPounds(row.source_amount_pence)}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">{row.match_reason.join(', ')}</div>
                  </div>
                </label>
              ))
            )}
          </div>
          <div className="space-y-2 border-t border-border/60 pt-3">
            <p className="text-xs font-medium text-foreground">Optional posting overrides</p>
            <p className="text-xs text-muted-foreground">
              Leave these on “Use charge defaults” unless this payment should post to a different fund, income account, or stream than the charge row.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Fund override</Label>
                <Select value={overrideFundId || '__default__'} onValueChange={(v) => setOverrideFundId(v === '__default__' ? '' : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Fund" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Use charge defaults</SelectItem>
                    {funds.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Income account override</Label>
                <Select
                  value={overrideAccountId || '__default__'}
                  onValueChange={(v) => setOverrideAccountId(v === '__default__' ? '' : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Income account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Use charge defaults</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <details className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium">Advanced: income stream override</summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Lettings posting usually sets the LETTINGS stream on the credit line automatically. Override only for unusual cases.
              </p>
              <div className="mt-2">
                <Select
                  value={overrideIncomeStreamId || '__none__'}
                  onValueChange={(v) => setOverrideIncomeStreamId(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Income stream" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Use charge / system default</SelectItem>
                    {incomeStreams.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </details>
          </div>
        </div>
      ) : null}

      {lettingsSubmode === 'create' ? (
        <div className="space-y-3 rounded-xl border border-border/70 p-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setInlineOpen(true)}>
              + Add income account
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLettingsSubmode('overview')}>
              Back
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="letting-name">Hirer / letting name</Label>
              <Input id="letting-name" value={lettingName} onChange={(e) => setLettingName(e.target.value)} placeholder="Who paid" />
            </div>
            <div className="space-y-1">
              <Label>Fund</Label>
              <Select value={fundId} onValueChange={setFundId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select fund" />
                </SelectTrigger>
                <SelectContent>
                  {funds.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Required. Restricted balances and reporting use the fund.</p>
            </div>
            <div className="space-y-1">
              <Label>Income account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select income account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Required GL income account (e.g. hall hire). This is separate from any “Lettings” category label.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="letting-amount">Amount</Label>
              <Input id="letting-amount" readOnly value={formatPounds(selectedLine.amount_pence)} className="bg-muted/30" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="letting-period">Charge period</Label>
              <Input
                id="letting-period"
                type="date"
                value={lettingPeriodDate.slice(0, 10)}
                onChange={(e) => setLettingPeriodDate(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="letting-notes">Notes (charge description)</Label>
              <Textarea
                id="letting-notes"
                value={lettingChargeNotes}
                onChange={(e) => setLettingChargeNotes(e.target.value)}
                placeholder="Optional details for this charge"
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="sm:col-span-2">
              <details className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium">Advanced: income stream</summary>
                <p className="mt-2 text-xs text-muted-foreground">
                  Usually not needed—the system applies the LETTINGS income stream on the journal when you reconcile.
                </p>
                <div className="mt-2">
                  <Select value={incomeStreamId || '__none__'} onValueChange={(v) => setIncomeStreamId(v === '__none__' ? '' : v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Income stream" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Default (auto LETTINGS)</SelectItem>
                      {incomeStreams.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </details>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={inlineOpen} onOpenChange={setInlineOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New income account</DialogTitle>
            <DialogDescription>Creates a chart of accounts income line for lettings or other hall-hire income.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="inline-acct-name">Name</Label>
            <Input id="inline-acct-name" value={inlineName} onChange={(e) => setInlineName(e.target.value)} placeholder="e.g. Community hall hire" />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setInlineOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitInlineAccount} disabled={inlineSaving}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
