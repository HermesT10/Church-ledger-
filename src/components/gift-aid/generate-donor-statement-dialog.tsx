'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { generateDonorStatement } from '@/lib/giftaid/donor-statements-actions';
import type { DonorStatementPeriodType } from '@/lib/giftaid/donor-statement-periods';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function GenerateDonorStatementDialog(props: {
  donorId: string;
  donorLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [periodType, setPeriodType] =
    useState<DonorStatementPeriodType>('uk_tax_year');
  const [anchorYear, setAnchorYear] = useState(() => new Date().getFullYear() - 1);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const generate = () => {
    startTransition(async () => {
      const { data, error } = await generateDonorStatement({
        donorId: props.donorId,
        period_type: periodType,
        anchor_year: anchorYear,
        custom_start: periodType === 'custom' ? customStart : undefined,
        custom_end: periodType === 'custom' ? customEnd : undefined,
        include_address_on_pdf: true,
      });
      if (error || !data) {
        toast.error(error ?? 'Failed to generate');
        return;
      }
      toast.success('Giving statement PDF generated.');
      props.onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate giving statement</DialogTitle>
          <DialogDescription>
            {props.donorLabel} · PDF saved under Gift Aid storage for this workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Period type</Label>
            <Select
              value={periodType}
              onValueChange={(v) => setPeriodType(v as DonorStatementPeriodType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uk_tax_year">UK tax year</SelectItem>
                <SelectItem value="calendar_year">Calendar year</SelectItem>
                <SelectItem value="fiscal_year">Financial year</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodType !== 'custom' ? (
            <div className="space-y-2">
              <Label htmlFor="gds-anchor">Anchor year</Label>
              <Input
                id="gds-anchor"
                type="number"
                value={anchorYear}
                onChange={(e) =>
                  setAnchorYear(parseInt(e.target.value, 10) || anchorYear)
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start</Label>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={generate} disabled={isPending}>
            {isPending ? 'Generating…' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
