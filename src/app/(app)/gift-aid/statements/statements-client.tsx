'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Download, FileText, Mail, Send } from 'lucide-react';
import {
  bulkGenerateDonorStatements,
  getDonorStatementDownloadUrl,
  recordDonorStatementMarkedSent,
} from '@/lib/giftaid/donor-statements-actions';
import type {
  DonorStatementListRow,
  DonorStatementRunListRow,
} from '@/lib/giftaid/donor-statements-actions';
import type { DonorStatementPeriodType } from '@/lib/giftaid/donor-statement-periods';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

function formatPence(p: number | null) {
  if (p == null) return '—';
  return `£${(p / 100).toFixed(2)}`;
}

export function GiftAidStatementsClient({
  initialRuns,
  initialStatements,
  runsError,
  statementsError,
  canEdit,
}: {
  initialRuns: DonorStatementRunListRow[];
  initialStatements: DonorStatementListRow[];
  runsError: string | null;
  statementsError: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [periodType, setPeriodType] = useState<DonorStatementPeriodType>('uk_tax_year');
  const [anchorYear, setAnchorYear] = useState(() => new Date().getFullYear() - 1);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const handleBulk = () => {
    if (!canEdit) return;
    startTransition(async () => {
      const { data, error } = await bulkGenerateDonorStatements({
        period_type: periodType,
        anchor_year: anchorYear,
        custom_start: periodType === 'custom' ? customStart : null,
        custom_end: periodType === 'custom' ? customEnd : null,
      });
      if (error) {
        toast.error(error);
        return;
      }
      if (data) {
        toast.success(
          `Bulk run finished: ${data.successCount} generated, ${data.failCount} failed.`,
        );
        router.refresh();
      }
    });
  };

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
        toast.error(error ?? 'Could not update');
        return;
      }
      toast.success('Marked as sent.');
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Giving statements
        </h1>
        <p className="text-sm text-muted-foreground">
          Annual summaries for donor records — PDF stored in Gift Aid secure storage.
        </p>
      </div>

      {runsError ? (
        <p className="text-sm text-destructive">{runsError}</p>
      ) : null}
      {statementsError ? (
        <p className="text-sm text-destructive">{statementsError}</p>
      ) : null}

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send size={18} aria-hidden />
              Bulk generate
            </CardTitle>
            <CardDescription>
              Create a statement PDF for every active donor for the selected period.
              Large churches may take a minute.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-2 min-w-[200px]">
              <Label>Period type</Label>
              <Select
                value={periodType}
                onValueChange={(v) => setPeriodType(v as DonorStatementPeriodType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uk_tax_year">UK tax year (6 Apr – 5 Apr)</SelectItem>
                  <SelectItem value="calendar_year">Calendar year</SelectItem>
                  <SelectItem value="fiscal_year">Financial year (from settings)</SelectItem>
                  <SelectItem value="custom">Custom dates</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodType !== 'custom' ? (
              <div className="space-y-2">
                <Label htmlFor="anchor-year">Anchor year</Label>
                <Input
                  id="anchor-year"
                  type="number"
                  className="w-32"
                  value={anchorYear}
                  onChange={(e) => setAnchorYear(parseInt(e.target.value, 10) || anchorYear)}
                />
                <p className="text-xs text-muted-foreground">
                  UK tax: year of 6 April start. Calendar: that calendar year.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <div className="space-y-2">
                  <Label htmlFor="cstart">Start</Label>
                  <Input
                    id="cstart"
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cend">End</Label>
                  <Input
                    id="cend"
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
            <Button onClick={handleBulk} disabled={isPending}>
              {isPending ? 'Running…' : 'Run for all donors'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Statement runs</CardTitle>
          <CardDescription>Bulk jobs and completion status.</CardDescription>
        </CardHeader>
        <CardContent>
          {initialRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bulk runs yet.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialRuns.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(r.created_at).toLocaleString('en-GB')}
                      </TableCell>
                      <TableCell>{r.label ?? '—'}</TableCell>
                      <TableCell className="text-sm">
                        {r.period_start} → {r.period_end}
                      </TableCell>
                      <TableCell className="text-xs">{r.period_type}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText size={18} aria-hidden />
            Generated statements
          </CardTitle>
          <CardDescription>
            Download PDFs and record when emailed to the donor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initialStatements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No statements yet. Use Donors → Generate statement, or bulk generate above.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Donor</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Donations</TableHead>
                    <TableHead className="text-right">Gift Aid (est.)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialStatements.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.donor_name}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {s.period_start} → {s.period_end}
                      </TableCell>
                      <TableCell className="text-right">{formatPence(s.total_donations_pence)}</TableCell>
                      <TableCell className="text-right">
                        {formatPence(s.total_gift_aid_reclaimable_pence)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.email_sent_at
                          ? new Date(s.email_sent_at).toLocaleString('en-GB')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => download(s.id)}
                            disabled={isPending || !s.pdf_path}
                          >
                            <Download size={14} className="mr-1" />
                            PDF
                          </Button>
                          {canEdit && s.status === 'generated' ? (
                            <Button
                              type="button"
                              variant="outline"
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
        </CardContent>
      </Card>
    </div>
  );
}
