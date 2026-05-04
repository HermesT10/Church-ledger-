'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ReconciliationCorrectionListItem } from '@/lib/banking/reconciliation-corrections-queries';

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BankLineCorrectionsCell({ corrections }: { corrections: ReconciliationCorrectionListItem[] }) {
  if (corrections.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs font-medium text-primary">
          History ({corrections.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(520px,85vh)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reconciliation corrections</DialogTitle>
          <DialogDescription>
            Audit trail when this bank line was unreconciled or otherwise corrected from the workspace.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 text-sm">
          {corrections.map((c) => (
            <li key={c.id} className="rounded-xl border border-border/70 bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">{formatWhen(c.created_at)}</p>
              <p className="mt-1 font-medium capitalize">
                {c.correction_type.replaceAll('_', ' ')} · {c.original_source_type.replaceAll('_', ' ')}
                {c.journal_action ? ` · ${c.journal_action.replaceAll('_', ' ')}` : ''}
              </p>
              <p className="mt-2 text-foreground/90">{c.reason}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {c.original_journal_id ? (
                  <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                    <Link href={`/journals/${c.original_journal_id}`}>Original journal</Link>
                  </Button>
                ) : null}
                {c.reversal_journal_id ? (
                  <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                    <Link href={`/journals/${c.reversal_journal_id}`}>Reversal journal</Link>
                  </Button>
                ) : null}
                <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                  <Link href="/reconciliation">Reconciliation</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
