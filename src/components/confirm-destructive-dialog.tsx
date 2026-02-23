'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface ConfirmDestructiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** If set, user must type this exact phrase to enable the confirm button. */
  confirmPhrase?: string;
  /** Button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Button variant. Defaults to "destructive". */
  variant?: 'destructive' | 'default';
  /** Called when the user confirms the action. */
  onConfirm: () => void;
  /** Shows spinner/disabled state on the confirm button. */
  isPending?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ConfirmDestructiveDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmPhrase,
  confirmLabel = 'Confirm',
  variant = 'destructive',
  onConfirm,
  isPending = false,
}: ConfirmDestructiveDialogProps) {
  const [input, setInput] = useState('');

  // Reset input when dialog opens/closes
  useEffect(() => {
    if (!open) setInput('');
  }, [open]);

  const requiresPhrase = !!confirmPhrase;
  const phraseMatch = !requiresPhrase || input === confirmPhrase;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {requiresPhrase && (
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-phrase" className="text-sm">
              Type{' '}
              <span className="font-mono font-bold">{confirmPhrase}</span>{' '}
              to confirm
            </Label>
            <Input
              id="confirm-phrase"
              placeholder={confirmPhrase}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="font-mono"
              autoComplete="off"
            />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant={variant}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            disabled={!phraseMatch || isPending}
          >
            {isPending ? 'Processing...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
