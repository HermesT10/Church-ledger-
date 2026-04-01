'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { postCashSpend, uploadCashReceipt } from '@/lib/cash/actions';
import { toast } from 'sonner';
import { FileText, ArrowLeft, Upload, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function formatDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function formatPounds(p: number) { return '£' + (p / 100).toFixed(2); }

interface Props {
  spend: {
    id: string;
    spend_date: string;
    paid_to: string;
    spent_by: string;
    description: string;
    receipt_url: string | null;
    fund_name: string;
    expense_account_name: string;
    amount_pence: number;
    status: 'draft' | 'posted';
    posted_transaction_id: string | null;
  };
  canEdit: boolean;
  isAdmin: boolean;
}

export function SpendDetailClient({ spend, canEdit, isAdmin }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showOverride, setShowOverride] = useState(false);

  const handlePost = (override: boolean = false) => {
    startTransition(async () => {
      const { success, error, balanceWarning } = await postCashSpend(spend.id, override);
      if (balanceWarning && !override) {
        if (isAdmin) {
          setShowOverride(true);
          toast.error(error);
        } else {
          toast.error(error);
        }
        return;
      }
      if (error) { toast.error(error); return; }
      if (success) {
        toast.success('Spend posted. GL entries created.');
        setShowOverride(false);
        router.refresh();
      }
    });
  };

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    startTransition(async () => {
      const { error } = await uploadCashReceipt(formData, spend.id);
      if (error) { toast.error(error); return; }
      toast.success('Receipt uploaded.');
      router.refresh();
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="app-surface">
        <CardHeader><CardTitle className="text-base">Cash Spend Details</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div><p className="text-muted-foreground">Date</p><p className="font-medium">{formatDate(spend.spend_date)}</p></div>
            <div><p className="text-muted-foreground">Amount</p><p className="font-medium text-lg">{formatPounds(spend.amount_pence)}</p></div>
            <div><p className="text-muted-foreground">Paid To</p><p className="font-medium">{spend.paid_to}</p></div>
            <div><p className="text-muted-foreground">Spent By</p><p className="font-medium">{spend.spent_by}</p></div>
            <div className="col-span-2"><p className="text-muted-foreground">Description</p><p className="font-medium">{spend.description}</p></div>
            <div><p className="text-muted-foreground">Fund</p><p className="font-medium">{spend.fund_name}</p></div>
            <div><p className="text-muted-foreground">Expense Account</p><p className="font-medium">{spend.expense_account_name}</p></div>
            <div><p className="text-muted-foreground">Status</p><Badge variant={spend.status === 'posted' ? 'default' : 'outline'}>{spend.status === 'posted' ? 'Posted' : 'Draft'}</Badge></div>
            <div>
              <p className="text-muted-foreground">Receipt</p>
              {spend.receipt_url ? (
                <a href={spend.receipt_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">View Receipt</a>
              ) : (
                <span className="text-sm text-muted-foreground">None</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Admin override warning */}
      {showOverride && isAdmin && (
        <Card className="border-amber-200 bg-amber-100/75">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Cash-in-Hand will go negative</p>
              <p className="text-xs text-amber-600 mt-1">As an admin, you can override this restriction.</p>
              <Button size="sm" className="mt-2" onClick={() => handlePost(true)} disabled={isPending}>
                {isPending ? 'Posting…' : 'Override and Post'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="app-surface">
        <CardHeader><CardTitle className="text-base">Actions</CardTitle></CardHeader>
        <CardContent className="app-toolbar">
          {spend.status === 'draft' && canEdit && (
            <Button onClick={() => handlePost(false)} disabled={isPending}>
              {isPending ? 'Posting…' : 'Post Spend'}
            </Button>
          )}
          {spend.posted_transaction_id && (
            <Button asChild variant="outline">
              <Link href={`/journal/${spend.posted_transaction_id}`}><FileText size={14} className="mr-1" /> View Journal</Link>
            </Button>
          )}

          {/* Receipt upload (always allowed) */}
          <div className="flex items-center gap-2">
            <Label htmlFor="receipt_upload" className="cursor-pointer">
              <span className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm transition-colors hover:bg-muted">
                <Upload size={14} /> Upload Receipt
              </span>
            </Label>
            <Input id="receipt_upload" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleUploadReceipt} className="hidden" />
          </div>

          <Button asChild variant="outline">
            <Link href="/cash/spends"><ArrowLeft size={14} className="mr-1" /> Back</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
