import { NextResponse } from 'next/server';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';

function money(pence: number | null | undefined): string {
  if (pence == null) return '-';
  const sign = pence < 0 ? '-' : '';
  return `${sign}GBP ${(Math.abs(pence) / 100).toFixed(2)}`;
}

function escapePdfText(value: unknown): string {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function buildSimplePdf(lines: string[]): Uint8Array {
  const content = [
    'BT',
    '/F1 18 Tf',
    '50 790 Td',
    ...lines.flatMap((line, index) => [
      index === 0 ? `(${escapePdfText(line)}) Tj` : `0 -22 Td (${escapePdfText(line)}) Tj`,
      index === 0 ? '/F1 11 Tf' : '',
    ]).filter(Boolean),
    'ET',
  ].join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(content)} >> stream\n${content}\nendstream endobj`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ certificateId: string }> },
) {
  const { orgId } = await getActiveOrg();
  const { certificateId } = await params;
  const supabase = await createClient();
  const { data: certificate, error } = await supabase
    .from('bank_reconciliation_certificates')
    .select('*, bank_accounts(name)')
    .eq('id', certificateId)
    .eq('workspace_id', orgId)
    .maybeSingle();

  if (error || !certificate) {
    return NextResponse.json({ error: error?.message ?? 'Certificate not found.' }, { status: 404 });
  }

  const bankAccountName = (certificate.bank_accounts as { name?: string } | null)?.name ?? 'Bank account';
  const pdf = buildSimplePdf([
    'Bank Reconciliation Certificate',
    `Certificate: ${certificate.certificate_number}`,
    `Bank account: ${bankAccountName}`,
    `Statement period: ${certificate.statement_period_start ?? '-'} to ${certificate.statement_period_end}`,
    `Closing bank balance: ${money(Number(certificate.closing_bank_balance_pence ?? 0))}`,
    `Book balance: ${money(Number(certificate.book_balance_pence ?? 0))}`,
    `Difference: ${money(Number(certificate.difference_pence ?? 0))}`,
    `Reconciled transactions: ${certificate.reconciled_transaction_count ?? 0}`,
    `Unreconciled exceptions: ${certificate.unreconciled_exception_count ?? 0}`,
    `Reconciled by: ${certificate.generated_by ?? '-'}`,
    `Reconciled at: ${certificate.generated_at}`,
  ]);
  const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;

  return new Response(body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="reconciliation-certificate-${certificate.certificate_number}.pdf"`,
    },
  });
}
