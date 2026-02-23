'use client';

import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { getAuditLog } from './actions';
import type { AuditLogEntry } from './types';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface AuditLogClientProps {
  orgId: string;
  initialEntries: AuditLogEntry[];
  initialTotal: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ACTION_LABELS: Record<string, string> = {
  post_journal: 'Posted Journal',
  reverse_journal: 'Reversed Journal',
  post_bill: 'Posted Bill',
  post_payment_run: 'Posted Payment Run',
  post_payroll_run: 'Posted Payroll Run',
  remove_member: 'Removed Member',
  force_logout_all: 'Force Logout All',
  archive_supplier: 'Archived Supplier',
  archive_donor: 'Archived Donor',
  clear_demo_data: 'Cleared Demo Data',
};

const ENV_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  production: 'destructive',
  staging: 'secondary',
  development: 'outline',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AuditLogClient({
  orgId,
  initialEntries,
  initialTotal,
}: AuditLogClientProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadPage = (newPage: number) => {
    startTransition(async () => {
      const result = await getAuditLog(orgId, { page: newPage, limit: pageSize });
      if (!result.error) {
        setEntries(result.data);
        setTotal(result.total);
        setPage(newPage);
      }
    });
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Activity Log</CardTitle>
            <CardDescription>
              {total} event{total !== 1 ? 's' : ''} recorded
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              No audit events recorded yet. Events will appear here as
              significant actions are taken.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <>
                      <TableRow key={entry.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDate(entry.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {entry.userName ?? entry.userId.slice(0, 8) + '...'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {ACTION_LABELS[entry.action] ?? entry.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {entry.entityType && (
                            <span>
                              {entry.entityType}
                              {entry.entityId && (
                                <span className="font-mono ml-1">
                                  {entry.entityId.slice(0, 8)}...
                                </span>
                              )}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={ENV_BADGE_VARIANT[entry.environment] ?? 'outline'}
                            className="text-[10px] capitalize"
                          >
                            {entry.environment}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {Object.keys(entry.metadata).length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={() =>
                                setExpandedRow(
                                  expandedRow === entry.id ? null : entry.id,
                                )
                              }
                            >
                              {expandedRow === entry.id ? 'Hide' : 'View'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {expandedRow === entry.id && (
                        <TableRow key={`${entry.id}-meta`}>
                          <TableCell colSpan={6} className="bg-muted/30">
                            <pre className="text-xs font-mono whitespace-pre-wrap p-2">
                              {JSON.stringify(entry.metadata, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || isPending}
                    onClick={() => loadPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || isPending}
                    onClick={() => loadPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
