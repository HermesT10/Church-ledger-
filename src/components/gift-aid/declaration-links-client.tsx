'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Mail, RefreshCw, RotateCcw, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  generateGiftAidDeclarationLink,
  regenerateGiftAidDeclarationLink,
  revokeGiftAidDeclarationLink,
  sendGiftAidDeclarationLinkByEmail,
} from '@/lib/giftaid/actions';
import type { GiftAidDeclarationLinkRow } from '@/lib/giftaid/types';
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

function formatDate(value: string | null) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function statusVariant(status: string) {
  if (status === 'active') return 'default' as const;
  if (status === 'used') return 'secondary' as const;
  if (status === 'revoked' || status === 'expired') return 'destructive' as const;
  return 'outline' as const;
}

export function DeclarationLinksClient({
  donorId,
  declarationId,
  initialLinks,
  compact = false,
}: {
  donorId?: string | null;
  declarationId?: string | null;
  initialLinks: GiftAidDeclarationLinkRow[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [latestUrl, setLatestUrl] = useState<string | null>(null);

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success('Declaration link copied.');
  };

  const handleGenerate = () => {
    startTransition(async () => {
      const result = await generateGiftAidDeclarationLink({ donorId, declarationId });
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Unable to generate declaration link.');
        return;
      }
      setLatestUrl(result.data.url);
      await copyUrl(result.data.url);
      router.refresh();
    });
  };

  const handleRevoke = (linkId: string) => {
    startTransition(async () => {
      const result = await revokeGiftAidDeclarationLink(linkId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Declaration link revoked.');
      router.refresh();
    });
  };

  const handleRegenerate = (linkId: string) => {
    startTransition(async () => {
      const result = await regenerateGiftAidDeclarationLink(linkId);
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Unable to regenerate declaration link.');
        return;
      }
      setLatestUrl(result.data.url);
      await copyUrl(result.data.url);
      router.refresh();
    });
  };

  const handleSend = (linkId: string) => {
    startTransition(async () => {
      const result = await sendGiftAidDeclarationLinkByEmail(linkId);
      if (result.error) {
        toast.info(result.error);
        return;
      }
      toast.success('Declaration link sent.');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">Self-service declaration links</p>
          <p className="text-sm text-muted-foreground">
            Generate secure links donors can use to complete and e-sign a declaration.
          </p>
        </div>
        <Button onClick={handleGenerate} disabled={isPending}>
          <Send size={14} className="mr-1.5" />
          Generate declaration link
        </Button>
      </div>

      {latestUrl ? (
        <div className="rounded-xl border border-success/20 bg-success-soft p-3 text-sm text-success">
          <p className="font-medium">New declaration link copied</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded bg-card px-2 py-1 text-xs">
              {latestUrl}
            </code>
            <Button size="sm" variant="outline" onClick={() => copyUrl(latestUrl)}>
              <Copy size={13} className="mr-1" />
              Copy again
            </Button>
          </div>
        </div>
      ) : null}

      {!compact || initialLinks.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Donor</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Signed PDF</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialLinks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No self-service declaration links yet.
                  </TableCell>
                </TableRow>
              ) : (
                initialLinks.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell>
                      <Badge variant={statusVariant(link.status)}>{link.status}</Badge>
                    </TableCell>
                    <TableCell>{link.donor_name ?? 'Linked donor'}</TableCell>
                    <TableCell>{formatDate(link.expires_at)}</TableCell>
                    <TableCell>{formatDate(link.used_at)}</TableCell>
                    <TableCell>
                      {link.declaration_pdf_download_url ? (
                        <Button asChild size="sm" variant="link" className="h-auto px-0">
                          <a href={link.declaration_pdf_download_url} target="_blank" rel="noreferrer">
                            Signed declaration PDF
                          </a>
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not submitted</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSend(link.id)}
                          disabled={isPending || link.status !== 'active'}
                        >
                          <Mail size={13} />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRegenerate(link.id)}
                          disabled={isPending}
                        >
                          <RefreshCw size={13} />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRevoke(link.id)}
                          disabled={isPending || link.status !== 'active'}
                        >
                          <XCircle size={13} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
