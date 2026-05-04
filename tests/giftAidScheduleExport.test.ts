import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  HMRC_GIFT_AID_SCHEDULE_COLUMNS,
  buildGiftAidScheduleCsv,
  buildGiftAidScheduleFileName,
  buildGiftAidSchedulePreview,
  buildGiftAidScheduleRows,
  buildGiftAidScheduleWorkbookBuffer,
  calculateGiftAidScheduleChecksum,
  readGiftAidScheduleOdsTemplateBuffer,
  validateGiftAidSchedule,
} from '@/lib/giftaid/export-schedule';
import { CLAIM_ITEM_GASDS } from '@/lib/giftaid/gasds';

describe('Gift Aid schedule export helpers', () => {
  it('builds HMRC schedule rows in the expected field order', () => {
    const result = buildGiftAidScheduleRows([
      {
        donationId: 'donation-1',
        title: 'Mrs',
        firstNameOrInitial: 'Jane',
        lastName: 'Smith',
        houseNameOrNumber: '1',
        postcode: 'ab12cd',
        donationDate: '2026-04-01',
        donationAmountPence: 2500,
      },
    ]);

    expect(result.issues).toHaveLength(0);
    expect(result.rows).toEqual([
      {
        title: 'Mrs',
        firstNameOrInitial: 'Jane',
        lastName: 'Smith',
        houseNameOrNumber: '1',
        postcode: 'AB1 2CD',
        aggregatedDonations: '',
        sponsoredEvent: '',
        donationDate: '01/04/26',
        amount: '25.00',
      },
    ]);
  });

  it('reports missing required fields and blocks row creation', () => {
    const result = buildGiftAidScheduleRows([
      {
        donationId: 'donation-2',
        title: '',
        firstNameOrInitial: null,
        lastName: 'Smith',
        houseNameOrNumber: null,
        postcode: '',
        donationDate: '2026-04-01',
        donationAmountPence: 2500,
      },
    ]);

    expect(result.rows).toHaveLength(0);
    expect(result.issues.map((issue) => issue.field)).toEqual([
      'title',
      'firstNameOrInitial',
      'houseNameOrNumber',
      'postcode',
    ]);
  });

  it('renders the worksheet header and row layout as CSV', () => {
    const csv = buildGiftAidScheduleCsv([
      {
        title: 'Mrs',
        firstNameOrInitial: 'Jane',
        lastName: 'Smith',
        houseNameOrNumber: '10 High Street, Flat 2',
        postcode: 'AB1 2CD',
        aggregatedDonations: '',
        sponsoredEvent: '',
        donationDate: '01/04/26',
        amount: '25.00',
      },
    ]);

    const lines = csv.split('\n');
    expect(lines[0]).toBe(HMRC_GIFT_AID_SCHEDULE_COLUMNS.join(','));
    expect(lines[1]).toContain('"10 High Street, Flat 2"');
  });

  it('generates stable file names and checksums', () => {
    const fileName = buildGiftAidScheduleFileName({
      claimId: '12345678-90ab-cdef-1234-567890abcdef',
      exportedAt: new Date('2026-04-01T10:00:00.000Z'),
    });

    expect(fileName).toBe('gift-aid-schedule-12345678-2026-04-01.csv');
    expect(
      calculateGiftAidScheduleChecksum('header\nrow')
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it('validates duplicate donations, missing declarations, row limits, and totals', () => {
    const summary = validateGiftAidSchedule({
      lines: [
        {
          donationId: 'donation-1',
          title: 'Mrs',
          firstNameOrInitial: 'Jane',
          lastName: 'Smith',
          houseNameOrNumber: '1',
          postcode: 'AB1 2CD',
          donationDate: '2026-04-01',
          donationAmountPence: 2500,
          declarationId: null,
        },
        {
          donationId: 'donation-1',
          title: 'Mrs',
          firstNameOrInitial: 'Jane',
          lastName: 'Smith',
          houseNameOrNumber: '1',
          postcode: 'AB1 2CD',
          donationDate: '2026-04-01',
          donationAmountPence: 2500,
          declarationId: 'decl-1',
        },
      ],
      expectedDonationTotalPence: 9999,
      expectedGiftAidTotalPence: 9999,
      maxRows: 1,
    });

    expect(summary.readiness).toBe('blocked');
    expect(summary.issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining(['declarationId', 'donationId', 'rowCount', 'batchTotals'])
    );
  });

  it('preserves manually edited snapshot values in preview rows', () => {
    const preview = buildGiftAidSchedulePreview({
      lines: [
        {
          donationId: 'donation-1',
          title: 'Dr',
          firstNameOrInitial: 'J',
          lastName: 'Edited',
          houseNameOrNumber: '10B',
          postcode: 'ZZ1 1ZZ',
          donationDate: '2026-04-01',
          donationAmountPence: 1234,
          claimAmountPence: 309,
          declarationId: 'decl-1',
        },
      ],
      expectedDonationTotalPence: 1234,
      expectedGiftAidTotalPence: 309,
    });

    expect(preview.summary.readiness).toBe('ready');
    expect(preview.rows[0]).toMatchObject({
      title: 'Dr',
      firstNameOrInitial: 'J',
      lastName: 'Edited',
      postcode: 'ZZ1 1ZZ',
      aggregatedDonations: '',
      sponsoredEvent: '',
      amount: '12.34',
    });
  });

  it('populates the HMRC ODS template donation cells', async () => {
    const buffer = await buildGiftAidScheduleWorkbookBuffer({
      templateBuffer: await createOdsTemplateBuffer(),
      firstDataRowIndex: 2,
      hmrcScheduleRows: [
        {
          title: 'Mrs',
          firstNameOrInitial: 'Jane',
          lastName: 'Smith',
          houseNameOrNumber: '1',
          postcode: 'AB1 2CD',
          aggregatedDonations: '',
          sponsoredEvent: '',
          donationDate: '01/04/26',
          amount: '25.00',
        },
      ],
    });

    const zip = await JSZip.loadAsync(buffer);
    const content = await zip.file('content.xml')?.async('string');
    expect(content).toContain('R68GAD_V1_00_0_EN');
    expect(content).toContain('<text:p>1</text:p>');
    expect(content).toContain('<text:p>Mrs</text:p>');
    expect(content).toContain('<text:p>01/04/26</text:p>');
    expect(content).toContain('office:value="25.00"');
  });

  it('populates the official HMRC ODS template from the repository path', async () => {
    const buffer = await buildGiftAidScheduleWorkbookBuffer({
      templateBuffer: await readGiftAidScheduleOdsTemplateBuffer(),
      hmrcScheduleRows: [
        {
          title: 'Mrs',
          firstNameOrInitial: 'Jane',
          lastName: 'Smith',
          houseNameOrNumber: '1',
          postcode: 'AB1 2CD',
          aggregatedDonations: '',
          sponsoredEvent: '',
          donationDate: '01/04/26',
          amount: '25.00',
        },
      ],
    });

    const zip = await JSZip.loadAsync(buffer);
    const content = await zip.file('content.xml')?.async('string');
    expect(content).toContain('table:name="R68GAD_V1_00_0_EN"');
    expect(content).toContain('<text:p>Mrs</text:p>');
    expect(content).toContain('office:value="25.00"');
  });

  it('blocks GASDS lines from the Gift Aid donations ODS schedule', () => {
    const summary = validateGiftAidSchedule({
      lines: [
        {
          donationId: 'gasds:batch-1',
          claimItemType: CLAIM_ITEM_GASDS,
          title: '—',
          firstNameOrInitial: 'cash',
          lastName: 'APR-001',
          houseNameOrNumber: '—',
          postcode: '—',
          donationDate: '2026-04-01',
          donationAmountPence: 10_000,
          claimAmountPence: 2500,
        },
      ],
      expectedDonationTotalPence: 10_000,
      expectedGiftAidTotalPence: 2500,
    });
    expect(summary.readiness).toBe('blocked');
    expect(summary.gasdsSmallDonationBatchRowCount).toBe(1);
    expect(summary.hmrcScheduleRowCount).toBe(0);
    expect(summary.issues.map((issue) => issue.message).join(' ')).toContain(
      'separate HMRC GASDS schedule'
    );
  });
});

async function createOdsTemplateBuffer(): Promise<Buffer> {
  const rows = [
    '<table:table-row><table:table-cell><text:p>Header</text:p></table:table-cell></table:table-row>',
    `<table:table-row><table:table-cell table:style-name="ce1" office:value-type="float" office:value="1"><text:p>1</text:p></table:table-cell>${Array.from({ length: 9 })
      .map(
        () =>
          '<table:table-cell table:style-name="ce1" office:value-type="string"><text:p/></table:table-cell>'
      )
      .join('')}</table:table-row>`,
  ].join('');
  const contentXml = `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="R68GAD_V1_00_0_EN">${rows}</table:table></office:spreadsheet></office:body></office:document-content>`;
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet');
  zip.file('content.xml', contentXml);
  return zip.generateAsync({ type: 'nodebuffer' });
}
