import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { penceToPounds } from './eligibility';
import { CLAIM_ITEM_GASDS } from './gasds';

export const HMRC_GIFT_AID_ODS_SHEET_NAME = 'R68GAD_V1_00_0_EN';
export const HMRC_GIFT_AID_ODS_TEMPLATE_RELATIVE_PATH =
  'templates/hmrc/R68GAD_V1_00_0_EN.ods';
export const HMRC_GIFT_AID_ODS_DEFAULT_FIRST_DATA_ROW_INDEX = 24;
export const HMRC_GIFT_AID_ODS_MAX_ROWS = 1000;
export const HMRC_GIFT_AID_ODS_MIME_TYPE =
  'application/vnd.oasis.opendocument.spreadsheet';
const ODS_CELL_REGEX =
  /<table:table-cell\b(?:[^/>]|\/(?!>))*\/>|<table:table-cell\b[\s\S]*?<\/table:table-cell>/g;

export const HMRC_GIFT_AID_SCHEDULE_COLUMNS = [
  'Item',
  'Title',
  'First Name or Initial',
  'Last Name',
  'House Name or Number',
  'Postcode',
  'Aggregated Donations',
  'Sponsored Event',
  'Donation Date',
  'Amount',
] as const;

export const GASDS_SCHEDULE_COLUMNS = [
  'Batch reference',
  'Collection date',
  'Service or event',
  'Method',
  'Eligible amount',
  'Gift Aid (25%)',
] as const;

export type GiftAidScheduleClaimItemType =
  | 'standard_gift_aid'
  | typeof CLAIM_ITEM_GASDS;

export interface GiftAidScheduleSnapshotLine {
  donationId: string;
  claimLineId?: string;
  claimItemType?: GiftAidScheduleClaimItemType;
  gasds_batch_reference?: string | null;
  gasds_service_or_event?: string | null;
  gasds_collection_method?: string | null;
  title: string | null;
  firstNameOrInitial: string | null;
  lastName: string | null;
  houseNameOrNumber: string | null;
  postcode: string | null;
  donationDate: string;
  donationAmountPence: number;
  claimAmountPence?: number;
  declarationId?: string | null;
  giftAidClaimId?: string | null;
  giftAidClaimBatchId?: string | null;
  exportLockedAt?: string | null;
}

export interface GiftAidScheduleRow {
  title: string;
  firstNameOrInitial: string;
  lastName: string;
  houseNameOrNumber: string;
  postcode: string;
  aggregatedDonations: string;
  sponsoredEvent: string;
  donationDate: string;
  amount: string;
}

export interface GiftAidGasdsScheduleWorkbookRow {
  batchReference: string;
  collectionDate: string;
  serviceOrEvent: string;
  collectionMethod: string;
  eligiblePounds: string;
  giftAidPounds: string;
}

export interface GiftAidScheduleIssue {
  donationId: string;
  field:
    | 'title'
    | 'firstNameOrInitial'
    | 'lastName'
    | 'houseNameOrNumber'
    | 'postcode'
    | 'aggregatedDonations'
    | 'sponsoredEvent'
    | 'donationDate'
    | 'donationAmountPence'
    | 'donationId'
    | 'declarationId'
    | 'batchTotals'
    | 'rowCount';
  message: string;
}

export interface GiftAidScheduleValidationSummary {
  readiness: 'ready' | 'warnings' | 'blocked';
  /** Total claim lines (HMRC donor rows + GASDS batches). */
  rowCount: number;
  hmrcScheduleRowCount: number;
  gasdsSmallDonationBatchRowCount: number;
  totalDonationAmountPence: number;
  totalGiftAidAmountPence: number;
  issues: GiftAidScheduleIssue[];
}

export interface GiftAidSchedulePreview {
  rows: GiftAidScheduleRow[];
  gasdsRows: GiftAidGasdsScheduleWorkbookRow[];
  summary: GiftAidScheduleValidationSummary;
}

