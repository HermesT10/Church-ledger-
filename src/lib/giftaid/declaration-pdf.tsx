import type { ComponentType, ReactNode } from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import {
  GIFT_AID_DECLARATION_WORDING,
  GIFT_AID_DONOR_NOTIFICATION_NOTES,
  type GiftAidDeclarationFormData,
} from './declaration-form';

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
    padding: 42,
    fontSize: 11,
    fontFamily: 'Helvetica',
    color: '#111827',
    lineHeight: 1.35,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 11,
    color: '#4b5563',
    marginBottom: 18,
  },
  section: {
    border: '1 solid #d1d5db',
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  field: {
    flexGrow: 1,
    flexBasis: 0,
  },
  label: {
    fontSize: 8,
    color: '#6b7280',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  value: {
    borderBottom: '1 solid #9ca3af',
    paddingBottom: 3,
    minHeight: 16,
  },
  wording: {
    fontSize: 10,
    marginBottom: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 12,
    height: 12,
    border: '1 solid #111827',
    textAlign: 'center',
    fontSize: 9,
  },
  footer: {
    marginTop: 16,
    fontSize: 9,
    color: '#6b7280',
  },
});

function pounds(value: number | null | undefined) {
  if (!value) return '';
  return `£${(value / 100).toFixed(2)}`;
}

function date(value: string | null | undefined) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <PdfView style={styles.field}>
      <PdfText style={styles.label}>{label}</PdfText>
      <PdfText style={styles.value}>{value ?? ''}</PdfText>
    </PdfView>
  );
}

function GiftAidDeclarationDocument({
  declaration,
  evidence,
}: {
  declaration: GiftAidDeclarationFormData;
  evidence?: {
    eSignatureName?: string | null;
    submittedAt?: string | null;
    textVersion?: string | null;
  };
}) {
  return (
    <PdfDocument title="Gift Aid declaration">
      <PdfPage size="A4" style={styles.page}>
        <PdfText style={styles.title}>Gift Aid declaration for a single donation</PdfText>
        <PdfText style={styles.subtitle}>
          Complete this form so the charity can reclaim Gift Aid from HMRC.
        </PdfText>

        <PdfView style={styles.section}>
          <PdfText style={styles.sectionTitle}>Donation details</PdfText>
          <PdfView style={styles.row}>
            <Field label="Donation amount" value={pounds(declaration.donationAmountPence)} />
            <Field label="Charity name" value={declaration.charityName} />
          </PdfView>
          <PdfView style={styles.row}>
            <Field label="Date" value={date(declaration.signedDate)} />
          </PdfView>
        </PdfView>

        <PdfView style={styles.section}>
          <PdfText style={styles.sectionTitle}>Donor details</PdfText>
          <PdfView style={styles.row}>
            <Field label="Title" value={declaration.donorTitle} />
            <Field
              label="First name or initials"
              value={declaration.donorFirstNameOrInitial}
            />
            <Field label="Surname" value={declaration.donorSurname} />
          </PdfView>
          <PdfView style={styles.row}>
            <Field label="Full home address" value={declaration.donorFullHomeAddress} />
          </PdfView>
          <PdfView style={styles.row}>
            <Field label="Postcode" value={declaration.donorPostcode} />
          </PdfView>
        </PdfView>

        <PdfView style={styles.section}>
          <PdfText style={styles.sectionTitle}>Gift Aid declaration</PdfText>
          <PdfText style={styles.wording}>
            {declaration.declarationWording || GIFT_AID_DECLARATION_WORDING}
          </PdfText>
          <PdfView style={styles.checkboxRow}>
            <PdfText style={styles.checkbox}>
              {declaration.taxpayerConfirmation ? 'X' : ''}
            </PdfText>
            <PdfText>
              I confirm I am a UK taxpayer and want this donation treated as a
              Gift Aid donation.
            </PdfText>
          </PdfView>
        </PdfView>

        <PdfView style={styles.section}>
          <PdfText style={styles.sectionTitle}>Donor notification notes</PdfText>
          <PdfText>
            {declaration.donorNotificationNotes || GIFT_AID_DONOR_NOTIFICATION_NOTES}
          </PdfText>
        </PdfView>

        {evidence ? (
          <PdfView style={styles.section}>
            <PdfText style={styles.sectionTitle}>E-signature evidence</PdfText>
            <PdfView style={styles.row}>
              <Field label="Typed signature" value={evidence.eSignatureName} />
              <Field label="Submitted at" value={date(evidence.submittedAt)} />
            </PdfView>
            <PdfView style={styles.row}>
              <Field label="Declaration text version" value={evidence.textVersion} />
            </PdfView>
          </PdfView>
        ) : null}

        <PdfText style={styles.footer}>
          Generated by Church Ledger. Store this declaration with the donor record.
        </PdfText>
      </PdfPage>
    </PdfDocument>
  );
}

export async function renderGiftAidDeclarationPdf(
  declaration: GiftAidDeclarationFormData,
  evidence?: {
    eSignatureName?: string | null;
    submittedAt?: string | null;
    textVersion?: string | null;
  }
) {
  return renderToBuffer(
    <GiftAidDeclarationDocument declaration={declaration} evidence={evidence} />
  );
}
