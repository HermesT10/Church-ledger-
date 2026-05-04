import { NextResponse } from 'next/server';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { renderReceivableInvoicePdf, type ReceivableInvoicePdfData } from '@/lib/invoices/receivable-pdf';

function invoiceNumber(row: { invoice_number: string | null; id: string }) {
  return row.invoice_number || `RI-${row.id.slice(0, 8).toUpperCase()}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { orgId } = await getActiveOrg();
  const { invoiceId } = await params;
  const supabase = await createClient();

  const [{ data: invoice, error: invoiceError }, { data: org }] = await Promise.all([
    supabase
      .from('receivable_invoices')
      .select('id, invoice_number, invoice_date, due_date, status, notes, message, total_pence, lettings_hirers(name, contact_name, email, phone, address)')
      .eq('organisation_id', orgId)
      .eq('id', invoiceId)
      .single(),
    supabase
      .from('organisations')
      .select('name, legal_name, charity_number, address_line1, address_line2, county, postcode, contact_email, contact_phone')
      .eq('id', orgId)
      .single(),
  ]);

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: invoiceError?.message ?? 'Invoice not found.' }, { status: 404 });
  }

  const { data: lines, error: lineError } = await supabase
    .from('receivable_invoice_lines')
    .select('description, amount_pence, accounts(name), funds(name)')
    .eq('invoice_id', invoiceId)
    .order('created_at');

  if (lineError) {
    return NextResponse.json({ error: lineError.message }, { status: 500 });
  }

  const customer = Array.isArray(invoice.lettings_hirers)
    ? invoice.lettings_hirers[0]
    : invoice.lettings_hirers;
  const orgAddress = [
    org?.address_line1,
    org?.address_line2,
    org?.county,
    org?.postcode,
  ].filter(Boolean).join(', ');

  const data: ReceivableInvoicePdfData = {
    church: {
      name: org?.legal_name || org?.name || 'Church',
      charityNumber: org?.charity_number ?? null,
      address: orgAddress || null,
      email: org?.contact_email ?? null,
      phone: org?.contact_phone ?? null,
    },
    customer: {
      name: customer?.name ?? 'Customer',
      contactName: customer?.contact_name ?? null,
      email: customer?.email ?? null,
      phone: customer?.phone ?? null,
      address: customer?.address ?? null,
    },
    invoice: {
      number: invoiceNumber(invoice),
      date: invoice.invoice_date,
      dueDate: invoice.due_date,
      status: invoice.status,
      notes: invoice.notes,
      message: invoice.message,
    },
    lines: (lines ?? []).map((line) => {
      const account = Array.isArray(line.accounts) ? line.accounts[0] : line.accounts;
      const fund = Array.isArray(line.funds) ? line.funds[0] : line.funds;
      return {
        description: line.description ?? 'Invoice line',
        accountName: account?.name ?? 'Income',
        fundName: fund?.name ?? 'Fund',
        amountPence: Number(line.amount_pence ?? 0),
      };
    }),
    paymentInstructions: 'Please pay by bank transfer and use the invoice number as your payment reference.',
  };

  const pdf = await renderReceivableInvoicePdf(data);
  const filename = `invoice-${data.invoice.number}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