export function buildGiftAidScheduleRows(
  lines: GiftAidScheduleSnapshotLine[]
): {
  rows: GiftAidScheduleRow[];
  issues: GiftAidScheduleIssue[];
} {
  const rows: GiftAidScheduleRow[] = [];
  const issues: GiftAidScheduleIssue[] = [];

  for (const line of lines) {
    const issueCountBeforeRow = issues.length;
    const title = normalizeRequiredText(line.title);
    const firstNameOrInitial = normalizeRequiredText(line.firstNameOrInitial);
    const lastName = normalizeRequiredText(line.lastName);
    const houseNameOrNumber = normalizeRequiredText(line.houseNameOrNumber);
    const postcode = normalizePostcode(line.postcode);
    const donationDate = normalizeRequiredText(line.donationDate);
    const hmrcDonationDate = formatHmrcDonationDate(donationDate);

    if (!title) {
      issues.push(issue(line.donationId, 'title', 'Title is required.'));
    } else if (title.length > 4) {
      issues.push(issue(line.donationId, 'title', 'Title must be 4 characters or fewer.'));
    }
    if (!firstNameOrInitial) {
      issues.push(
        issue(
          line.donationId,
          'firstNameOrInitial',
          'First name or initial is required.'
        )
      );
    } else if (firstNameOrInitial.length > 35) {
      issues.push(
        issue(
          line.donationId,
          'firstNameOrInitial',
          'First name or initial must be 35 characters or fewer.'
        )
      );
    } else if (/\s/.test(firstNameOrInitial)) {
      issues.push(
        issue(
          line.donationId,
          'firstNameOrInitial',
          'First name or initial must not contain spaces.'
        )
      );
    }
    if (!lastName) {
      issues.push(issue(line.donationId, 'lastName', 'Last name is required.'));
    } else if (lastName.length > 35) {
      issues.push(issue(line.donationId, 'lastName', 'Last name must be 35 characters or fewer.'));
    }
    if (!houseNameOrNumber) {
      issues.push(
        issue(
          line.donationId,
          'houseNameOrNumber',
          'House name or number is required.'
        )
      );
    } else if (houseNameOrNumber.length > 40) {
      issues.push(
        issue(
          line.donationId,
          'houseNameOrNumber',
          'House name or number must be 40 characters or fewer.'
        )
      );
    }
    if (!postcode) {
      issues.push(issue(line.donationId, 'postcode', 'Postcode is required.'));
    } else if (!isHmrcPostcode(postcode)) {
      issues.push(
        issue(
          line.donationId,
          'postcode',
          'Postcode must be uppercase with a space, or X for overseas donors.'
        )
      );
    }
    if (!hmrcDonationDate) {
      issues.push(
        issue(line.donationId, 'donationDate', 'Donation date must be a valid date.')
      );
    }
    if (!Number.isFinite(line.donationAmountPence) || line.donationAmountPence <= 0) {
      issues.push(
        issue(
          line.donationId,
          'donationAmountPence',
          'Donation amount must be greater than zero.'
        )
      );
    }

    if (
      title &&
      firstNameOrInitial &&
      lastName &&
      houseNameOrNumber &&
      postcode &&
      hmrcDonationDate &&
      isHmrcPostcode(postcode) &&
      Number.isFinite(line.donationAmountPence) &&
      line.donationAmountPence > 0 &&
      issues.length === issueCountBeforeRow
    ) {
      rows.push({
        title,
        firstNameOrInitial,
        lastName,
        houseNameOrNumber,
        postcode,
        aggregatedDonations: '',
        sponsoredEvent: '',
        donationDate: hmrcDonationDate,
        amount: penceToPounds(line.donationAmountPence),
      });
    }
  }

  return { rows, issues };
}

/** Minimal validation for rows shown on the GASDS worksheet (placeholder donor schedule not used). */
export function validateGasdsSnapshotLines(lines: GiftAidScheduleSnapshotLine[]): GiftAidScheduleIssue[] {
  const issues: GiftAidScheduleIssue[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (!Number.isFinite(line.donationAmountPence) || line.donationAmountPence <= 0) {
      issues.push(
        issue(
          line.donationId,
          'donationAmountPence',
          'GASDS eligible amount must be greater than zero.'
        )
      );
    }
    if (seen.has(line.donationId)) {
      issues.push(
        issue(line.donationId, 'donationId', 'Duplicate GASDS batch in this claim schedule.')
      );
    }
    seen.add(line.donationId);
    if (
      line.claimAmountPence != null &&
      Number(line.claimAmountPence) !== Math.round(Number(line.donationAmountPence) * 0.25)
    ) {
      issues.push(
        issue(
          line.donationId,
          'batchTotals',
          'Gift Aid amount does not match 25% of eligible GASDS amount.'
        )
      );
    }
  }
  return issues;
}

