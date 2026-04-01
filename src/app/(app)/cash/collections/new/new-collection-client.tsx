'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCashCollection } from '@/lib/cash/actions';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const SELECT_CLASS =
  'flex h-10 w-full rounded-xl border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface LineState {
  key: number;
  fund_id: string;
  income_account_id: string;
  amount: string;
  donor_id: string;
  gift_aid_eligible: boolean;
}

interface Props {
  orgId: string;
  funds: { id: string; name: string }[];
  incomeAccounts: { id: string; code: string; name: string }[];
  donors: { id: string; full_name: string }[];
}

export function NewCollectionClient({ orgId, funds, incomeAccounts, donors }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [collectedDate, setCollectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [serviceName, setServiceName] = useState('');
  const [counter1Name, setCounter1Name] = useState('');
  const [counter2Name, setCounter2Name] = useState('');
  const [counter1Confirmed, setCounter1Confirmed] = useState(false);
  const [counter2Confirmed, setCounter2Confirmed] = useState(false);
  const [notes, setNotes] = useState('');

  const [lines, setLines] = useState<LineState[]>([
    { key: 1, fund_id: funds[0]?.id ?? '', income_account_id: incomeAccounts[0]?.id ?? '', amount: '', donor_id: '', gift_aid_eligible: false },
  ]);

  let nextKey = lines.length > 0 ? Math.max(...lines.map((l) => l.key)) + 1 : 1;

  const addLine = () => {
    setLines([
      ...lines,
      { key: nextKey, fund_id: funds[0]?.id ?? '', income_account_id: incomeAccounts[0]?.id ?? '', amount: '', donor_id: '', gift_aid_eligible: false },
    ]);
  };

  const removeLine = (key: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((l) => l.key !== key));
  };

  const updateLine = (key: number, field: keyof LineState, value: string | boolean) => {
    setLines(lines.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  };

  const lineTotalPence = lines.reduce((s, l) => s + Math.round(parseFloat(l.amount || '0') * 100), 0);

  const handleSave = () => {
    if (!serviceName.trim()) { toast.error('Service name is required.'); return; }
    if (!counter1Name.trim() || !counter2Name.trim()) { toast.error('Both counter names are required.'); return; }
    if (lineTotalPence <= 0) { toast.error('Total must be positive.'); return; }

    const parsedLines = lines.map((l) => ({
      fund_id: l.fund_id,
      income_account_id: l.income_account_id,
      amount_pence: Math.round(parseFloat(l.amount || '0') * 100),
      donor_id: l.donor_id || null,
      gift_aid_eligible: l.gift_aid_eligible,
    })).filter((l) => l.amount_pence > 0);

    if (parsedLines.length === 0) { toast.error('At least one line with a positive amount is required.'); return; }

    const totalPence = parsedLines.reduce((s, l) => s + l.amount_pence, 0);

    startTransition(async () => {
      const { data, error } = await createCashCollection({
        collectedDate,
        serviceName: serviceName.trim(),
        totalAmountPence: totalPence,
        countedByName1: counter1Name.trim(),
        countedByName2: counter2Name.trim(),
        counter1Confirmed,
        counter2Confirmed,
        notes: notes.trim() || undefined,
        lines: parsedLines,
      });
      if (error) { toast.error(error); return; }
      if (data) {
        toast.success('Collection saved.');
        router.push(`/cash/collections/${data.id}`);
      }
    });
  };

  return (
    <div className="max-w-4xl space-y-6">
      <Card className="app-surface">
        <CardHeader>
          <CardTitle>Collection Overview</CardTitle>
          <CardDescription>Record the service, counters, confirmations, and notes before coding the lines.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Collection Date *</Label>
              <Input type="date" value={collectedDate} onChange={(e) => setCollectedDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Service / Event *</Label>
              <Input placeholder="e.g. Sunday Service" value={serviceName} onChange={(e) => setServiceName(e.target.value)} />
            </div>
          </div>

          {/* Counter signatures */}
          <div className="rounded-[1.5rem] border border-border/70 bg-background/70 p-4 space-y-4">
            <p className="text-sm font-medium">Two-Person Count Verification</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Counter 1 Name *</Label>
                <Input placeholder="Full name" value={counter1Name} onChange={(e) => setCounter1Name(e.target.value)} />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="c1_confirm"
                    checked={counter1Confirmed}
                    onCheckedChange={(v: boolean) => setCounter1Confirmed(v)}
                  />
                  <Label htmlFor="c1_confirm" className="text-sm font-normal cursor-pointer">
                    I confirm the count is accurate
                  </Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Counter 2 Name *</Label>
                <Input placeholder="Full name" value={counter2Name} onChange={(e) => setCounter2Name(e.target.value)} />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="c2_confirm"
                    checked={counter2Confirmed}
                    onCheckedChange={(v: boolean) => setCounter2Confirmed(v)}
                  />
                  <Label htmlFor="c2_confirm" className="text-sm font-normal cursor-pointer">
                    I confirm the count is accurate
                  </Label>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card className="app-surface">
        <CardHeader>
          <CardTitle>Collection Lines</CardTitle>
          <CardDescription>Break down the collection by fund and income account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((l) => (
            <div key={l.key} className="rounded-[1.25rem] border border-border/70 bg-background/70 p-3">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr_140px_1fr_auto_auto] xl:items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Fund</Label>
                <select className={SELECT_CLASS} value={l.fund_id} onChange={(e) => updateLine(l.key, 'fund_id', e.target.value)}>
                  {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Income Account</Label>
                <select className={SELECT_CLASS} value={l.income_account_id} onChange={(e) => updateLine(l.key, 'income_account_id', e.target.value)}>
                  {incomeAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                </select>
              </div>
              <div className="w-28 space-y-1.5">
                <Label className="text-xs">Amount (£)</Label>
                <Input type="number" step="0.01" min="0" placeholder="0.00" value={l.amount} onChange={(e) => updateLine(l.key, 'amount', e.target.value)} />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Donor (optional)</Label>
                <select className={SELECT_CLASS} value={l.donor_id} onChange={(e) => updateLine(l.key, 'donor_id', e.target.value)}>
                  <option value="">Anonymous</option>
                  {donors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1 pb-1">
                <Checkbox checked={l.gift_aid_eligible} onCheckedChange={(v: boolean) => updateLine(l.key, 'gift_aid_eligible', v)} />
                <span className="text-xs text-muted-foreground">GA</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeLine(l.key)} disabled={lines.length <= 1} className="pb-1">
                <Trash2 size={14} />
              </Button>
              </div>
            </div>
          ))}

          <div className="app-toolbar pt-2">
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus size={14} className="mr-1" /> Add Line
            </Button>
            <p className="text-sm font-medium">
              Total: <span className="text-lg font-bold">£{(lineTotalPence / 100).toFixed(2)}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="app-toolbar">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save Collection'}
        </Button>
        <Button variant="outline" onClick={() => router.push('/cash/collections')}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
