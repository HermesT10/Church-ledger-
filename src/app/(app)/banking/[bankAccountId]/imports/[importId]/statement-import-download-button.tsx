'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createBankStatementImportSignedDownloadUrl } from '@/lib/banking/import-actions';

export function StatementImportDownloadButton({ importId }: { importId: string }) {
  const [pending, setPending] = useState(false);

  async function handleDownload() {
    setPending(true);
    try {
      const { url, error } = await createBankStatementImportSignedDownloadUrl(importId);
      if (error || !url) {
        toast.error(error ?? 'Could not create download link.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleDownload}>
      <FileDown size={16} className="mr-1.5" />
      {pending ? 'Preparing…' : 'Download original file'}
    </Button>
  );
}
