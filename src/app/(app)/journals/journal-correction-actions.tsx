'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RotateCcw, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { amendJournal, postJournal, reverseJournal } from './actions';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function JournalCorrectionActions({
  journalId,
  status,
  disabled,
  missingFundLineCount = 0,
}: {
  journalId: string;
  status?: string;
  disabled?: boolean;
  /** Posted lines with an amount but no fund — surfaces amend-vs-reverse guidance */
  missingFundLineCount?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reverseOpen, setReverseOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [reversalDate, setReversalDate] = useState(today());
  const [reason, setReason] = useState('');
  const [amendDate, setAmendDate] = useState(today());
  const [amendReason, setAmendReason] = useState('');

  const submitReverse = () => {
    const formData = new FormData();
    formData.set('journal_id', journalId);
    formData.set('reversal_date', reversalDate);
    formData.set('reason', reason);

    startTransition(async () => {
      const result = await reverseJournal(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Reversal journal posted.');
      setReverseOpen(false);
      router.refresh();
    });
  };

  const submitPost = () => {
    const formData = new FormData();
    formData.set('id', journalId);
    startTransition(async () => {
      await postJournal(formData);
    });
  };

  const submitAmend = () => {
    const formData = new FormData();
    formData.set('journal_id', journalId);
    formData.set('reversal_date', amendDate);
    formData.set('reason', amendReason);

    startTransition(async () => {
      const result = await amendJournal(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Correction draft created.');
      setAmendOpen(false);
      router.push(`/journals/${result.replacementId}`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'approved' && (
        <Button size="sm" onClick={submitPost} disabled={disabled || isPending}>
          Post
        </Button>
      )}
      {status === 'posted' && (
      <Dialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled}>
            <RotateCcw size={14} className="mr-1.5" />
            Reverse
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse journal</DialogTitle>
            <DialogDescription>
              Posted journals cannot be edited directly. This creates and posts an equal-and-opposite journal dated in an open period.
              {missingFundLineCount > 0 ? (
                <span className="mt-2 block rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-foreground dark:border-amber-900/50 dark:bg-amber-950/40">
                  This journal has {missingFundLineCount === 1 ? 'a line without a fund' : `${missingFundLineCount} lines without a fund`}.
                  Prefer <strong>Amend</strong> if you need to assign funds; reversing only backs out amounts.
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reversal-date">Reversal date</Label>
              <Input
                id="reversal-date"
                type="date"
                value={reversalDate}
                onChange={(event) => setReversalDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reversal-reason">Reason</Label>
              <Textarea
                id="reversal-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is this journal being reversed?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseOpen(false)}>Cancel</Button>
            <Button onClick={submitReverse} disabled={isPending || !reversalDate || reason.trim().length < 5}>
              Post reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

      {status === 'posted' && (
      <Dialog open={amendOpen} onOpenChange={setAmendOpen}>
        <DialogTrigger asChild>
          <Button variant="default" size="sm" disabled={disabled}>
            <Wrench size={14} className="mr-1.5" />
            Amend
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Amend posted journal</DialogTitle>
            <DialogDescription>
              This will reverse the original entry and create a corrected replacement journal as a draft. You can edit and post the replacement after review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              The original journal remains in the audit trail. The reversal and replacement draft are linked to it for traceability.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amend-date">Reversal date</Label>
              <Input
                id="amend-date"
                type="date"
                value={amendDate}
                onChange={(event) => setAmendDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amend-reason">Amendment reason</Label>
              <Textarea
                id="amend-reason"
                value={amendReason}
                onChange={(event) => setAmendReason(event.target.value)}
                placeholder="What needs correcting?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAmendOpen(false)}>Cancel</Button>
            <Button onClick={submitAmend} disabled={isPending || !amendDate || amendReason.trim().length < 5}>
              Create correction draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}
