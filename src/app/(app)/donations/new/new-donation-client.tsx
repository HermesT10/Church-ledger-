'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createDonation } from '@/lib/donations/actions';
import { DONATION_CHANNELS, CHANNEL_LABELS } from '@/lib/donations/types';
import type { DonationChannel } from '@/lib/donations/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

interface Props {
  donors: { id: string; name: string }[];
  funds: { id: string; name: string; type: string }[];
}

export function NewDonationClient({ donors, funds }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [donorId, setDonorId] = useState('');
  const [donationDate, setDonationDate] = useState(new Date().toISOString().slice(0, 10));
  const [channel, setChannel] = useState<DonationChannel>('bank_transfer');
  const [fundId, setFundId] = useState('');
  const [grossStr, setGrossStr] = useState('');
  const [feeStr, setFeeStr] = useState('0');
  const [providerRef, setProviderRef] = useState('');
  const [giftAidEligible, setGiftAidEligible] = useState(false);

  const grossPence = Math.round(parseFloat(grossStr || '0') * 100);
  const feePence = Math.round(parseFloat(feeStr || '0') * 100);
  const netPence = grossPence - feePence;

  async function handleSubmit() {
    if (grossPence <= 0) {
      toast.error('Amount must be greater than zero.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await createDonation({
        donorId: donorId || null,
        donationDate,
        channel,
        fundId: fundId || null,
        grossAmountPence: grossPence,
        feeAmountPence: feePence,
        providerReference: providerRef || undefined,
        giftAidEligible,
      });

      if (error) {
        toast.error(error);
        return;
      }

      toast.success('Donation recorded and posted to GL.');
      router.push(data?.id ? `/donations/${data.id}` : '/donations');
    } catch {
      toast.error('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Donation Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Date */}
        <div className="space-y-1.5">
          <Label>Donation Date</Label>
          <Input type="date" value={donationDate} onChange={(e) => setDonationDate(e.target.value)} />
        </div>

        {/* Donor */}
        <div className="space-y-1.5">
          <Label>Donor</Label>
          <select
            className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
            value={donorId}
            onChange={(e) => setDonorId(e.target.value)}
          >
            <option value="">Anonymous</option>
            {donors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Channel */}
        <div className="space-y-1.5">
          <Label>Channel</Label>
          <select
            className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
            value={channel}
            onChange={(e) => setChannel(e.target.value as DonationChannel)}
          >
            {DONATION_CHANNELS.map((c) => (
              <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>
            ))}
          </select>
        </div>

        {/* Fund */}
        <div className="space-y-1.5">
          <Label>Fund</Label>
          <select
            className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
            value={fundId}
            onChange={(e) => setFundId(e.target.value)}
          >
            <option value="">General / Unrestricted</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.name} ({f.type})</option>
            ))}
          </select>
        </div>

        {/* Amount fields */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Gross Amount (£)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={grossStr}
              onChange={(e) => setGrossStr(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Fee (£)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={feeStr}
              onChange={(e) => setFeeStr(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Net Amount (£)</Label>
            <Input
              type="text"
              readOnly
              value={(netPence / 100).toFixed(2)}
              className="bg-muted"
            />
          </div>
        </div>

        {/* Provider reference */}
        <div className="space-y-1.5">
          <Label>Provider Reference</Label>
          <Input
            value={providerRef}
            onChange={(e) => setProviderRef(e.target.value)}
            placeholder="e.g. GoCardless payment ID"
          />
        </div>

        {/* Gift Aid */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="giftAid"
            checked={giftAidEligible}
            onCheckedChange={(v: boolean) => setGiftAidEligible(v)}
          />
          <Label htmlFor="giftAid" className="text-sm font-normal cursor-pointer">
            This donation is Gift Aid eligible
          </Label>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" asChild>
            <Link href="/donations">Cancel</Link>
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving…' : 'Record & Post Donation'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
