import type { ComponentType, ReactNode } from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';

const PdfDocument = Document as unknown as ComponentType<{ title?: string; children: ReactNode }>;
const PdfPage = Page as unknown as ComponentType<{ size?: string; style?: unknown; children: ReactNode }>;
const PdfText = Text as unknown as ComponentType<{ style?: unknown; children?: ReactNode }>;
const PdfView = View as unknown as ComponentType<{ style?: unknown; children: ReactNode }>;

export type ReceivableInvoicePdfData = {
  church: {
    name: string;
    charityNumber?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  customer: {
    name: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  invoice: {
    number: string;
    date: string;
    dueDate?: string | null;
    status: string;
    notes?: string | null;
    message?: string | null;
  };
  lines: {
    description: string;
    fundName: string;
    accountName: string;
    amountPence: number;
  }[];
  paymentInstructions?: string | null;
};

const styles = StyleSheet.create({
  page: {
    padding: 42,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111827',
    lineHeight: 1.35,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
  },
  muted: {
    color: '#6b7280',
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 6,
    textTransform: 'uppercase',
    color: '#374151',
  },
  row: {
    flexDirection: 'row',
    borderBottom: '1 solid #e5e7eb',
    paddingVertical: 7,
  },
  tableHead: {
    backgroundColor: '#f3f4f6',
    fontWeight: 700,
  },
  descCol: {
    flexGrow: 1,
    flexBasis: 0,
    paddingRight: 8,
  },
  smallCol: {
    width: 90,
    paddingRight: 8,
  },
  amountCol: {
    width: 80,
    textAlign: 'right',
  },
  total: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    fontSize: 13,
    fontWeight: 700,
  },
  watermark: {
    position: 'absolute',
    top: 280,
    left: 120,
    fontSize: 64,
    color: '#d1d5db',
    opacity: 0.25,
    transform: 'rotate(-28deg)',
  },
});

function money(pence: number) {
  return `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function date(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB');
}

function AddressBlock({ title, lines }: { title: string; lines: Array<string | null | undefined> }) {
  return (
    <PdfView style={styles.section}>
      <PdfText style={styles.sectionTitle}>{title}</PdfText>
      {lines.filter(Boolean).map((line) => (
        <PdfText key={line}>{line}</PdfText>
      ))}
    </PdfView>
  );
}

function InvoiceDocument({ data }: { data: ReceivableInvoicePdfData }) {
  const total = data.lines.reduce((sum, line) => sum + line.amountPence, 0);
  const isDraft = data.invoice.status === 'draft';

  return (
    <PdfDocument title={`Invoice ${data.invoice.number}`}>
      <PdfPage size="A4" style={styles.page}>
        {isDraft && <PdfText style={styles.watermark}>DRAFT</PdfText>}
        <PdfView style={styles.header}>
          <PdfView>
            <PdfText style={styles.title}>Invoice</PdfText>
            <PdfText>Invoice number: {data.invoice.number}</PdfText>
            <PdfText>Invoice date: {date(data.invoice.date)}</PdfText>
            <PdfText>Due date: {date(data.invoice.dueDate)}</PdfText>
            <PdfText>Status: {data.invoice.status.replaceAll('_', ' ')}</PdfText>
          </PdfView>
          <PdfView>
            <PdfText style={{ fontSize: 16, fontWeight: 700 }}>{data.church.name}</PdfText>
            {data.church.charityNumber && <PdfText>Charity no. {data.church.charityNumber}</PdfText>}
            {data.church.address && <PdfText>{data.church.address}</PdfText>}
            {data.church.email && <PdfText>{data.church.email}</PdfText>}
            {data.church.phone && <PdfText>{data.church.phone}</PdfText>}
          </PdfView>
        </PdfView>

        <AddressBlock
          title="Billed to"
          lines={[
            data.customer.name,
            data.customer.contactName,
            data.customer.address,
            data.customer.email,
            data.customer.phone,
          ]}
        />

        {data.invoice.message && (
          <PdfView style={styles.section}>
            <PdfText style={styles.sectionTitle}>Message</PdfText>
            <PdfText>{data.invoice.message}</PdfText>
          </PdfView>
        )}

        <PdfView style={styles.section}>
          <PdfView style={[styles.row, styles.tableHead]}>
            <PdfText style={styles.descCol}>Description</PdfText>
            <PdfText style={styles.smallCol}>Fund</PdfText>
            <PdfText style={styles.smallCol}>Account</PdfText>
            <PdfText style={styles.amountCol}>Amount</PdfText>
          </PdfView>
          {data.lines.map((line, index) => (
            <PdfView key={`${line.description}-${index}`} style={styles.row}>
              <PdfText style={styles.descCol}>{line.description || 'Invoice line'}</PdfText>
              <PdfText style={styles.smallCol}>{line.fundName}</PdfText>
              <PdfText style={styles.smallCol}>{line.accountName}</PdfText>
              <PdfText style={styles.amountCol}>{money(line.amountPence)}</PdfText>
            </PdfView>
          ))}
          <PdfView style={styles.total}>
            <PdfText>Total: {money(total)}</PdfText>
          </PdfView>
        </PdfView>

        <PdfView style={styles.section}>
          <PdfText style={styles.sectionTitle}>Payment instructions</PdfText>
          <PdfText>{data.paymentInstructions || 'Please pay using the reference shown on this invoice.'}</PdfText>
        </PdfView>

        {data.invoice.notes && (
          <PdfView style={styles.section}>
            <PdfText style={styles.sectionTitle}>Notes</PdfText>
            <PdfText style={styles.muted}>{data.invoice.notes}</PdfText>
          </PdfView>
        )}
      </PdfPage>
    </PdfDocument>
  );
}

export async function renderReceivableInvoicePdf(data: ReceivableInvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />);
}
