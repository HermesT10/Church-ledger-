'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCashSpend } from '@/lib/cash/actions';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const SELECT_CLASS =
  'flex h-10 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface Props {
  funds: { id: string; name: string }[];
  expenseAccounts: { id: string; code: string; name: string }[];
}

export function NewSpendClient({ funds, expenseAccounts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [spendDate, setSpendDate] = useState(new Date().toISOString().slice(0, 10));
  const [paidTo, setPaidTo] = useState('');
  const [spentBy, setSpentBy] = useState('');
  const [description, setDescription] = useState('');
  const [fundId, setFundId] = useState(funds[0]?.id ?? '');
  const [expenseAccountId, setExpenseAccountId] = useState(expenseAccounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');

  const handleSave = () => {
    if (!paidTo.trim()) { toast.error('Paid To is required.'); return; }
    if (!spentBy.trim()) { toast.error('Spent By is required.'); return; }
    if (!description.trim()) { toast.error('Description is required.'); return; }
    const amountPence = Math.round(parseFloat(amount || '0') * 100);
    if (amountPence <= 0) { toast.error('Amount must be positive.'); return; }

    startTransition(async () => {
      const { data, error } = await createCashSpend({
        spendDate,
        paidTo: paidTo.trim(),
        spentBy: spentBy.trim(),
        description: description.trim(),
        fundId,
        expenseAccountId,
        amountPence,
      });
      if (error) { toast.error(error); return; }
      if (data) {
        toast.success('Cash spend saved.');
        router.push(`/cash/spends/${data.id}`);
      }
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="app-surface">
        <CardHeader>
          <CardTitle>Spend Details</CardTitle>
          <CardDescription>Record the expenditure, who handled it, and how it should be coded.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Spend Date *</Label>
              <Input type="date" value={spendDate} onChange={(e) => setSpendDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (£) *</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Paid To *</Label>
              <Input placeholder="Who received the cash" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Spent By *</Label>
              <Input placeholder="Who authorised / handled" value={spentBy} onChange={(e) => setSpentBy(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description *</Label>
            <Input placeholder="What was it spent on" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Fund *</Label>
              <select className={SELECT_CLASS} value={fundId} onChange={(e) => setFundId(e.target.value)}>
                {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Expense Account *</Label>
              <select className={SELECT_CLASS} value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)}>
                {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="app-toolbar">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save Spend'}
        </Button>
        <Button variant="outline" onClick={() => router.push('/cash/spends')}>Cancel</Button>
      </div>
    </div>
  );
}
