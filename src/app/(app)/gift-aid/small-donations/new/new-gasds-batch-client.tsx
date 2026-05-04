'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createGiftAidSmallDonationBatch } from '@/lib/giftaid/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SectionCard,
} from '@/components/section-card';

export function NewGasdsBatchClient({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    batch_reference: '',
    collection_date: new Date().toISOString().slice(0, 10),
    service_or_event_name: '',
    collection_method: 'cash' as 'cash' | 'contactless',
    total_collected_pence: '',
    eligible_amount_pence: '',
    excluded_amount_pence: '0',
    notes: '',
    mark_ready: false,
  });

  const submit = () => {
    if (!canEdit) return;
    const total = Number(form.total_collected_pence);
    const eligible = Number(form.eligible_amount_pence);
    const excluded = Number(form.excluded_amount_pence);
    if (!form.batch_reference.trim()) {
      toast.error('Batch reference is required.');
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      toast.error('Total collected (£) must be a positive amount.');
      return;
    }

    startTransition(async () => {
      const totalPence = Math.round(total * 100);
      const eligiblePence = Math.round(eligible * 100);
      const excludedPence = Math.round(excluded * 100);

      const { data, error } = await createGiftAidSmallDonationBatch({
        batch_reference: form.batch_reference.trim(),
        collection_date: form.collection_date,
        service_or_event_name: form.service_or_event_name.trim() || 'Service',
        collection_method: form.collection_method,
        total_collected_pence: totalPence,
        eligible_amount_pence: eligiblePence,
        excluded_amount_pence: excludedPence,
        notes: form.notes.trim() || null,
        status: form.mark_ready ? 'ready' : 'draft',
      });

      if (error || !data) {
        toast.error(error ?? 'Unable to save batch.');
        return;
      }
      toast.success('Small donation batch recorded.');
      router.push('/gift-aid?tab=small-donations');
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div>
        <p className="text-sm text-muted-foreground">Gift Aid</p>
        <h1 className="text-2xl font-bold tracking-tight">Record GASDS small donation batch</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cash or contactless collections under the Gift Aid Small Donations Scheme. These do not appear on the
          standard HMRC donor schedule — export them from the workbook when building a claim.
        </p>
      </div>

      <SectionCard
        title="Batch details"
        description="Totals should match trustees’ reconciliation. Keep bank deposit evidence aligned with organisational policy."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="gasds-ref">Batch reference</Label>
            <Input
              id="gasds-ref"
              value={form.batch_reference}
              onChange={(e) =>
                setForm((c) => ({ ...c, batch_reference: e.target.value }))
              }
              placeholder="e.g. PLATE APR 06"
              disabled={!canEdit || isPending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gasds-date">Collection date</Label>
            <Input
              id="gasds-date"
              type="date"
              value={form.collection_date}
              onChange={(e) =>
                setForm((c) => ({ ...c, collection_date: e.target.value }))
              }
              disabled={!canEdit || isPending}
            />
          </div>
          <div className="space-y-1">
            <Label>Collection method</Label>
            <Select
              value={form.collection_method}
              onValueChange={(value) =>
                setForm((c) => ({
                  ...c,
                  collection_method: value as 'cash' | 'contactless',
                }))
              }
              disabled={!canEdit || isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="contactless">Contactless</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="gasds-event">Service or event name</Label>
            <Input
              id="gasds-event"
              value={form.service_or_event_name}
              onChange={(e) =>
                setForm((c) => ({ ...c, service_or_event_name: e.target.value }))
              }
              placeholder="Sunday service, community lunch, …"
              disabled={!canEdit || isPending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gasds-total">Total collected (£)</Label>
            <Input
              id="gasds-total"
              type="number"
              step="0.01"
              min="0"
              value={form.total_collected_pence}
              onChange={(e) =>
                setForm((c) => ({ ...c, total_collected_pence: e.target.value }))
              }
              disabled={!canEdit || isPending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gasds-eligible">Eligible for GASDS (£)</Label>
            <Input
              id="gasds-eligible"
              type="number"
              step="0.01"
              min="0"
              value={form.eligible_amount_pence}
              onChange={(e) =>
                setForm((c) => ({ ...c, eligible_amount_pence: e.target.value }))
              }
              disabled={!canEdit || isPending}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="gasds-excluded">Excluded not eligible (£)</Label>
            <Input
              id="gasds-excluded"
              type="number"
              step="0.01"
              min="0"
              value={form.excluded_amount_pence}
              onChange={(e) =>
                setForm((c) => ({
                  ...c,
                  excluded_amount_pence: e.target.value,
                }))
              }
              disabled={!canEdit || isPending}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="gasds-notes">Notes (optional)</Label>
            <Input
              id="gasds-notes"
              value={form.notes}
              onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
              disabled={!canEdit || isPending}
            />
          </div>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={form.mark_ready}
              onChange={(e) =>
                setForm((c) => ({ ...c, mark_ready: e.target.checked }))
              }
              disabled={!canEdit || isPending}
            />
            Mark as ready for inclusion in the next Gift Aid claim
          </label>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="outline" disabled={isPending}>
            <Link href="/gift-aid?tab=small-donations">Cancel</Link>
          </Button>
          <Button
            type="button"
            disabled={!canEdit || isPending}
            onClick={() => submit()}
          >
            {isPending ? 'Saving…' : 'Save batch'}
          </Button>
        </div>
      </SectionCard>

      {!canEdit ? (
        <p className="text-sm text-muted-foreground">
          You don’t have permission to record GASDS batches.
        </p>
      ) : null}
    </div>
  );
}
