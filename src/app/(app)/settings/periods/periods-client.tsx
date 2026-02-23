'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  createPeriod,
  closePeriod,
  lockPeriod,
  reopenPeriod,
} from '@/lib/periods/actions';
import type { FinancialPeriod } from '@/lib/periods/types';
import { PERIOD_STATUS_LABELS } from '@/lib/periods/types';

interface Props {
  initialPeriods: FinancialPeriod[];
}

export function PeriodsClient({ initialPeriods }: Props) {
  const router = useRouter();
  const [periods] = useState(initialPeriods);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  async function handleCreate() {
    if (!name.trim() || !startDate || !endDate) {
      toast.error('All fields are required.');
      return;
    }
    setLoading(true);
    const result = await createPeriod({ name: name.trim(), startDate, endDate });
    setLoading(false);
    if (result.success) {
      toast.success('Period created.');
      setOpen(false);
      setName('');
      setStartDate('');
      setEndDate('');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to create period.');
    }
  }

  async function handleAction(action: 'close' | 'lock' | 'reopen', periodId: string) {
    setLoading(true);
    let result;
    switch (action) {
      case 'close': result = await closePeriod(periodId); break;
      case 'lock': result = await lockPeriod(periodId); break;
      case 'reopen': result = await reopenPeriod(periodId); break;
    }
    setLoading(false);
    if (result.success) {
      toast.success(`Period ${action === 'close' ? 'closed' : action === 'lock' ? 'locked' : 'reopened'}.`);
      router.refresh();
    } else {
      toast.error(result.error || 'Action failed.');
    }
  }

  const statusVariant = (status: string) => {
    switch (status) {
      case 'open': return 'default' as const;
      case 'closed': return 'secondary' as const;
      case 'locked': return 'destructive' as const;
      default: return 'outline' as const;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Create Period</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New Financial Period</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="flex flex-col gap-2">
                <Label>Name</Label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Q1 2026"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Start Date</Label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>End Date</Label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={loading}>
                  {loading ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Financial Periods</CardTitle>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <p className="text-muted-foreground text-sm">No financial periods defined. Create one to enable period locking.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Start</th>
                    <th className="py-2 pr-4">End</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-2 pr-4 font-medium">{p.name}</td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {new Date(p.start_date).toLocaleDateString('en-GB')}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {new Date(p.end_date).toLocaleDateString('en-GB')}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={statusVariant(p.status)}>
                          {PERIOD_STATUS_LABELS[p.status]}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex gap-1 justify-end">
                          {p.status === 'open' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                disabled={loading}
                                onClick={() => handleAction('close', p.id)}
                              >
                                Close
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="text-xs"
                                disabled={loading}
                                onClick={() => handleAction('lock', p.id)}
                              >
                                Lock
                              </Button>
                            </>
                          )}
                          {p.status === 'closed' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                disabled={loading}
                                onClick={() => handleAction('reopen', p.id)}
                              >
                                Reopen
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="text-xs"
                                disabled={loading}
                                onClick={() => handleAction('lock', p.id)}
                              >
                                Lock
                              </Button>
                            </>
                          )}
                          {p.status === 'locked' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              disabled={loading}
                              onClick={() => handleAction('reopen', p.id)}
                            >
                              Reopen (Admin)
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
