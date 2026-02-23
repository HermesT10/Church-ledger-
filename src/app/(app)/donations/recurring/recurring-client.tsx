'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { updateRecurringDonationStatus } from '@/lib/donations/actions';
import { FREQUENCY_LABELS, RECURRING_STATUS_LABELS, CHANNEL_LABELS } from '@/lib/donations/types';
import type { RecurringDonationRow, RecurringStatus, DonationChannel, RecurringFrequency } from '@/lib/donations/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Pause, Play, XCircle, Repeat } from 'lucide-react';
import { toast } from 'sonner';

function formatPounds(p: number) { return '£' + (p / 100).toFixed(2); }
function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusColor(s: RecurringStatus) {
  switch (s) {
    case 'active': return 'bg-emerald-100 text-emerald-700';
    case 'paused': return 'bg-amber-100 text-amber-700';
    case 'cancelled': return 'bg-red-100 text-red-700';
    default: return '';
  }
}

interface Props {
  recurring: RecurringDonationRow[];
  canEdit: boolean;
  orgId: string;
}

export function RecurringClient({ recurring, canEdit }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleStatus(id: string, status: RecurringStatus) {
    setLoading(id);
    const { error } = await updateRecurringDonationStatus(id, status);
    if (error) toast.error(error);
    else {
      toast.success(`Recurring donation ${status}.`);
      router.refresh();
    }
    setLoading(null);
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm">
        <Link href="/donations"><ArrowLeft size={14} className="mr-1" /> Back to Donations</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Recurring Commitments</CardTitle>
          <CardDescription>{recurring.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {recurring.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Donor</TableHead>
                    <TableHead>Fund</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead>Status</TableHead>
                    {canEdit && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recurring.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.donor_name}</TableCell>
                      <TableCell>{r.fund_name ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatPounds(r.amount_pence)}</TableCell>
                      <TableCell>{FREQUENCY_LABELS[r.frequency as RecurringFrequency]}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {CHANNEL_LABELS[r.channel as DonationChannel] ?? r.channel}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(r.next_due_date)}</TableCell>
                      <TableCell>
                        <Badge className={statusColor(r.status)}>
                          {RECURRING_STATUS_LABELS[r.status]}
                        </Badge>
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex gap-1">
                            {r.status === 'active' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleStatus(r.id, 'paused')}
                                disabled={loading === r.id}
                              >
                                <Pause size={12} />
                              </Button>
                            )}
                            {r.status === 'paused' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleStatus(r.id, 'active')}
                                disabled={loading === r.id}
                              >
                                <Play size={12} />
                              </Button>
                            )}
                            {r.status !== 'cancelled' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600"
                                onClick={() => handleStatus(r.id, 'cancelled')}
                                disabled={loading === r.id}
                              >
                                <XCircle size={12} />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Repeat className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                No recurring donations configured yet.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
