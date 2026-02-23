'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { resolveErasureRequest, type ErasureRequestRow } from './actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Check, X } from 'lucide-react';

interface Props {
  requests: ErasureRequestRow[];
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
};

const SCOPE_LABELS: Record<string, string> = {
  personal: 'Personal',
  church: 'Church',
};

export function ErasureRequestsClient({ requests: initialRequests }: Props) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [resolveDialog, setResolveDialog] = useState<{
    open: boolean;
    request: ErasureRequestRow | null;
    action: 'completed' | 'rejected';
    notes: string;
  }>({ open: false, request: null, action: 'completed', notes: '' });
  const [isPending, startTransition] = useTransition();

  const handleResolve = (request: ErasureRequestRow, action: 'completed' | 'rejected') => {
    setResolveDialog({ open: true, request, action, notes: '' });
  };

  const confirmResolve = () => {
    if (!resolveDialog.request) return;
    startTransition(async () => {
      const { error } = await resolveErasureRequest(
        resolveDialog.request!.id,
        resolveDialog.action,
        resolveDialog.notes || undefined,
      );
      if (error) toast.error(error);
      else {
        toast.success(`Request ${resolveDialog.action === 'completed' ? 'completed' : 'rejected'}.`);
        setRequests((prev) =>
          prev.map((r) =>
            r.id === resolveDialog.request!.id
              ? {
                  ...r,
                  status: resolveDialog.action,
                  resolved_at: new Date().toISOString(),
                  resolved_by: '',
                  notes: resolveDialog.notes || null,
                }
              : r,
          ),
        );
        setResolveDialog({ open: false, request: null, action: 'completed', notes: '' });
        router.refresh();
      }
    });
  };

  const pendingRequests = requests.filter((r) => r.status === 'pending' || r.status === 'in_progress');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/settings">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={16} className="mr-1" />
            Back to Settings
          </Button>
        </Link>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <CardDescription>
            {pendingRequests.length} pending. Resolve requests by marking them completed or rejected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requester</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No data erasure requests.
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <span className="font-medium">{r.requester_name ?? 'Unknown'}</span>
                        <span className="text-xs text-muted-foreground block">
                          {r.requester_user_id.slice(0, 8)}...
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {SCOPE_LABELS[r.scope] ?? r.scope}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === 'pending' || r.status === 'in_progress'
                              ? 'secondary'
                              : r.status === 'completed'
                                ? 'default'
                                : 'destructive'
                          }
                          className="text-xs"
                        >
                          {STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {r.reason || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {(r.status === 'pending' || r.status === 'in_progress') && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-emerald-600 hover:text-emerald-700"
                              onClick={() => handleResolve(r, 'completed')}
                            >
                              <Check size={14} className="mr-1" />
                              Complete
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleResolve(r, 'rejected')}
                            >
                              <X size={14} className="mr-1" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={resolveDialog.open}
        onOpenChange={(open) => !open && setResolveDialog({ open: false, request: null, action: 'completed', notes: '' })}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {resolveDialog.action === 'completed' ? 'Mark as completed' : 'Reject request'}
            </DialogTitle>
            <DialogDescription>
              {resolveDialog.action === 'completed'
                ? 'Confirm that you have processed this data erasure request.'
                : 'Reject this request. The requester will need to submit a new request if needed.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input
                value={resolveDialog.notes}
                onChange={(e) => setResolveDialog({ ...resolveDialog, notes: e.target.value })}
                placeholder="Internal notes for this resolution"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialog({ open: false, request: null, action: 'completed', notes: '' })}>
              Cancel
            </Button>
            <Button
              variant={resolveDialog.action === 'rejected' ? 'destructive' : 'default'}
              onClick={confirmResolve}
              disabled={isPending}
            >
              {isPending ? 'Processing...' : resolveDialog.action === 'completed' ? 'Complete' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
