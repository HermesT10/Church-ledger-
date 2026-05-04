'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteBankStatementImport } from '@/lib/banking/import-actions';
import type { DeleteBankStatementReason } from '@/lib/banking/import-actions.types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const CONFIRMATION = 'DELETE STATEMENT';

const REASONS: { value: DeleteBankStatementReason; label: string }[] = [
  { value: 'wrong_file_uploaded', label: 'Wrong file uploaded' },
  { value: 'duplicate_upload', label: 'Duplicate upload' },
  { value: 'wrong_bank_account', label: 'Wrong bank account' },
  { value: 'incorrect_mapping', label: 'Incorrect mapping' },
  { value: 'other', label: 'Other' },
];

export function StatementDeleteAction({
  bankAccountId,
  importId,
  fileName,
  reconciledRows,
  postedRows,
}: {
  bankAccountId: string;
  importId: string;
  fileName: string;
  reconciledRows: number;
  postedRows: number;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState<DeleteBankStatementReason>('wrong_file_uploaded');
  const [isPending, startTransition] = useTransition();
  const blocked = reconciledRows > 0 || postedRows > 0;

  function handleDelete() {
    if (confirmation !== CONFIRMATION) {
      toast.error(`Type ${CONFIRMATION} to confirm deletion.`);
      return;
    }

    startTransition(async () => {
      const result = await deleteBankStatementImport({ importId, reason, deleteFile: true });
      if (!result.ok) {
        toast.error(result.error ?? 'Could not delete statement import.');
        return;
      }
      toast.success(`Deleted statement import and ${result.deleted_transactions} imported transactions.`);
      setOpen(false);
      setConfirmation('');
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm">Delete import</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete bank statement import?</DialogTitle>
          <DialogDescription>
            This will remove the uploaded statement and all unreconciled bank transactions imported from it. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm">
            <p className="font-medium">{fileName}</p>
            {blocked ? (
              <div className="mt-2 space-y-2 text-warning">
                <p>
                  This statement has reconciled transactions. Unreconcile them before deleting this import, or use the
                  treasurer removal wizard to undo supported matches in one flow.
                </p>
                <p className="text-sm">
                  Reconciled: {reconciledRows}. Posted: {postedRows}.
                </p>
                <Button type="button" variant="secondary" size="sm" asChild>
                  <Link href={`/banking/${bankAccountId}/imports/${importId}`}>Open removal wizard</Link>
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-muted-foreground">Only unreconciled imported rows will be removed.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`delete-reason-${importId}`}>Reason</Label>
            <select
              id={`delete-reason-${importId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value as DeleteBankStatementReason)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={blocked || isPending}
            >
              {REASONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`delete-confirm-${importId}`}>Type DELETE STATEMENT</Label>
            <Input
              id={`delete-confirm-${importId}`}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={blocked || isPending}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={blocked || isPending || confirmation !== CONFIRMATION}
            >
              Delete statement
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
