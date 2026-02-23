'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { allocateBankLine, deallocateBankLine } from '@/lib/banking/actions';
import { suggestSupplier } from '@/lib/suppliers/actions';
import { suggestAllocation, checkFundWarning } from '@/lib/banking/smartFeatures';
import type { BankLineWithAllocation } from '@/lib/banking/types';
import type { AllocationSuggestion, FundWarning } from '@/lib/banking/smartFeatures';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface Account {
  id: string;
  code: string;
  name: string;
}

interface Fund {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface Props {
  line: BankLineWithAllocation;
  accounts: Account[];
  funds: Fund[];
  suppliers: Supplier[];
}

function penceToPounds(pence: number): string {
  return (Math.abs(pence) / 100).toFixed(2);
}

export function BankLineActions({ line, accounts, funds, suppliers }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [fundId, setFundId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [suggestedSupplierName, setSuggestedSupplierName] = useState<string | null>(null);
  const [allocationSuggestion, setAllocationSuggestion] = useState<AllocationSuggestion | null>(null);
  const [fundWarning, setFundWarning] = useState<FundWarning | null>(null);

  // Auto-suggest supplier + account/fund when dialog opens
  useEffect(() => {
    if (!open || !line.description) return;

    let cancelled = false;

    // Suggest supplier from match rules
    suggestSupplier(line.description).then((result) => {
      if (cancelled) return;
      if (result.supplierId) {
        setSupplierId(result.supplierId);
        setSuggestedSupplierName(result.supplierName);
      }
    });

    // Suggest account/fund from past allocations
    suggestAllocation(line.description).then((result) => {
      if (cancelled || !result.data) return;
      setAllocationSuggestion(result.data);
    });

    return () => { cancelled = true; };
  }, [open, line.description]);

  // Check fund warning when fund changes
  useEffect(() => {
    if (!fundId || line.amount_pence >= 0) {
      setFundWarning(null);
      return;
    }
    let cancelled = false;
    checkFundWarning({ fundId, amountPence: Math.abs(line.amount_pence) }).then((result) => {
      if (cancelled) return;
      setFundWarning(result.data);
    });
    return () => { cancelled = true; };
  }, [fundId, line.amount_pence]);

  async function handleAllocate() {
    if (!accountId || !fundId) {
      toast.error('Please select both an account and a fund.');
      return;
    }

    setLoading(true);
    const result = await allocateBankLine({
      bankLineId: line.id,
      accountId,
      fundId,
      supplierId: supplierId || null,
    });
    setLoading(false);

    if (result.success) {
      toast.success('Bank line allocated successfully.');
      setOpen(false);
      setAccountId('');
      setFundId('');
      setSupplierId('');
      setSuggestedSupplierName(null);
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to allocate.');
    }
  }

  async function handleDeallocate() {
    setLoading(true);
    const result = await deallocateBankLine(line.id);
    setLoading(false);

    if (result.success) {
      toast.success('Allocation removed.');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to deallocate.');
    }
  }

  if (line.allocated) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-xs"
        onClick={handleDeallocate}
        disabled={loading}
      >
        {loading ? 'Removing...' : 'Remove'}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (!v) {
        setAccountId('');
        setFundId('');
        setSupplierId('');
        setSuggestedSupplierName(null);
        setAllocationSuggestion(null);
        setFundWarning(null);
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          Allocate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Allocate Bank Line</DialogTitle>
          <DialogDescription>
            Assign this transaction to an account and fund for reporting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Transaction summary */}
          <div className="rounded-md bg-muted px-3 py-2 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-mono">
                {new Date(line.txn_date).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Description</span>
              <span className="truncate max-w-[200px]">{line.description || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className={`font-mono font-semibold ${line.amount_pence < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {line.amount_pence < 0 ? '-' : ''}£{penceToPounds(line.amount_pence)}
              </span>
            </div>
          </div>

          {/* Smart suggestion banner */}
          {allocationSuggestion && !accountId && !fundId && (
            <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm space-y-1">
              <p className="font-medium text-blue-800">
                Suggested allocation ({allocationSuggestion.confidence} confidence)
              </p>
              <p className="text-blue-700 text-xs">{allocationSuggestion.matchReason}</p>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    setAccountId(allocationSuggestion.accountId);
                    setFundId(allocationSuggestion.fundId);
                    if (allocationSuggestion.supplierId && !supplierId) {
                      setSupplierId(allocationSuggestion.supplierId);
                    }
                  }}
                >
                  Apply: {allocationSuggestion.accountName} / {allocationSuggestion.fundName}
                </Button>
              </div>
            </div>
          )}

          {/* Fund warning */}
          {fundWarning?.wouldGoNegative && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm">
              <p className="text-amber-800 font-medium">Restricted Fund Warning</p>
              <p className="text-amber-700 text-xs">{fundWarning.message}</p>
            </div>
          )}

          {/* Account select */}
          <div className="flex flex-col gap-2">
            <Label>
              Account <span className="text-destructive">*</span>
            </Label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Select account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} – {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Fund select */}
          <div className="flex flex-col gap-2">
            <Label>
              Fund <span className="text-destructive">*</span>
            </Label>
            <select
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Select fund...</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Supplier select (optional) */}
          <div className="flex flex-col gap-2">
            <Label>
              Supplier <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </Label>
            <select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setSuggestedSupplierName(null);
              }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">No supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {suggestedSupplierName && supplierId && (
              <p className="text-xs text-blue-600">
                Auto-suggested: {suggestedSupplierName} (based on description match)
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAllocate}
              disabled={loading || !accountId || !fundId}
            >
              {loading ? 'Allocating...' : 'Allocate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
