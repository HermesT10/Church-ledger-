'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { exportGiftAidClaimCsv } from '@/lib/giftaid/actions';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Download, Eye } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  GiftAidListActions                                                 */
/*  Renders the "View" and "Export CSV" buttons for each claim row.    */
/* ------------------------------------------------------------------ */

export function GiftAidListActions({ claimId }: { claimId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleExport = () => {
    startTransition(async () => {
      const { data, error } = await exportGiftAidClaimCsv({ claimId });
      if (error || !data) {
        toast.error(error ?? 'Failed to export CSV.');
        return;
      }

      // Create a blob download
      const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gift-aid-claim-${claimId.slice(0, 8)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded.');
    });
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/gift-aid/${claimId}`}>
          <Eye size={14} className="mr-1" />
          View
        </Link>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={isPending}
      >
        <Download size={14} className="mr-1" />
        {isPending ? 'Exporting…' : 'CSV'}
      </Button>
    </div>
  );
}
