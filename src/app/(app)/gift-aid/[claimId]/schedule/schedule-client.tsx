'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  editGiftAidScheduleRow,
  exportGiftAidScheduleWorkbook,
  getGiftAidScheduleExportDownloadUrl,
} from '@/lib/giftaid/actions';
import type { GiftAidSchedulePreviewData } from '@/lib/giftaid/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
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

function formatPounds(value: number) {
  return `£${(value / 100).toFixed(2)}`;
}

function readinessLabel(value: string) {
  if (value === 'ready') return 'Ready to export';
  if (value === 'warnings') return 'Ready with warnings';
  return 'Blocked';
}

export function GiftAidScheduleClient({
  batchId,
  canEdit,
  preview,
}: {
  batchId: string;
  canEdit: boolean;
  preview: GiftAidSchedulePreviewData;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<{
    claimLineId: string;
    fieldName: string;
    value: string;
  } | null>(null);
  const [reason, setReason] = useState('');

  const handleExport = () => {
    startTransition(async () => {
      const result = await exportGiftAidScheduleWorkbook({ batchId });
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Unable to export schedule.');
        return;
      }
      toast.success('Gift Aid schedule exported.');
      router.refresh();
    });
  };

  const handleDownload = (exportId: string, fileType: 'spreadsheet' | 'pdf') => {
    startTransition(async () => {
      const result = await getGiftAidScheduleExportDownloadUrl({
        exportId,
        fileType,
      });
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Unable to prepare download.');
        return;
      }

      const link = document.createElement('a');
      link.href = result.data.url;
      link.download = result.data.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  const handleSaveEdit = () => {
    if (!editing) return;
    startTransition(async () => {
      const numericFields = new Set(['donation_amount_pence', 'claim_amount_pence']);
      const result = await editGiftAidScheduleRow({
        batchId,
        claimLineId: editing.claimLineId,
        fieldName: editing.fieldName,
        editedValue: numericFields.has(editing.fieldName)
          ? Number(editing.value)
          : editing.value,
        reason,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Schedule row updated.');
      setEditing(null);
      setReason('');
      router.refresh();
    });
  };

  const editableFields = [
    ['donor_title_snapshot', 'Title'],
    ['donor_first_name_or_initial_snapshot', 'First'],
    ['donor_last_name_snapshot', 'Last'],
    ['donor_house_name_or_number_snapshot', 'House / No.'],
    ['donor_postcode_snapshot', 'Postcode'],
    ['donation_date', 'Donation date'],
    ['donation_amount_pence', 'Amount pence'],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">HMRC submission artefact</p>
          <h2 className="text-2xl font-bold tracking-tight">
            Gift Aid schedule preview
          </h2>
          <p className="text-sm text-muted-foreground">
            The spreadsheet is the official HMRC Charities Online ODS. The PDF is an internal review/archive copy.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/gift-aid/${batchId}`}>Back to claim</Link>
          </Button>
          {canEdit ? (
            <Button
              onClick={handleExport}
              disabled={isPending || preview.readiness === 'blocked'}
            >
              Export HMRC ODS
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">HMRC template rules</p>
        <p>
          Exports use `templates/hmrc/R68GAD_V1_00_0_EN.ods`, preserve the
          `R68GAD_V1_00_0_EN` sheet, and block download unless every row passes
          title, name, address, postcode, date, amount, row-count, and declaration
          checks.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Readiness</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {readinessLabel(preview.readiness)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Rows</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{preview.row_count}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Donation total</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatPounds(preview.total_donation_amount_pence)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Gift Aid reclaim</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatPounds(preview.total_gift_aid_amount_pence)}
          </CardContent>
        </Card>
      </div>

      {preview.issues.length > 0 ? (
        <div className="rounded-2xl border border-warning/20 bg-warning-soft p-4 text-sm text-warning">
          {preview.issues.slice(0, 8).map((issue) => (
            <p key={`${issue.donationId}-${issue.field}-${issue.message}`}>
              {issue.message}
            </p>
          ))}
        </div>
      ) : null}

      {preview.gasds_rows?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>GASDS — Small donations</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Collection</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Eligible</TableHead>
                  <TableHead className="text-right">Gift Aid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(preview.gasds_rows ?? []).map((gr) => (
                  <TableRow key={gr.claim_line_id}>
                    <TableCell>{gr.batch_reference}</TableCell>
                    <TableCell>{gr.collection_date}</TableCell>
                    <TableCell className="max-w-[220px]">{gr.service_or_event_name}</TableCell>
                    <TableCell className="capitalize">{gr.collection_method}</TableCell>
                    <TableCell className="text-right">
                      {formatPounds(gr.eligible_amount_pence)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPounds(gr.claim_amount_pence)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manual schedule edit</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
            <Input
              value={editing.value}
              onChange={(event) =>
                setEditing((current) =>
                  current ? { ...current, value: event.target.value } : current
                )
              }
            />
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason for edit"
            />
            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} disabled={isPending}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Schedule rows</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>First</TableHead>
                <TableHead>Last</TableHead>
                <TableHead>House / No.</TableHead>
                <TableHead>Postcode</TableHead>
                <TableHead>Aggregated</TableHead>
                <TableHead>Sponsored</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Warnings</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((row) => (
                <TableRow key={row.claim_line_id}>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>{row.first_name_or_initial}</TableCell>
                  <TableCell>{row.last_name}</TableCell>
                  <TableCell>{row.house_name_or_number}</TableCell>
                  <TableCell>{row.postcode}</TableCell>
                  <TableCell>{row.aggregated_donations || '—'}</TableCell>
                  <TableCell>{row.sponsored_event || '—'}</TableCell>
                  <TableCell>{row.donation_date}</TableCell>
                  <TableCell className="text-right">£{row.amount}</TableCell>
                  <TableCell className="max-w-[280px] text-sm text-warning">
                    {row.validation_warnings.length > 0
                      ? row.validation_warnings.join(' ')
                      : row.locked
                        ? 'Export locked'
                        : '—'}
                  </TableCell>
                  <TableCell>
                    {canEdit && !row.locked ? (
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        defaultValue=""
                        onChange={(event) => {
                          const field = event.target.value;
                          if (!field) return;
                          const value =
                            field === 'donation_amount_pence'
                              ? String(row.donation_amount_pence)
                              : field === 'donor_title_snapshot'
                                ? row.title
                                : field === 'donor_first_name_or_initial_snapshot'
                                  ? row.first_name_or_initial
                                  : field === 'donor_last_name_snapshot'
                                    ? row.last_name
                                    : field === 'donor_house_name_or_number_snapshot'
                                      ? row.house_name_or_number
                                      : field === 'donation_date'
                                        ? row.donation_date
                                        : row.postcode;
                          setEditing({
                            claimLineId: row.claim_line_id,
                            fieldName: field,
                            value,
                          });
                          event.target.value = '';
                        }}
                      >
                        <option value="">Edit field</option>
                        {editableFields.map(([field, label]) => (
                          <option key={field} value={field}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      'Locked'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export history</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Donation total</TableHead>
                <TableHead>Gift Aid</TableHead>
                <TableHead>Downloads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.export_history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No schedule exports yet.
                  </TableCell>
                </TableRow>
              ) : (
                preview.export_history.map((exportRow) => (
                  <TableRow key={exportRow.id}>
                    <TableCell>v{exportRow.version}</TableCell>
                    <TableCell>
                      {new Date(exportRow.generated_at).toLocaleString('en-GB')}
                    </TableCell>
                    <TableCell>{exportRow.row_count}</TableCell>
                    <TableCell>{formatPounds(exportRow.donation_total_pence)}</TableCell>
                    <TableCell>{formatPounds(exportRow.gift_aid_total_pence)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(exportRow.id, 'spreadsheet')}
                        >
                          HMRC ODS
                        </Button>
                        {exportRow.pdf_storage_path ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(exportRow.id, 'pdf')}
                          >
                            PDF review
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
