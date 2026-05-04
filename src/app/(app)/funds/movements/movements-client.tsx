'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FundRow } from '@/lib/funds/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  createFundTransferDraft,
  createFundAdjustmentDraft,
} from '@/lib/funds/movements-actions';
export function MovementsClient({
  funds,
  initialKind,
}: {
  funds: FundRow[];
  initialKind: 'transfer' | 'adjustment';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<'transfer' | 'adjustment'>(initialKind);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={kind === 'transfer' ? 'default' : 'outline'}
          onClick={() => setKind('transfer')}
        >
          Transfer between funds
        </Button>
        <Button
          type="button"
          size="sm"
          variant={kind === 'adjustment' ? 'default' : 'outline'}
          onClick={() => setKind('adjustment')}
        >
          Record adjustment
        </Button>
      </div>

      {kind === 'transfer' ? (
        <form
          className="space-y-4 rounded-2xl border border-border bg-card p-6"
          action={(fd) =>
            startTransition(async () => {
              setMessage(null);
              const from = fd.get('from_fund_id') as string;
              const to = fd.get('to_fund_id') as string;
              const amount = Math.round(Number(fd.get('amount_gbp')) * 100);
              const date = fd.get('transfer_date') as string;
              const reason = fd.get('reason') as string;
              const r = await createFundTransferDraft({
                fromFundId: from,
                toFundId: to,
                amountPence: amount,
                transferDate: date,
                reason: reason || undefined,
              });
              setMessage(r.ok ? 'Draft transfer saved.' : r.error);
              if (r.ok) router.refresh();
            })
          }
        >
          <p className="text-sm text-muted-foreground">
            Creates a dated draft. Your treasurer completes posting through the journal process so the accounts stay balanced and traceable.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="from_fund_id">From fund</Label>
            <select
              id="from_fund_id"
              name="from_fund_id"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            >
              <option value="">Choose fund</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="to_fund_id">To fund</Label>
            <select
              id="to_fund_id"
              name="to_fund_id"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            >
              <option value="">Choose fund</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="amount_gbp">Amount (GBP)</Label>
            <Input id="amount_gbp" name="amount_gbp" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="transfer_date">Date</Label>
            <Input id="transfer_date" name="transfer_date" type="date" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reason">Why (plain language)</Label>
            <Textarea id="reason" name="reason" rows={3} placeholder="Approved by trustees to move unrestricted surplus…" />
          </div>
          <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save draft transfer'}</Button>
        </form>
      ) : (
        <form
          className="space-y-4 rounded-2xl border border-border bg-card p-6"
          action={(fd) =>
            startTransition(async () => {
              setMessage(null);
              const fundId = fd.get('fund_id') as string;
              const amount = Math.round(Number(fd.get('amount_gbp')) * 100);
              const direction = fd.get('direction') as 'increase' | 'decrease';
              const adjDate = fd.get('adjustment_date') as string;
              const reason = fd.get('reason') as string;
              const r = await createFundAdjustmentDraft({
                fundId,
                amountPence: amount,
                direction,
                adjustmentDate: adjDate,
                reason,
              });
              setMessage(r.ok ? 'Draft adjustment saved.' : r.error);
              if (r.ok) router.refresh();
            })
          }
        >
          <p className="text-sm text-muted-foreground">
            Use for trustee-approved corrections. Final posting flows through journals so auditors can follow the entries.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="fund_id">Fund</Label>
            <select
              id="fund_id"
              name="fund_id"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            >
              <option value="">Choose fund</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="direction">Direction</Label>
            <select
              id="direction"
              name="direction"
              required
              defaultValue="increase"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            >
              <option value="increase">Money in — increase recognised balance</option>
              <option value="decrease">Money out — decrease recognised balance</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="amt">Amount (GBP)</Label>
            <Input id="amt" name="amount_gbp" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adjustment_date">Date</Label>
            <Input id="adjustment_date" name="adjustment_date" type="date" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adj_reason">Why this changed</Label>
            <Textarea id="adj_reason" name="reason" rows={3} required placeholder="Brief explanation auditors can understand." />
          </div>
          <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save draft adjustment'}</Button>
        </form>
      )}

      {message && (
        <p className={`text-sm ${message.startsWith('Draft') ? 'text-emerald-700' : 'text-destructive'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
