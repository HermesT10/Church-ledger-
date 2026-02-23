'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createBudget } from '@/lib/budgets/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

export function CreateBudgetForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copyFromPrev, setCopyFromPrev] = useState(false);
  const [pctIncrease, setPctIncrease] = useState('0');

  const currentYear = new Date().getFullYear();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const year = parseInt(formData.get('year') as string, 10);
    const name = (formData.get('name') as string)?.trim() || undefined;

    const result = await createBudget(
      orgId,
      year,
      name,
      copyFromPrev ? year - 1 : undefined,
      copyFromPrev ? parseFloat(pctIncrease || '0') : undefined,
    );

    setLoading(false);

    if (result.data) {
      toast.success('Budget created successfully.');
      setOpen(false);
      form.reset();
      setCopyFromPrev(false);
      setPctIncrease('0');
      router.push(`/budgets/${result.data.id}`);
    } else {
      toast.error(result.error || 'Failed to create budget.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Budget</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Budget</DialogTitle>
          <DialogDescription>
            Set the year and name. Optionally copy from the previous year.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="year">Year *</Label>
            <Input
              id="year"
              name="year"
              type="number"
              required
              min={2000}
              max={2100}
              defaultValue={currentYear}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="Annual Budget"
            />
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="copyPrev"
                checked={copyFromPrev}
                onCheckedChange={(v: boolean) => setCopyFromPrev(v)}
              />
              <Label htmlFor="copyPrev" className="text-sm font-normal cursor-pointer">
                Copy budget lines from previous year
              </Label>
            </div>

            {copyFromPrev && (
              <div className="flex flex-col gap-2 pl-6">
                <Label htmlFor="pctIncrease">% Increase (optional)</Label>
                <Input
                  id="pctIncrease"
                  type="number"
                  step="0.1"
                  min="-50"
                  max="100"
                  value={pctIncrease}
                  onChange={(e) => setPctIncrease(e.target.value)}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  Enter a percentage increase (e.g. 3 for 3%) to apply to all copied amounts.
                  Use negative values for a decrease.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Budget'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
