'use client';

import Link from 'next/link';
import { Download, FileStack } from 'lucide-react';
import type { GiftAidClaimRow } from '@/lib/giftaid/types';
import { ReportTableCard } from '@/components/reports/report-table-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { WorkspaceEmptyState } from '@/components/workspace-empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { GiftAidListActions } from '@/app/(app)/gift-aid/gift-aid-list-client';

function formatDate(value: string | null) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPounds(value: number) {
  return `£${(value / 100).toFixed(2)}`;
}

function getBatchName(claim: GiftAidClaimRow) {
  return claim.reference?.trim() || `Claim batch ${claim.id.slice(0, 8)}`;
}

export function GiftAidClaimHistoryTable({
  claims,
  title = 'Claim history',
  description = 'Review draft, submitted, and paid claim batches together with their export history.',
  action,
}: {
  claims: GiftAidClaimRow[];
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <ReportTableCard title={title} description={description}>
      {action ? (
        <div className="flex items-center justify-end border-b border-border/70 px-6 py-4">
          {action}
        </div>
      ) : null}
      {claims.length === 0 ? (
        <div className="p-6">
          <WorkspaceEmptyState
            icon={<FileStack size={28} aria-hidden="true" />}
            title="No claim batches yet"
            description="Once eligible giving has been reviewed and prepared, claim batches will appear here with their export and submission timeline."
            action={
              <Button asChild>
                <Link href="/gift-aid/claim-builder">Create claim batch</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch name</TableHead>
                <TableHead>Date range</TableHead>
                <TableHead>Line count</TableHead>
                <TableHead className="text-right">Total amount</TableHead>
                <TableHead className="text-right">Estimated reclaim</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Export file</TableHead>
                <TableHead>Timestamps</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((claim) => (
                <TableRow key={claim.id}>
                  <TableCell className="font-medium">
                    <div className="space-y-1">
                      <p>{getBatchName(claim)}</p>
                      <p className="text-xs text-muted-foreground">
                        {claim.id.slice(0, 8)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {formatDate(claim.claim_start)} to {formatDate(claim.claim_end)}
                  </TableCell>
                  <TableCell>{claim.donation_count}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPounds(claim.eligible_amount_pence)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-success">
                    {formatPounds(claim.claimable_total_pence)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={claim.status} />
                  </TableCell>
                  <TableCell>
                    {claim.latest_export_file_name ? (
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success">
                          <Download size={12} aria-hidden="true" />
                          HMRC schedule ready
                        </div>
                        <p className="text-sm font-medium">
                          {claim.latest_export_file_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Exported {formatDate(claim.latest_exported_at)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Not exported yet
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1 text-sm">
                      <p className="text-muted-foreground">
                        Created {formatDate(claim.created_at)}
                      </p>
                      <p className="text-muted-foreground">
                        Exported {formatDate(claim.latest_exported_at)}
                      </p>
                      <p className="text-muted-foreground">
                        Submitted {formatDate(claim.submitted_at)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <GiftAidListActions
                      claimId={claim.id}
                      latestExportId={claim.latest_export_id}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ReportTableCard>
  );
}
