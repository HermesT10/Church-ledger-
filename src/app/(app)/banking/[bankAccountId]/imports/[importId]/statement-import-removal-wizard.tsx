'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { removeBankStatementImportWithOptions } from '@/lib/banking/import-actions';
import type { DeleteBankStatementReason } from '@/lib/banking/import-actions.types';

const CONFIRM_PHRASE = 'REMOVE IMPORT';

const REASONS: { value: DeleteBankStatementReason; label: string }[] = [
  { value: 'wrong_file_uploaded', label: 'Wrong file uploaded' },
  { value: 'duplicate_upload', label: 'Duplicate upload' },
  { value: 'wrong_bank_account', label: 'Wrong bank account' },
  { value: 'incorrect_mapping', label: 'Incorrect mapping' },
  { value: 'other', label: 'Other (describe below)' },
];

export function StatementImportRemovalWizard({
  importId,
  bankAccountId,
  linesNeedingUndo,
  giftAidLockedMatchCount,
}: {
  importId: string;
  bankAccountId: string;
  linesNeedingUndo: number;
  giftAidLockedMatchCount: number;
}) {
  const router = useRouter();
  const [reason, setReason] = useState<DeleteBankStatementReason>('wrong_file_uploaded');
  const [otherReason, setOtherReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [deleteFile, setDeleteFile] = useState(true);
  const [giftAidOverride, setGiftAidOverride] = useState(false);
  const [isPending, startTransition] = useTransition();

  const needsOtherText = reason === 'other';
  const effectiveReason = needsOtherText ? otherReason.trim() : reason;

  function handleRemove() {
    if (confirmation !== CONFIRM_PHRASE) {
      toast.error(`Type ${CONFIRM_PHRASE} to confirm.`);
      return;
    }
    if (effectiveReason.length < 3) {
      toast.error('Enter a reason of at least 3 characters.');
      return;
    }
    if (giftAidLockedMatchCount > 0 && !giftAidOverride) {
      toast.error('Confirm Gift Aid corrections, or tick the acknowledgement if an admin/treasurer has approved.');
      return;
    }

    startTransition(async () => {
      const result = await removeBankStatementImportWithOptions({
        importId,
        reason: effectiveReason,
        deleteUploadedFile: deleteFile,
        giftAidUnreconcileOverride: giftAidLockedMatchCount > 0 ? giftAidOverride : false,
      });
      if (!result.ok) {
        toast.error(result.error ?? 'Could not remove this import.');
        return;
      }
      if (result.correction_event_error) {
        toast.message('Import removed, but the correction event could not be saved.', {
          description: result.correction_event_error,
        });
      } else {
        toast.success(
          `Removed import and ${result.deleted_transactions} transaction${result.deleted_transactions === 1 ? '' : 's'}.`,
        );
      }
      router.push(`/banking/${bankAccountId}?tab=statements`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-6">
      <h2 className="text-lg font-semibold">Remove statement import (treasurer / admin)</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Reconciled rows are unreconciled first (including posted journals where supported). Unsupported match types
        (for example some supplier or payroll paths) must be cleared manually in Reconciliation before this will
        succeed.
      </p>

      <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
        <p>
          <span className="font-medium">{linesNeedingUndo}</span> imported row
          {linesNeedingUndo === 1 ? '' : 's'} require undo before deletion.
        </p>
        {giftAidLockedMatchCount > 0 ? (
          <p className="mt-2 text-warning">
            {giftAidLockedMatchCount} donation match
            {giftAidLockedMatchCount === 1 ? '' : 'es'} may be tied to a Gift Aid claim that has progressed — treasurer
            acknowledgement is required.
          </p>
        ) : null}
      </div>

      {linesNeedingUndo === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing here needs orchestrated undo. Use{' '}
          <strong>Delete import</strong> on the Statements tab instead (
          <Link className="text-primary underline-offset-4 hover:underline" href={`/banking/${bankAccountId}?tab=statements`}>
            back to statements
          </Link>
          ).
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orch-reason">Reason category</Label>
            <select
              id="orch-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as DeleteBankStatementReason)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={isPending}
            >
              {REASONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {needsOtherText ? (
            <div className="space-y-2">
              <Label htmlFor="orch-other">Describe what went wrong</Label>
              <Input
                id="orch-other"
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                disabled={isPending}
                placeholder="At least 3 characters"
              />
            </div>
          ) : null}

          {giftAidLockedMatchCount > 0 ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3">
              <Checkbox
                checked={giftAidOverride}
                onCheckedChange={(v) => setGiftAidOverride(v === true)}
                disabled={isPending}
                className="mt-0.5"
              />
              <span className="text-sm leading-snug">
                I confirm Gift Aid–linked donations may be corrected or reversed as part of removing this import, and I
                am authorised as treasurer or admin to proceed.
              </span>
            </label>
          ) : null}

          <label className="flex cursor-pointer items-center gap-3">
            <Checkbox
              checked={deleteFile}
              onCheckedChange={(v) => setDeleteFile(v === true)}
              disabled={isPending}
            />
            <span className="text-sm">Also delete the uploaded file from evidence storage</span>
          </label>

          <div className="space-y-2">
            <Label htmlFor="orch-confirm">Type {CONFIRM_PHRASE}</Label>
            <Input
              id="orch-confirm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={isPending}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={
                isPending ||
                effectiveReason.length < 3 ||
                confirmation !== CONFIRM_PHRASE ||
                (giftAidLockedMatchCount > 0 && !giftAidOverride)
              }
              onClick={handleRemove}
            >
              {isPending ? 'Working…' : 'Unreconcile and remove import'}
            </Button>
            <Button type="button" variant="outline" asChild disabled={isPending}>
              <Link href={`/banking/${bankAccountId}?tab=statements`}>Cancel</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
