'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCashDeposit, postCashDeposit } from '@/lib/cash/actions';
import type { CashCollectionRow } from '@/lib/cash/types';
import { toast } from 'sonner';
import { Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function formatDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function formatPounds(p: number) { return '£' + (p / 100).toFixed(2); }

interface Props {
  bankAccounts: { id: string; name: string }[];
  unbankedCollections: CashCollectionRow[];
}

export function NewDepositClient({ bankAccounts, unbankedCollections }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelection = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === unbankedCollections.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unbankedCollections.map((c) => c.id)));
    }
  };

  const totalSelected = unbankedCollections
    .filter((c) => selected.has(c.id))
    .reduce((s, c) => s + c.total_amount_pence, 0);

  const handleSaveAndPost = () => {
    if (selected.size === 0) { toast.error('Select at least one collection.'); return; }
    if (!bankAccountId) { toast.error('Select a bank account.'); return; }

    startTransition(async () => {
      const { data, error } = await createCashDeposit({
        bankAccountId,
        depositDate,
        collectionIds: Array.from(selected),
      });
      if (error) { toast.error(error); return; }
      if (!data) return;

      // Immediately post
      const { success, error: postError } = await postCashDeposit(data.id);
      if (postError) { toast.error(postError); return; }
      if (success) {
        toast.success('Deposit posted. Collections marked as banked.');
        router.push('/cash/deposits');
      }
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>New Cash Deposit</CardTitle>
          <CardDescription>Select posted collections to deposit into a bank account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Deposit Date *</Label>
              <Input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Bank Account *</Label>
              <select className={SELECT_CLASS} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Unbanked Collections</CardTitle>
              <CardDescription>{unbankedCollections.length} collection(s) available</CardDescription>
            </div>
            {unbankedCollections.length > 0 && (
              <Button variant="outline" size="sm" onClick={selectAll}>
                {selected.size === unbankedCollections.length ? 'Deselect All' : 'Select All'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {unbankedCollections.length > 0 ? (
            <div className="space-y-2">
              {unbankedCollections.map((c) => (
                <div key={c.id} className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer transition-colors ${selected.has(c.id) ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'}`} onClick={() => toggleSelection(c.id)}>
                  <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleSelection(c.id)} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{c.service_name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(c.collected_date)}</p>
                  </div>
                  <p className="text-sm font-semibold">{formatPounds(c.total_amount_pence)}</p>
                </div>
              ))}

              <div className="flex items-center justify-between border-t pt-3 mt-3">
                <p className="text-sm text-muted-foreground">{selected.size} selected</p>
                <p className="text-sm font-bold">Total: {formatPounds(totalSelected)}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <Landmark className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mt-2">No unbanked collections available. Post a collection first.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={handleSaveAndPost} disabled={isPending || selected.size === 0}>
          {isPending ? 'Processing…' : 'Deposit & Post'}
        </Button>
        <Button variant="outline" onClick={() => router.push('/cash/deposits')}>Cancel</Button>
      </div>
    </div>
  );
}
