'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCashCollection } from '@/lib/cash/actions';
import { createInvoiceAccountInline } from '@/lib/invoices/actions';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface LineState {
  key: number;
  fund_id: string;
  income_account_id: string;
  amount: string;
  donor_id: string;
  gift_aid_eligible: boolean;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

interface Props {
  funds: { id: string; name: string }[];
  incomeAccounts: AccountOption[];
  donors: { id: string; full_name: string }[];
}

function emptyLine(key: number, funds: { id: string; name: string }[], accounts: AccountOption[]): LineState {
  return {
    key,
    fund_id: funds[0]?.id ?? '',
    income_account_id: accounts[0]?.id ?? '',
    amount: '',
    donor_id: '',
    gift_aid_eligible: false,
  };
}

export function NewCollectionClient({ funds, incomeAccounts: initialAccounts, donors }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [incomeAccounts, setIncomeAccounts] = useState<AccountOption[]>(initialAccounts);
  const [inlineOpen, setInlineOpen] = useState(false);
  const [inlineName, setInlineName] = useState('Giving / Cash Offering Income');
  const [inlineSaving, startInlineTransition] = useTransition();

  const [collectedDate, setCollectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [serviceName, setServiceName] = useState('');
  const [counter1Name, setCounter1Name] = useState('');
  const [counter2Name, setCounter2Name] = useState('');
  const [counter1Confirmed, setCounter1Confirmed] = useState(false);
  const [counter2Confirmed, setCounter2Confirmed] = useState(false);
  const [notes, setNotes] = useState('');

  const [lines, setLines] = useState<LineState[]>(() => [emptyLine(1, funds, incomeAccounts)]);

  const nextKey = lines.length > 0 ? Math.max(...lines.map((l) => l.key)) + 1 : 1;

  const addLine = () => {
    setLines([...lines, emptyLine(nextKey, funds, incomeAccounts)]);
  };

  const removeLine = (key: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((l) => l.key !== key));
  };

  const updateLine = (key: number, field: keyof LineState, value: string | boolean) => {
    setLines(
      lines.map((l) =>
        l.key === key
          ? {
              ...l,
              [field]: value,
              ...(field === 'donor_id' && value === '' ? { gift_aid_eligible: false } : {}),
            }
          : l,
      ),
    );
  };

  const lineTotalPence = lines.reduce((s, l) => s + Math.round(parseFloat(l.amount || '0') * 100), 0);

  const canSave =
    funds.length > 0 &&
    incomeAccounts.length > 0 &&
    serviceName.trim() &&
    counter1Name.trim() &&
    counter2Name.trim() &&
    counter1Confirmed &&
    counter2Confirmed &&
    lineTotalPence > 0;

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
      const row: AccountOption = {
        id: res.data.id,
        code: res.data.code,
        name: res.data.name,
      };
      setIncomeAccounts((prev) => {
        if (prev.some((a) => a.id === row.id)) return prev;
        return [...prev, row].sort((a, b) => a.code.localeCompare(b.code));
      });
      setLines((ls) => ls.map((l) => (!l.income_account_id ? { ...l, income_account_id: row.id } : l)));
      toast.success('Income account created.');
      setInlineOpen(false);
    });
  }

  const handleSave = () => {
    if (!serviceName.trim()) {
      toast.error('Service name is required.');
      return;
    }
    if (!counter1Name.trim() || !counter2Name.trim()) {
      toast.error('Both counter names are required.');
      return;
    }
    if (!counter1Confirmed || !counter2Confirmed) {
      toast.error('Both counters must confirm the count before saving.');
      return;
    }
    if (funds.length === 0) {
      toast.error('No funds available. Create a fund before recording cash collections.');
      return;
    }
    if (incomeAccounts.length === 0) {
      toast.error('No income accounts available. Create an income account before saving this collection.');
      return;
    }
    if (lineTotalPence <= 0) {
      toast.error('Total must be positive.');
      return;
    }

    const parsedLines = lines
      .map((l) => ({
        fund_id: l.fund_id.trim(),
        income_account_id: l.income_account_id.trim(),
        amount_pence: Math.round(parseFloat(l.amount || '0') * 100),
        donor_id: l.donor_id.trim() || null,
        gift_aid_eligible: l.gift_aid_eligible,
      }))
      .filter((l) => l.amount_pence > 0);

    if (parsedLines.length === 0) {
      toast.error('At least one line with a positive amount is required.');
      return;
    }

    for (let i = 0; i < parsedLines.length; i++) {
      const l = parsedLines[i];
      if (!l.fund_id) {
        toast.error(`Line ${i + 1}: choose a fund.`);
        return;
      }
      if (!l.income_account_id) {
        toast.error('Choose an income account for each collection line.');
        return;
      }
      if (l.gift_aid_eligible && !l.donor_id) {
        toast.error(`Line ${i + 1}: select a donor to flag Gift Aid, or turn Gift Aid off for anonymous giving.`);
        return;
      }
    }

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
      if (error) {
        toast.error(error);
        return;
      }
      if (data) {
        toast.success('Collection saved.');
        router.push(`/cash/collections/${data.id}`);
      }
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {funds.length === 0 ? (
        <div className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
          No active funds found. Create a fund before recording a cash collection.
        </div>
      ) : null}
      {incomeAccounts.length === 0 ? (
        <div className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
          No income accounts found. Create one (e.g. via Chart of Accounts or “Add income account” below) before
          saving this collection.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>New Cash Collection</CardTitle>
          <CardDescription>Record a cash collection with two-person verification.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Collection Date *</Label>
              <Input type="date" value={collectedDate} onChange={(e) => setCollectedDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Service / Event *</Label>
              <Input placeholder="e.g. Sunday Service" value={serviceName} onChange={(e) => setServiceName(e.target.value)} />
            </div>
          </div>

          <div className="border rounded-lg p-4 space-y-4">
            <p className="text-sm font-medium">Two-Person Count Verification</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Counter 1 Name *</Label>
                <Input placeholder="Full name" value={counter1Name} onChange={(e) => setCounter1Name(e.target.value)} />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="c1_confirm"
                    checked={counter1Confirmed}
                    onCheckedChange={(v) => setCounter1Confirmed(v === true)}
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
                    onCheckedChange={(v) => setCounter2Confirmed(v === true)}
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

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Collection Lines</CardTitle>
              <CardDescription>Break down the collection by fund and income account.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setInlineOpen(true)}>
              + Add income account
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((l) => (
            <div key={l.key} className="flex items-end gap-2 border rounded-lg p-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Fund *</Label>
                <select
                  className={SELECT_CLASS}
                  value={l.fund_id}
                  onChange={(e) => updateLine(l.key, 'fund_id', e.target.value)}
                  disabled={funds.length === 0}
                >
                  <option value="">Choose fund</option>
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Income account *</Label>
                <select
                  className={SELECT_CLASS}
                  value={l.income_account_id}
                  onChange={(e) => updateLine(l.key, 'income_account_id', e.target.value)}
                  disabled={incomeAccounts.length === 0}
                >
                  <option value="">Choose income account</option>
                  {incomeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-28 space-y-1.5">
                <Label className="text-xs">Amount (£) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={l.amount}
                  onChange={(e) => updateLine(l.key, 'amount', e.target.value)}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Donor (optional)</Label>
                <select className={SELECT_CLASS} value={l.donor_id} onChange={(e) => updateLine(l.key, 'donor_id', e.target.value)}>
                  <option value="">Anonymous</option>
                  {donors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1 pb-1">
                <Checkbox
                  checked={l.gift_aid_eligible}
                  disabled={!l.donor_id}
                  onCheckedChange={(v) => updateLine(l.key, 'gift_aid_eligible', v === true)}
                />
                <span className="text-xs text-muted-foreground">GA</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeLine(l.key)} disabled={lines.length <= 1} className="pb-1">
                <Trash2 size={14} />
              </Button>
            </div>
          ))}

          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" size="sm" onClick={addLine} disabled={funds.length === 0 || incomeAccounts.length === 0}>
              <Plus size={14} className="mr-1" /> Add Line
            </Button>
            <p className="text-sm font-medium">
              Total: <span className="text-lg font-bold">£{(lineTotalPence / 100).toFixed(2)}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={inlineOpen} onOpenChange={setInlineOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New income account</DialogTitle>
            <DialogDescription>
              Creates a chart of accounts line for offerings and cash collections. You can rename it to match your church.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="inline-income-name">Name</Label>
            <Input id="inline-income-name" value={inlineName} onChange={(e) => setInlineName(e.target.value)} />
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

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={isPending || !canSave}>
          {isPending ? 'Saving…' : 'Save Collection'}
        </Button>
        <Button variant="outline" onClick={() => router.push('/cash/collections')}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