export function validateGiftAidSchedule(params: {
  lines: GiftAidScheduleSnapshotLine[];
  expectedDonationTotalPence?: number | null;
  expectedGiftAidTotalPence?: number | null;
  maxRows?: number;
}): GiftAidScheduleValidationSummary {
  const maxRows = params.maxRows ?? 1000;
  const hmrcLines = params.lines.filter(
    (line) =>
      line.claimItemType !== CLAIM_ITEM_GASDS
  );
  const gasdsLines = params.lines.filter((line) => line.claimItemType === CLAIM_ITEM_GASDS);
  const { rows, issues } = buildGiftAidScheduleRows(hmrcLines);

  issues.push(...validateGasdsSnapshotLines(gasdsLines));
  if (gasdsLines.length > 0) {
    issues.push(
      issue(
        'batch',
        'rowCount',
        'GASDS small donation batches require a separate HMRC GASDS schedule and cannot be included in the Gift Aid donations ODS.'
      )
    );
  }

  const seenDonationIds = new Set<string>();
  const duplicateIds = new Set<string>();

  for (const line of hmrcLines) {
    if (seenDonationIds.has(line.donationId)) {
      duplicateIds.add(line.donationId);
    }
    seenDonationIds.add(line.donationId);

    if (line.giftAidClaimId && line.giftAidClaimBatchId) {
      issues.push(
        issue(
          line.donationId,
          'donationId',
          'Donation is already linked to an existing Gift Aid claim.'
        )
      );
    }
    if (!line.declarationId) {
      issues.push(
        issue(
          line.donationId,
          'declarationId',
          'A valid Gift Aid declaration link is required.'
        )
      );
    }
  }

  for (const donationId of duplicateIds) {
    issues.push(
      issue(donationId, 'donationId', 'Duplicate donation ID found in schedule.')
    );
  }

  if (hmrcLines.length > maxRows) {
    issues.push(
      issue(
        'batch',
        'rowCount',
        `HMRC donor schedule contains ${hmrcLines.length} rows; maximum is ${maxRows} unless using an approved software workflow.`
      )
    );
  }

  const totalDonationAmountPence = params.lines.reduce(
    (sum, line) => sum + Number(line.donationAmountPence || 0),
    0
  );
  const totalGiftAidAmountPence = params.lines.reduce(
    (sum, line) =>
      sum +
      (line.claimAmountPence == null
        ? Math.round(Number(line.donationAmountPence || 0) * 0.25)
        : Number(line.claimAmountPence)),
    0
  );

  if (
    params.expectedDonationTotalPence != null &&
    totalDonationAmountPence !== params.expectedDonationTotalPence
  ) {
    issues.push(
      issue('batch', 'batchTotals', 'Donation total does not match claim batch summary.')
    );
  }

  if (
    params.expectedGiftAidTotalPence != null &&
    totalGiftAidAmountPence !== params.expectedGiftAidTotalPence
  ) {
    issues.push(
      issue('batch', 'batchTotals', 'Gift Aid total does not match claim batch summary.')
    );
  }

  return {
    readiness: issues.length > 0 ? 'blocked' : 'ready',
    rowCount: hmrcLines.length + gasdsLines.length,
    hmrcScheduleRowCount: rows.length,
    gasdsSmallDonationBatchRowCount: gasdsLines.length,
    totalDonationAmountPence,
    totalGiftAidAmountPence,
    issues,
  };
}

