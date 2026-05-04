import type { ComponentType, ReactNode } from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { DonorStatementComputedRow } from './donor-statement-rows';

const PdfDocument = Document as unknown as ComponentType<{
  title?: string;
  children: ReactNode;
}>;
const PdfPage = Page as unknown as ComponentType<{
  size?: string;
  style?: unknown;
  children: ReactNode;
}>;
const PdfText = Text as unknown as ComponentType<{
  style?: unknown;
  children?: ReactNode;
}>;
const PdfView = View as unknown as ComponentType<{
  style?: unknown;
  children: ReactNode;
}>;

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#111827',
  },
  h1: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 11, marginTop: 12, marginBottom: 6, fontWeight: 700 },
  muted: { color: '#6b7280', fontSize: 8, marginBottom: 14 },
  block: { marginBottom: 8, lineHeight: 1.4 },
  addr: { marginTop: 4, lineHeight: 1.45 },
  row: {
    flexDirection: 'row',
    borderBottom: '1 solid #e5e7eb',
    paddingVertical: 4,
  },
  hdr: {
    backgroundColor: '#f3f4f6',
    fontWeight: 700,
  },
  cell: { paddingHorizontal: 4 },
  cd: { width: '17%' },
  camt: { width: '13%' },
  cfund: { width: '20%' },
  csrc: { width: '20%' },
  cga: { width: '30%' },
  totals: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 24,
    marginTop: 12,
  },
  totalBox: { alignItems: 'flex-end' },
  totalLabel: { color: '#6b7280', fontSize: 8 },
  totalVal: { fontSize: 12, fontWeight: 700 },
  disclaimer: {
    marginTop: 20,
    padding: 10,
    border: '1 solid #d1d5db',
    borderRadius: 4,
    fontSize: 7,
    color: '#4b5563',
    lineHeight: 1.45,
  },
});

