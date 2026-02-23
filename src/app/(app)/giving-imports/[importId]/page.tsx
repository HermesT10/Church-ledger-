import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftRight } from 'lucide-react';
import { getActiveOrg } from '@/lib/org';
import { viewGivingImport } from '@/lib/giving/actions';
import { PROVIDER_LABELS } from '@/lib/giving-platforms/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default async function GivingImportDetailPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  await getActiveOrg();
  const { importId } = await params;

  const { import_record, rows, error } = await viewGivingImport(importId);

  if (error || !import_record) {
    notFound();
  }

  const providerLabel =
    PROVIDER_LABELS[import_record.provider] ?? import_record.provider;

  const hasPayoutRows = rows.some((r) => r.payout_reference != null);

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {providerLabel} Import
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {import_record.file_name ?? 'Import'} — {import_record.import_start ?? '?'} to{' '}
            {import_record.import_end ?? '?'}
          </p>
        </div>
        <div className="flex gap-2">
          {hasPayoutRows && (
            <Button asChild variant="outline">
              <Link
                href={`/reconciliation?provider=${import_record.provider}&dateFrom=${import_record.import_start ?? ''}&dateTo=${import_record.import_end ?? ''}`}
              >
                <ArrowLeftRight className="h-4 w-4 mr-1.5" />
                Reconcile Payouts
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/giving-imports">Back to Imports</Link>
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="border shadow-sm rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Inserted</p>
          <p className="text-2xl font-bold text-green-600">
            {import_record.inserted_count}
          </p>
        </Card>
        <Card className="border shadow-sm rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Skipped</p>
          <p className="text-2xl font-bold text-yellow-600">
            {import_record.skipped_count}
          </p>
        </Card>
        <Card className="border shadow-sm rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Errors</p>
          <p className="text-2xl font-bold text-red-600">
            {import_record.error_count}
          </p>
        </Card>
        <Card className="border shadow-sm rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Journals</p>
          <p className="text-2xl font-bold text-blue-600">
            {import_record.journals_created}
          </p>
        </Card>
        <Card className="border shadow-sm rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Status</p>
          <Badge
            variant={
              import_record.status === 'completed' ? 'default' : 'destructive'
            }
            className="mt-1"
          >
            {import_record.status}
          </Badge>
        </Card>
      </div>

      {/* Imported rows table */}
      <Card className="border shadow-sm rounded-2xl">
        <CardHeader>
          <CardTitle>
            Imported Rows ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Donor</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Payout Ref</TableHead>
                    <TableHead className="text-right">Gross (£)</TableHead>
                    <TableHead className="text-right">Fee (£)</TableHead>
                    <TableHead className="text-right">Net (£)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(row.txn_date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {row.donor_name ?? '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[150px] truncate">
                        {row.reference ?? '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[150px] truncate">
                        {row.payout_reference ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(row.gross_amount_pence / 100).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-red-600">
                        {row.fee_amount_pence > 0
                          ? (row.fee_amount_pence / 100).toFixed(2)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-green-600">
                        {(row.net_amount_pence / 100).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">
              No rows in this import.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