export function buildGiftAidSchedulePreview(params: {
  lines: GiftAidScheduleSnapshotLine[];
  expectedDonationTotalPence?: number | null;
  expectedGiftAidTotalPence?: number | null;
}): GiftAidSchedulePreview {
  const hmrcLines = params.lines.filter(
    (line) => line.claimItemType !== CLAIM_ITEM_GASDS
  );
  const gasdsLines = params.lines.filter((line) => line.claimItemType === CLAIM_ITEM_GASDS);
  const schedule = buildGiftAidScheduleRows(hmrcLines);

  const gasdsRowsForWorkbook = gasdsLines.map((line): GiftAidGasdsScheduleWorkbookRow => ({
    batchReference: line.gasds_batch_reference ?? line.lastName ?? '—',
    collectionDate: line.donationDate,
    serviceOrEvent: line.gasds_service_or_event ?? line.title ?? '',
    collectionMethod: line.gasds_collection_method ?? line.firstNameOrInitial ?? '—',
    eligiblePounds: penceToPounds(Number(line.donationAmountPence)),
    giftAidPounds: penceToPounds(
      line.claimAmountPence ?? Math.round(Number(line.donationAmountPence) * 0.25)
    ),
  }));

  const summary = validateGiftAidSchedule({
    lines: params.lines,
    expectedDonationTotalPence: params.expectedDonationTotalPence,
    expectedGiftAidTotalPence: params.expectedGiftAidTotalPence,
  });

  return {
    rows: schedule.rows,
    gasdsRows: gasdsRowsForWorkbook,
    summary,
  };
}

export function buildGiftAidScheduleCsv(rows: GiftAidScheduleRow[]): string {
  const lines: string[] = [HMRC_GIFT_AID_SCHEDULE_COLUMNS.join(',')];

  for (const row of rows) {
    lines.push(
      [
        '',
        escapeCsvField(row.title),
        escapeCsvField(row.firstNameOrInitial),
        escapeCsvField(row.lastName),
        escapeCsvField(row.houseNameOrNumber),
        escapeCsvField(row.postcode),
        escapeCsvField(row.aggregatedDonations),
        escapeCsvField(row.sponsoredEvent),
        escapeCsvField(row.donationDate),
        escapeCsvField(row.amount),
      ].join(',')
    );
  }

  return lines.join('\n');
}

export async function buildGiftAidScheduleOdsBuffer(params: {
  hmrcScheduleRows: GiftAidScheduleRow[];
  templateBuffer: Buffer;
  sheetName?: string;
  firstDataRowIndex?: number;
}): Promise<Buffer> {
  if (params.hmrcScheduleRows.length > HMRC_GIFT_AID_ODS_MAX_ROWS) {
    throw new Error(`HMRC Gift Aid schedules cannot exceed ${HMRC_GIFT_AID_ODS_MAX_ROWS} rows.`);
  }

  const zip = await JSZip.loadAsync(params.templateBuffer);
  const contentEntry = zip.file('content.xml');
  if (!contentEntry) {
    throw new Error('The HMRC ODS template is missing content.xml.');
  }

  const contentXml = await contentEntry.async('string');
  const populated = populateOdsContentXml({
    contentXml,
    rows: params.hmrcScheduleRows,
    sheetName: params.sheetName ?? HMRC_GIFT_AID_ODS_SHEET_NAME,
    firstDataRowIndex:
      params.firstDataRowIndex ?? HMRC_GIFT_AID_ODS_DEFAULT_FIRST_DATA_ROW_INDEX,
  });

  zip.file('content.xml', populated);
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    mimeType: HMRC_GIFT_AID_ODS_MIME_TYPE,
    compression: 'DEFLATE',
  });
  return Buffer.from(buffer);
}

export const buildGiftAidScheduleWorkbookBuffer = buildGiftAidScheduleOdsBuffer;

export async function readGiftAidScheduleOdsTemplateBuffer(
  templatePath = getGiftAidScheduleOdsTemplatePath()
): Promise<Buffer> {
  try {
    return await fs.readFile(templatePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `HMRC Gift Aid ODS template is missing. Add the official GOV.UK template at ${templatePath}.`
      );
    }
    throw error;
  }
}

export function getGiftAidScheduleOdsTemplatePath(): string {
  return (
    process.env.HMRC_GIFT_AID_ODS_TEMPLATE_PATH ??
    path.join(process.cwd(), HMRC_GIFT_AID_ODS_TEMPLATE_RELATIVE_PATH)
  );
}

export function buildGiftAidScheduleWorkbookFileName(params: {
  claimId: string;
  exportedAt?: Date;
}): string {
  const exportedAt = params.exportedAt ?? new Date();
  const datePart = exportedAt.toISOString().slice(0, 10);
  return `gift-aid-schedule-${params.claimId.slice(0, 8)}-${datePart}.ods`;
}

