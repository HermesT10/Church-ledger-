'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  createDeclaration,
  deactivateDeclaration,
  reactivateDeclaration,
  uploadDeclarationFile,
} from '@/lib/giftaid/actions';
import type { GiftAidDeclarationRow } from '@/lib/giftaid/types';
import { toast } from 'sonner';
import {
  Plus,
  ArrowLeft,
  FileCheck,
  FileX,
  Upload,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  declarations: GiftAidDeclarationRow[];
  donors: { id: string; full_name: string }[];
  canEdit: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DeclarationsClient({ declarations, donors, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // New declaration form state
  const [form, setForm] = useState({
    donorId: '',
    startDate: '',
    endDate: '',
    declarationDate: new Date().toISOString().slice(0, 10),
    hmrcVersion: '',
    templateVersion: '',
  });
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);

  const activeDeclarations = declarations.filter((d) => d.is_active);
  const inactiveDeclarations = declarations.filter((d) => !d.is_active);

  /* ---- File upload ---- */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    const formData = new FormData();
    formData.append('file', file);

    const { url, error } = await uploadDeclarationFile(formData);
    setUploadingFile(false);

    if (error) {
      toast.error(error);
      return;
    }
    if (url) {
      setAttachmentUrl(url);
      toast.success('File uploaded successfully.');
    }
  };

  /* ---- Create declaration ---- */
  const handleCreate = () => {
    if (!form.donorId || !form.startDate || !form.declarationDate) {
      toast.error('Please fill in all required fields.');
      return;
    }

    startTransition(async () => {
      const { success, error } = await createDeclaration({
        donorId: form.donorId,
        startDate: form.startDate,
        endDate: form.endDate || null,
        declarationDate: form.declarationDate,
        hmrcVersion: form.hmrcVersion || undefined,
        templateVersion: form.templateVersion || undefined,
        attachmentUrl: attachmentUrl ?? undefined,
      });

      if (error) {
        toast.error(error);
        return;
      }
      if (success) {
        toast.success('Declaration created.');
        setDialogOpen(false);
        setForm({
          donorId: '',
          startDate: '',
          endDate: '',
          declarationDate: new Date().toISOString().slice(0, 10),
          hmrcVersion: '',
          templateVersion: '',
        });
        setAttachmentUrl(null);
        router.refresh();
      }
    });
  };

  /* ---- Toggle active ---- */
  const handleDeactivate = (id: string) => {
    startTransition(async () => {
      const { error } = await deactivateDeclaration(id);
      if (error) toast.error(error);
      else {
        toast.success('Declaration deactivated.');
        router.refresh();
      }
    });
  };

  const handleReactivate = (id: string) => {
    startTransition(async () => {
      const { error } = await reactivateDeclaration(id);
      if (error) toast.error(error);
      else {
        toast.success('Declaration reactivated.');
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <Button asChild variant="outline" size="sm">
          <Link href="/gift-aid">
            <ArrowLeft size={14} className="mr-1" />
            Back to Gift Aid
          </Link>
        </Button>

        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus size={14} className="mr-1" />
                New Declaration
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>New Gift Aid Declaration</DialogTitle>
                <DialogDescription>
                  Record a new Gift Aid declaration for a donor.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Donor *</Label>
                  <select
                    className={SELECT_CLASS}
                    value={form.donorId}
                    onChange={(e) => setForm({ ...form, donorId: e.target.value })}
                  >
                    <option value="">Select a donor...</option>
                    {donors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Valid From *</Label>
                    <Input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valid To</Label>
                    <Input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank for open-ended.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Declaration Date *</Label>
                  <Input
                    type="date"
                    value={form.declarationDate}
                    onChange={(e) =>
                      setForm({ ...form, declarationDate: e.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>HMRC Version</Label>
                    <Input
                      placeholder="e.g. v1.0"
                      value={form.hmrcVersion}
                      onChange={(e) =>
                        setForm({ ...form, hmrcVersion: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Template Version</Label>
                    <Input
                      placeholder="e.g. Church 2024"
                      value={form.templateVersion}
                      onChange={(e) =>
                        setForm({ ...form, templateVersion: e.target.value })
                      }
                    />
                  </div>
                </div>

                {/* File upload */}
                <div className="space-y-1.5">
                  <Label>Attachment</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileUpload}
                      disabled={uploadingFile}
                    />
                    {uploadingFile && (
                      <span className="text-xs text-muted-foreground">Uploading…</span>
                    )}
                  </div>
                  {attachmentUrl && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <FileCheck size={12} />
                      File uploaded
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={isPending}>
                  {isPending ? 'Creating…' : 'Create Declaration'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Active Declarations */}
      <Card>
        <CardHeader>
          <CardTitle>Active Declarations ({activeDeclarations.length})</CardTitle>
          <CardDescription>
            Donors with current Gift Aid declarations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeDeclarations.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Donor</TableHead>
                    <TableHead>Valid From</TableHead>
                    <TableHead>Valid To</TableHead>
                    <TableHead>Declaration Date</TableHead>
                    <TableHead>HMRC Ver.</TableHead>
                    <TableHead>Attachment</TableHead>
                    {canEdit && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeDeclarations.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.donor_name}</TableCell>
                      <TableCell>{formatDate(d.start_date)}</TableCell>
                      <TableCell>{d.end_date ? formatDate(d.end_date) : 'Open-ended'}</TableCell>
                      <TableCell>{formatDate(d.declaration_date)}</TableCell>
                      <TableCell>
                        {d.hmrc_version ? (
                          <Badge variant="outline" className="text-xs">
                            {d.hmrc_version}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {d.attachment_url ? (
                          <a
                            href={d.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1 text-xs"
                          >
                            <ExternalLink size={12} />
                            View
                          </a>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeactivate(d.id)}
                            disabled={isPending}
                          >
                            <FileX size={14} className="mr-1" />
                            Deactivate
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              No active declarations. Add one above.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Inactive Declarations */}
      {inactiveDeclarations.length > 0 && (
        <Card>
          <CardHeader>
            <button
              type="button"
              onClick={() => setShowInactive(!showInactive)}
              className="flex items-center justify-between w-full text-left"
            >
              <div>
                <CardTitle className="text-base">
                  Inactive Declarations ({inactiveDeclarations.length})
                </CardTitle>
                <CardDescription className="mt-1">
                  Historical or deactivated declarations.
                </CardDescription>
              </div>
              <Badge variant="outline">
                {showInactive ? 'Hide' : 'Show'}
              </Badge>
            </button>
          </CardHeader>
          {showInactive && (
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Donor</TableHead>
                      <TableHead>Valid From</TableHead>
                      <TableHead>Valid To</TableHead>
                      <TableHead>Declaration Date</TableHead>
                      <TableHead>Attachment</TableHead>
                      {canEdit && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inactiveDeclarations.map((d) => (
                      <TableRow key={d.id} className="opacity-60">
                        <TableCell className="font-medium">{d.donor_name}</TableCell>
                        <TableCell>{formatDate(d.start_date)}</TableCell>
                        <TableCell>{d.end_date ? formatDate(d.end_date) : '—'}</TableCell>
                        <TableCell>{formatDate(d.declaration_date)}</TableCell>
                        <TableCell>
                          {d.attachment_url ? (
                            <a
                              href={d.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline flex items-center gap-1 text-xs"
                            >
                              <ExternalLink size={12} />
                              View
                            </a>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReactivate(d.id)}
                              disabled={isPending}
                            >
                              <FileCheck size={14} className="mr-1" />
                              Reactivate
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
