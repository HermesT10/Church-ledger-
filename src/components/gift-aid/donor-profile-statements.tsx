'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Download,
  Mail,
} from 'lucide-react';
import {
  getDonorStatementDownloadUrl,
  recordDonorStatementMarkedSent,
} from '@/lib/giftaid/donor-statements-actions';
import type { DonorStatementListRow } from '@/lib/giftaid/donor-statements-actions';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { GenerateDonorStatementDialog } from '@/components/gift-aid/generate-donor-statement-dialog';

function formatPence(p: number | null) {
  if (p == null) return '—';
  return `£${(p / 100).toFixed(2)}`;
}

export function DonorProfileStatements({
  donorId,
  donorDisplayName,
  initialStatements,
  canEdit,
}: {
  donorId: string;
  donorDisplayName: string;
  initialStatements: DonorStatementListRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [generateOpen, setGenerateOpen] = useState(false);

  const download = (statementId: string) => {
    startTransition(async () => {
      const { url, error } = await getDonorStatementDownloadUrl(statementId);
      if (error || !url) {
        toast.error(error ?? 'Download failed.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  };

  const markSent = (statementId: string) => {
    startTransition(async () => {
      const { success, error } =
        await recordDonorStatementMarkedSent(statementId);
      if (!success || error) {
        toast.error(error ?? 'Update failed.');
        return;
      }
      toast.success('Marked as sent.');
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => setGenerateOpen(true)}>
            Generate statement
          </Button>
          <GenerateDonorStatementDialog
            donorId={donorId}
            donorLabel={donorDisplayName}
            open={generateOpen}
            onOpenChange={setGenerateOpen}
          />
        </div>
      ) : null}

      {initialStatements.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No saved statements yet.
        </p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Donations total</TableHead>
                <TableHead className="text-right">Gift Aid (eligible est.)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialStatements.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {s.period_start} → {s.period_end}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPence(s.total_donations_pence)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPence(s.total_gift_aid_reclaimable_pence)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => download(s.id)}
                        disabled={isPending}
                      >
                        <Download size={14} className="mr-1" />
                        PDF
                      </Button>
                      {canEdit && s.status === 'generated' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => markSent(s.id)}
                          disabled={isPending}
                        >
                          <Mail size={14} className="mr-1" />
                          Mark sent
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