export function buildGiftAidSchedulePdfFileName(params: {
  claimId: string;
  exportedAt?: Date;
}): string {
  const exportedAt = params.exportedAt ?? new Date();
  const datePart = exportedAt.toISOString().slice(0, 10);
  return `gift-aid-schedule-review-${params.claimId.slice(0, 8)}-${datePart}.pdf`;
}

export function buildGiftAidScheduleFileName(params: {
  claimId: string;
  exportedAt?: Date;
}): string {
  const exportedAt = params.exportedAt ?? new Date();
  const datePart = exportedAt.toISOString().slice(0, 10);
  return `gift-aid-schedule-${params.claimId.slice(0, 8)}-${datePart}.csv`;
}

export function calculateGiftAidScheduleChecksum(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function normalizeRequiredText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizePostcode(value: string | null | undefined): string | null {
  const cleaned = normalizeRequiredText(value)?.toUpperCase().replace(/\s+/g, ' ');
  if (!cleaned) return null;
  if (cleaned === 'X') return cleaned;
  const compact = cleaned.replace(/\s/g, '');
  if (compact.length > 3) {
    return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
  }
  return cleaned;
}

function isHmrcPostcode(value: string): boolean {
  if (value === 'X') return true;
  return /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/.test(value);
}

function formatHmrcDonationDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function issue(
  donationId: string,
  field: GiftAidScheduleIssue['field'],
  message: string
): GiftAidScheduleIssue {
  return { donationId, field, message };
}

function populateOdsContentXml(params: {
  contentXml: string;
  rows: GiftAidScheduleRow[];
  sheetName: string;
  firstDataRowIndex: number;
}): string {
  const tableRange = findOdsTableRange(params.contentXml, params.sheetName);
  const tableXml = params.contentXml.slice(tableRange.start, tableRange.end);
  const rowMatches = [...tableXml.matchAll(/<table:table-row\b[\s\S]*?<\/table:table-row>/g)];
  const headerOffset = params.firstDataRowIndex - 1;
  const requiredRowCount = Math.max(params.rows.length, 1);

  if (rowMatches.length <= headerOffset) {
    throw new Error(
      `The HMRC ODS template does not contain row ${params.firstDataRowIndex} for donation data.`
    );
  }

  const dataTemplate = rowMatches[headerOffset][0];
  const newRows: string[] = [];
  rowMatches.forEach((match, index) => {
    if (index < headerOffset) {
      newRows.push(match[0]);
      return;
    }

    const dataIndex = index - headerOffset;
    if (dataIndex < requiredRowCount) {
      newRows.push(
        populateOdsRow(
          dataIndex < params.rows.length ? params.rows[dataIndex] : null,
          match[0]
        )
      );
      return;
    }
    newRows.push('');
  });

  for (let i = Math.max(0, rowMatches.length - headerOffset); i < requiredRowCount; i += 1) {
    newRows.push(populateOdsRow(params.rows[i] ?? null, dataTemplate));
  }

  const replacedTableXml = replaceOdsRows(tableXml, rowMatches, newRows);
  return (
    params.contentXml.slice(0, tableRange.start) +
    replacedTableXml +
    params.contentXml.slice(tableRange.end)
  );
}

function findOdsTableRange(contentXml: string, sheetName: string): { start: number; end: number } {
  const escapedSheetName = escapeRegExp(sheetName);
  const tableOpen = new RegExp(
    `<table:table\\b(?=[^>]*table:name="${escapedSheetName}")[^>]*>`,
    'i'
  ).exec(contentXml);
  if (!tableOpen) {
    throw new Error(`The HMRC ODS template must contain the ${sheetName} worksheet.`);
  }
  const start = tableOpen.index;
  const closeToken = '</table:table>';
  const end = contentXml.indexOf(closeToken, start);
  if (end === -1) {
    throw new Error(`The ${sheetName} worksheet in the HMRC ODS template is malformed.`);
  }
  return { start, end: end + closeToken.length };
}

function replaceMatches(source: string, matches: RegExpMatchArray[], replacements: string[]): string {
  let output = '';
  let cursor = 0;
  matches.forEach((match, index) => {
    const matchIndex = match.index ?? 0;
    output += source.slice(cursor, matchIndex);
    output += replacements[index] ?? match[0];
    cursor = matchIndex + match[0].length;
  });
  output += source.slice(cursor);
  return output;
}

function replaceOdsRows(source: string, matches: RegExpMatchArray[], replacements: string[]): string {
  if (matches.length === 0) return source;
  const firstIndex = matches[0].index ?? 0;
  const lastMatch = matches[matches.length - 1];
  const lastIndex = (lastMatch.index ?? 0) + lastMatch[0].length;
  return source.slice(0, firstIndex) + replacements.join('') + source.slice(lastIndex);
}

function populateOdsRow(row: GiftAidScheduleRow | null, rowXml: string): string {
  const expandedRowXml = expandRepeatedOdsCells(
    rowXml.replace(/\stable:number-rows-repeated="\d+"/, ''),
    10
  );
  const values = row
    ? [
        null,
        row.title,
        row.firstNameOrInitial,
        row.lastName,
        row.houseNameOrNumber,
        row.postcode,
        row.aggregatedDonations,
        row.sponsoredEvent,
        row.donationDate,
        row.amount,
      ]
    : [null, '', '', '', '', '', '', '', '', ''];
  const cellMatches = [...expandedRowXml.matchAll(ODS_CELL_REGEX)];
  if (cellMatches.length < values.length) {
    throw new Error('The HMRC ODS template row does not contain the required donation columns.');
  }
  const replacements = cellMatches.map((match, index) =>
    index < values.length && values[index] !== null
      ? populateOdsCell(match[0], values[index] ?? '', index === 9)
      : match[0]
  );
  return replaceMatches(expandedRowXml, cellMatches, replacements);
}

function expandRepeatedOdsCells(rowXml: string, minCells: number): string {
  let logicalCells = 0;
  for (const match of rowXml.matchAll(ODS_CELL_REGEX)) {
    logicalCells += getOdsRepeatedColumnCount(match[0]);
  }
  if (logicalCells >= minCells && [...rowXml.matchAll(ODS_CELL_REGEX)].length >= minCells) {
    return rowXml;
  }

  return rowXml.replace(ODS_CELL_REGEX, (cellXml) => {
    const repeat = getOdsRepeatedColumnCount(cellXml);
    if (repeat <= 1) return cellXml;
    const cellWithoutRepeat = cellXml.replace(/\stable:number-columns-repeated="\d+"/, '');
    return Array.from({ length: Math.min(repeat, minCells) }, () => cellWithoutRepeat).join('');
  });
}

function getOdsRepeatedColumnCount(cellXml: string): number {
  const repeatMatch = /\stable:number-columns-repeated="(\d+)"/.exec(cellXml);
  return repeatMatch ? Math.max(1, Number(repeatMatch[1])) : 1;
}

function populateOdsCell(cellXml: string, value: string, isAmount: boolean): string {
  const openTagMatch = /^<table:table-cell\b[^>]*\/?>/.exec(cellXml);
  const closeTag = '</table:table-cell>';
  if (!openTagMatch) {
    throw new Error('The HMRC ODS template contains a malformed cell.');
  }

  const normalizedOpenTag = openTagMatch[0].endsWith('/>')
    ? openTagMatch[0].replace(/\/>$/, '>')
    : openTagMatch[0];
  const openTag =
    isAmount && value
      ? setOdsNumericCellAttributes(normalizedOpenTag, value)
      : setOdsTextCellAttributes(normalizedOpenTag);
  const paragraph = value ? `<text:p>${escapeXml(value)}</text:p>` : '<text:p/>';
  return `${openTag}${paragraph}${closeTag}`;
}

function setOdsTextCellAttributes(openTag: string): string {
  return stripOdsValueAttributes(openTag).replace(/>$/, ' office:value-type="string">');
}

function setOdsNumericCellAttributes(openTag: string, value: string): string {
  return stripOdsValueAttributes(openTag).replace(
    />$/,
    ` office:value-type="float" office:value="${escapeXml(value)}">`
  );
}

function stripOdsValueAttributes(openTag: string): string {
  return openTag
    .replace(/\s(?:office|calcext):value-type="[^"]*"/g, '')
    .replace(/\soffice:value="[^"]*"/g, '')
    .replace(/\soffice:string-value="[^"]*"/g, '')
    .replace(/\soffice:date-value="[^"]*"/g, '')
    .replace(/\soffice:formula="[^"]*"/g, '');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
