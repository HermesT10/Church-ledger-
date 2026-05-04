import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  approveTransactionAction,
  confirmTransactionMatchAction,
  getTransactionDetail,
  postTransactionAction,
  rejectTransactionAction,
  submitTransactionAction,
  suggestBankMatchesForManualTransaction,
  uploadTransactionAttachmentAction,
  voidTransactionAction,
  removeTransactionAttachmentAction,
  attachmentAccessUrl,
} from '@/lib/transactions/actions';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/page-header';
import { PageShell } from '@/components/page-shell';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function pounds(pence: number): string {
  return '£' + (Math.abs(pence) / 100).toFixed(2);
}

function dateLabel(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default async function TransactionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { data } = await getTransactionDetail(id);
  if (!data) notFound();

  const { transaction, lines, attachments, matches, audit } = data;
  const suggestions = transaction.requires_bank_match && !transaction.matched_bank_transaction_id && !transaction.posted_journal_id
    ? await suggestBankMatchesForManualTransaction(id)
    : { data: [], error: null };

  const supabase = await createClient();
  const accountIds = [...new Set(lines.map((line) => line.account_id))];
  const fundIds = [...new Set(lines.map((line) => line.fund_id).filter(Boolean) as string[])];
  const [accountsRes, fundsRes] = await Promise.all([
    accountIds.length ? supabase.from('accounts').select('id, code, name').in('id', accountIds) : Promise.resolve({ data: [] }),
    fundIds.length ? supabase.from('funds').select('id, name').in('id', fundIds) : Promise.resolve({ data: [] }),
  ]);
  const accountMap = new Map((accountsRes.data ?? []).map((a: any) => [a.id, `${a.code} - ${a.name}`]));
  const fundMap = new Map((fundsRes.data ?? []).map((f: any) => [f.id, f.name as string]));
  const attachmentsWithUrls = await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      url: await attachmentAccessUrl(attachment.file_path),
    })),
  );

  return (
    <PageShell>
      <PageHeader
        title={transaction.description}
        subtitle={`${transaction.type} transaction for ${pounds(transaction.amount_pence)} on ${dateLabel(transaction.transaction_date)}`}
        actions={<Button asChild variant="outline"><Link href="/transactions">Back to Transactions</Link></Button>}
      />

      {sp.error ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{sp.error}</div> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div><p className="text-sm text-muted-foreground">Status</p><StatusBadge status={transaction.status} /></div>
            <div><p className="text-sm text-muted-foreground">Amount</p><p className="text-lg font-semibold">{pounds(transaction.amount_pence)}</p></div>
            <div><p className="text-sm text-muted-foreground">Payee / payer</p><p>{transaction.payee_payer_name ?? '-'}</p></div>
            <div><p className="text-sm text-muted-foreground">Reference</p><p>{transaction.reference ?? '-'}</p></div>
            <div><p className="text-sm text-muted-foreground">Payment method</p><p>{transaction.payment_method ?? '-'}</p></div>
            <div><p className="text-sm text-muted-foreground">Bank match required</p><p>{transaction.requires_bank_match ? 'Yes' : 'No'}</p></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {transaction.status === 'draft' ? (
              <form action={submitTransactionAction}><input type="hidden" name="id" value={id} /><Button className="w-full">Submit</Button></form>
            ) : null}
            {transaction.status === 'submitted' ? (
              <>
                <form action={approveTransactionAction}><input type="hidden" name="id" value={id} /><Button className="w-full">Approve</Button></form>
                <form action={rejectTransactionAction} className="space-y-2"><input type="hidden" name="id" value={id} /><Input name="reason" placeholder="Rejection reason" /><Button variant="outline" className="w-full">Reject</Button></form>
              </>
            ) : null}
            {(transaction.status === 'matched' || (transaction.status === 'approved' && !transaction.requires_bank_match)) && !transaction.posted_journal_id ? (
              <form action={postTransactionAction}><input type="hidden" name="id" value={id} /><Button className="w-full">Post to Ledger</Button></form>
            ) : null}
            {!transaction.posted_journal_id && transaction.status !== 'voided' ? (
              <form action={voidTransactionAction} className="space-y-2"><input type="hidden" name="id" value={id} /><Input name="reason" placeholder="Void reason" /><Button variant="destructive" className="w-full">Void</Button></form>
            ) : null}
            {transaction.posted_journal_id ? (
              <Button asChild variant="outline" className="w-full"><Link href={`/journals/${transaction.posted_journal_id}`}>View Posted Journal</Link></Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Lines</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Direction</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell><Badge variant="secondary">{line.direction}</Badge></TableCell>
                  <TableCell>{line.fund_id ? fundMap.get(line.fund_id) ?? line.fund_id : '-'}</TableCell>
                  <TableCell>{accountMap.get(line.account_id) ?? line.account_id}</TableCell>
                  <TableCell>{line.description ?? '-'}</TableCell>
                  <TableCell className="text-right">{pounds(line.amount_pence)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Attachments</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form action={uploadTransactionAttachmentAction} className="space-y-3">
              <input type="hidden" name="manual_transaction_id" value={id} />
              <div className="space-y-1.5">
                <Label>Upload receipt or document</Label>
                <Input type="file" name="file" />
              </div>
              <Button type="submit" variant="outline">Attach Receipt</Button>
            </form>
            <div className="space-y-2">
              {attachments.length === 0 ? <p className="text-sm text-muted-foreground">No attachments yet.</p> : null}
              {attachmentsWithUrls.map((attachment) => (
                <div key={attachment.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <a href={attachment.url} className="font-medium underline">{attachment.file_name}</a>
                  <form action={removeTransactionAttachmentAction}>
                    <input type="hidden" name="manual_transaction_id" value={id} />
                    <input type="hidden" name="attachment_id" value={attachment.id} />
                    <Button size="sm" variant="ghost">Remove</Button>
                  </form>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Bank Match</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {transaction.matched_bank_transaction_id ? (
              <p className="text-sm">Matched to bank line <code>{transaction.matched_bank_transaction_id}</code>.</p>
            ) : suggestions.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suggested bank matches yet.</p>
            ) : (
              suggestions.data.map((suggestion) => (
                <div key={suggestion.bank_line_id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{suggestion.bank_description ?? suggestion.bank_reference ?? 'Bank line'}</p>
                      <p className="text-muted-foreground">{dateLabel(suggestion.bank_txn_date)} · {pounds(suggestion.bank_amount_pence)} · {suggestion.match_reason}</p>
                    </div>
                    <Badge variant="secondary">{suggestion.confidence_label}</Badge>
                  </div>
                  <form action={confirmTransactionMatchAction} className="mt-3">
                    <input type="hidden" name="manual_transaction_id" value={id} />
                    <input type="hidden" name="bank_line_id" value={suggestion.bank_line_id} />
                    <Button size="sm">Confirm Match</Button>
                  </form>
                </div>
              ))
            )}
            {matches.map((match) => (
              <div key={match.id} className="rounded-lg border p-2 text-xs text-muted-foreground">
                {match.match_status} · {match.confidence_label} · {match.match_reason}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Audit History</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {audit.length === 0 ? <p className="text-sm text-muted-foreground">No audit events yet.</p> : null}
          {audit.map((event) => (
            <div key={`${event.action}-${event.created_at}`} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{event.action}</p>
              <p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString('en-GB')}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </PageShell>
  );
}
