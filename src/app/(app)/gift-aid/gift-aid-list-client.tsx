'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import {
  exportGiftAidClaimCsv,
  getGiftAidExportDownloadUrl,
} from '@/lib/giftaid/actions';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Download, Eye } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  GiftAidListActions                                                 */
/*  Renders the "View" and "Export CSV" buttons for each claim row.    */
/* ------------------------------------------------------------------ */

export function GiftAidListActions({
  claimId,
  latestExportId,
}: {
  claimId: string;
  latestExportId: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  const handleExport = () => {
    startTransition(async () => {
      const exportResult = latestExportId
        ? await getGiftAidExportDownloadUrl({ exportId: latestExportId })
        : await exportGiftAidClaimCsv({ claimId }).then(async (result) => {
            if (result.error || !result.data) {
              return { data: null, error: result.error };
            }
            return getGiftAidExportDownloadUrl({
              exportId: result.data.exportId,
            });
          });

      if (exportResult.error || !exportResult.data) {
        toast.error(exportResult.error ?? 'Failed to download HMRC schedule.');
        return;
      }

      const link = document.createElement('a');
      link.href = exportResult.data.url;
      link.download = exportResult.data.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('HMRC Gift Aid schedule downloaded.');
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
        {isPending
          ? latestExportId
            ? 'Downloading...'
            : 'Exporting...'
          : latestExportId
            ? 'Download'
            : 'Export'}
      </Button>
    </div>
  );
}