function pounds(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export interface DonorStatementPdfCharityProps {
  displayName: string;
  charityNumber: string | null;
  lines: string[];
  contactEmail: string | null;
}

function DonorStatementPdfDoc({
  donorName,
  donorAddressLines,
  periodLabel,
  periodStart,
  periodEnd,
  charity,
  rows,
  totalDonationsPence,
  totalGiftAidPence,
}: {
  donorName: string;
  donorAddressLines: string[];
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  charity: DonorStatementPdfCharityProps;
  rows: DonorStatementComputedRow[];
  totalDonationsPence: number;
  totalGiftAidPence: number;
}) {
  const pages = chunk(rows, 32);

  const tableHeader = (
    <PdfView style={[styles.row, styles.hdr]}>
      <PdfText style={[styles.cell, styles.cd]}>Date</PdfText>
      <PdfText style={[styles.cell, styles.camt]}>Amount</PdfText>
      <PdfText style={[styles.cell, styles.cfund]}>Fund</PdfText>
      <PdfText style={[styles.cell, styles.csrc]}>Source</PdfText>
      <PdfText style={[styles.cell, styles.cga]}>Gift Aid</PdfText>
    </PdfView>
  );

  const headerBlock = (
    <>
      <PdfText style={styles.h1}>Annual giving statement</PdfText>
      <PdfText style={styles.muted}>
        Issued by {charity.displayName}
        {charity.charityNumber ? ` · Charity registration ${charity.charityNumber}` : ''}.
        Document for donor records — not HMRC evidence.
      </PdfText>

      <PdfText style={styles.h2}>{charity.displayName}</PdfText>
      {charity.lines.map((ln, i) => (
        <PdfText key={i} style={styles.block}>
          {ln}
        </PdfText>
      ))}
      {charity.contactEmail ? (
        <PdfText style={styles.block}>Email: {charity.contactEmail}</PdfText>
      ) : null}

      <PdfText style={styles.h2}>{donorName}</PdfText>
      {donorAddressLines.filter(Boolean).length > 0 ? (
        <PdfView style={styles.addr}>
          {donorAddressLines.filter(Boolean).map((ln, i) => (
            <PdfText key={i}>{ln}</PdfText>
          ))}
        </PdfView>
      ) : (
        <PdfText style={styles.block}>Address (optional / not supplied)</PdfText>
      )}

      <PdfText style={styles.h2}>Period covered</PdfText>
      <PdfText style={styles.block}>
        {periodLabel} ({periodStart} to {periodEnd})
      </PdfText>

      <PdfText style={styles.h2}>Donations detail</PdfText>

      {tableHeader}
    </>
  );

  const footerTotals = (
    <>
      <PdfView style={styles.totals}>
        <PdfView style={styles.totalBox}>
          <PdfText style={styles.totalLabel}>Total donations</PdfText>
          <PdfText style={styles.totalVal}>{pounds(totalDonationsPence)}</PdfText>
        </PdfView>
        <PdfView style={styles.totalBox}>
          <PdfText style={styles.totalLabel}>Total Gift Aid (25% of eligible)</PdfText>
          <PdfText style={styles.totalVal}>{pounds(totalGiftAidPence)}</PdfText>
        </PdfView>
      </PdfView>

      <PdfText style={styles.disclaimer}>
        Disclaimer: This statement summarises gifts recorded in Church Ledger for the period shown. It is
        provided to help you keep personal records. It is not a tax certificate. Gift Aid treatment depends
        on valid declarations and HMRC rules in force at the time. If anything looks wrong, contact the
        charity office. No warranty is given as to completeness or accuracy beyond our records.
      </PdfText>
    </>
  );

  if (pages.length === 0) {
    return (
      <PdfDocument title="Annual giving statement">
        <PdfPage size="A4" style={styles.page}>
          {headerBlock}
          <PdfText style={styles.block}>No posted donations in this period.</PdfText>
          {footerTotals}
        </PdfPage>
      </PdfDocument>
    );
  }

  return (
    <PdfDocument title="Annual giving statement">
      {pages.map((slice, pi) => (
        <PdfPage key={pi} size="A4" style={styles.page}>
          {pi === 0 ? headerBlock : (
            <>
              <PdfText style={styles.h1}>Annual giving statement (continued)</PdfText>
              <PdfText style={styles.muted}>{periodLabel}</PdfText>
              {tableHeader}
            </>
          )}
          {slice.map((r, index) => (
            <PdfView key={`${r.donation_date}-${index}`} style={styles.row}>
              <PdfText style={[styles.cell, styles.cd]}>{r.donation_date}</PdfText>
              <PdfText style={[styles.cell, styles.camt]}>{pounds(r.amount_pence)}</PdfText>
              <PdfText style={[styles.cell, styles.cfund]}>{r.fund_name}</PdfText>
              <PdfText style={[styles.cell, styles.csrc]}>{r.source_label}</PdfText>
              <PdfText style={[styles.cell, styles.cga]}>{r.gift_aid_label}</PdfText>
            </PdfView>
          ))}
          {pi === pages.length - 1 ? (
            <>
              {rows.length > 32 ? (
                <PdfText style={styles.muted}>
                  Showing {rows.length} donation line(s) across {pages.length} page(s).
                </PdfText>
              ) : null}
              {footerTotals}
            </>
          ) : null}
        </PdfPage>
      ))}
    </PdfDocument>
  );
}

export async function renderDonorStatementPdf(params: {
  donorName: string;
  donorAddressLines: string[];
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  charity: DonorStatementPdfCharityProps;
  rows: DonorStatementComputedRow[];
  totalDonationsPence: number;
  totalGiftAidPence: number;
}): Promise<Buffer> {
  return renderToBuffer(
    <DonorStatementPdfDoc
      donorName={params.donorName}
      donorAddressLines={params.donorAddressLines}
      periodLabel={params.periodLabel}
      periodStart={params.periodStart}
      periodEnd={params.periodEnd}
      charity={params.charity}
      rows={params.rows}
      totalDonationsPence={params.totalDonationsPence}
      totalGiftAidPence={params.totalGiftAidPence}
    />,
  );
}
