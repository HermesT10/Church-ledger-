import { NextResponse } from 'next/server';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const { orgId } = await getActiveOrg();
  const { searchParams } = new URL(request.url);
  const bankAccountId = searchParams.get('bankAccountId');
  const supabase = await createClient();

  let query = supabase
    .from('bank_lines')
    .select('txn_date, description, reference, amount_pence, balance_pence, status, allocated, reconciled')
    .eq('organisation_id', orgId)
    .order('txn_date', { ascending: false })
    .limit(5000);

  if (bankAccountId) {
    query = query.eq('bank_account_id', bankAccountId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lines = [
    ['date', 'description', 'reference', 'money_in', 'money_out', 'balance', 'status', 'allocated', 'reconciled']
      .map(csvEscape)
      .join(','),
    ...(data ?? []).map((line) => {
      const amountPence = Number(line.amount_pence ?? 0);
      return [
        line.txn_date,
        line.description,
        line.reference,
        amountPence > 0 ? (amountPence / 100).toFixed(2) : '',
        amountPence < 0 ? (Math.abs(amountPence) / 100).toFixed(2) : '',
        line.balance_pence == null ? '' : (Number(line.balance_pence) / 100).toFixed(2),
        line.status,
        line.allocated ? 'yes' : 'no',
        line.reconciled ? 'yes' : 'no',
      ].map(csvEscape).join(',');
    }),
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="bank-transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
