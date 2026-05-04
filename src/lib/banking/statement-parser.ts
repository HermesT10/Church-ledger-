import { createHash } from 'crypto';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { parseBankDate, parseMoneyToPence, normalizeText } from './importUtils';

export type BankStatementFileType = 'csv' | 'xlsx';
export type BankStatementAmountMode = 'signed' | 'separate';
export type BankStatementColumnType =
  | 'date'
  | 'time'
  | 'description'
  | 'additional_description'
  | 'reference'
  | 'signed_amount'
  | 'money_in'
  | 'money_out'
  | 'balance'
  | 'unknown';
export type BankStatementConfidence = 'high' | 'medium' | 'low';
export type NormalisedBankRowStatus = 'valid' | 'warning' | 'error';

export interface BankStatementColumnMeta {
  columnKey: string;
  displayName: string;
  sampleValues: string[];
  detectedType: BankStatementColumnType;
  confidence: BankStatementConfidence;
}

export interface ParsedStatementTable {
  headers: string[];
  rows: Record<string, string>[];
  rawRows: string[][];
  parse_errors: string[];
  columns: BankStatementColumnMeta[];
  hasHeaders: boolean;
  headerRowIndex: number | null;
  dataStartRowIndex: number;
}

export interface BankStatementColumnMapping {
  date?: string;
  time?: string;
  description?: string;
  additional_description?: string;
  reference?: string;
  money_in?: string;
  money_out?: string;
  amount?: string;
  amountMode?: BankStatementAmountMode;
  balance?: string;
}

export interface DetectedBankColumns {
  mapping: BankStatementColumnMapping;
  confidence: BankStatementConfidence;
  unmappedHeaders: string[];
  columns: BankStatementColumnMeta[];
  amountMode: BankStatementAmountMode;
  hasHeaders: boolean;
  headerRowIndex: number | null;
}

export interface NormalisedBankTransactionRow {
  row_number: number;
  transaction_date: string | null;
  transaction_time: string | null;
  description: string;
  additional_description: string | null;
  display_description: string;
  reference: string | null;
  money_in_pence: number;
  money_out_pence: number;
  amount_pence: number;
  running_balance_pence: number | null;
  fingerprint: string;
  raw: Record<string, string>;
  validation_errors: string[];
  validation_warnings: string[];
  validation_status: NormalisedBankRowStatus;
}

export const DESCRIPTION_TIME_WARNING = 'The selected description column looks like a time column. Please choose the bank narrative/description column.';
export const AMOUNT_BALANCE_WARNING = 'The selected amount column looks like a running balance. Please check the mapping.';
export const BALANCE_AMOUNT_WARNING = 'The selected running balance column looks like a transaction amount. Please check the mapping.';

const DATE_HEADER_RE = /\b(date|posted|transaction\s*date|value\s*date|booking\s*date)\b/i;
const TIME_HEADER_RE = /\b(time|transaction\s*time|posted\s*time)\b/i;
const DESCRIPTION_HEADER_RE = /\b(description|details|narrative|transaction|memo|particulars|payee)\b/i;
const ADDITIONAL_DESCRIPTION_HEADER_RE = /\b(additional\s*description|transaction\s*detail|details?\s*2|narrative\s*2|extra\s*detail|bank\s*detail)\b/i;
const REFERENCE_HEADER_RE = /\b(reference|ref|cheque|payment\s*ref|code|id)\b/i;
const MONEY_IN_HEADER_RE = /(money\s*in|paid\s*in|credit|deposit|received|inflow|receipt)/i;
const MONEY_OUT_HEADER_RE = /(money\s*out|paid\s*out|debit|withdrawal|spent|outflow|payment)/i;
const AMOUNT_HEADER_RE = /\b(amount|value|transaction\s*amount|signed\s*amount)\b/i;
const BALANCE_HEADER_RE = /\b(balance|running\s*balance|closing\s*balance|available\s*balance)\b/i;
const MAX_SAMPLE_VALUES = 4;

function normaliseCell(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && 'text' in value) return String((value as { text: unknown }).text ?? '').trim();
  if (typeof value === 'object' && 'result' in value) return String((value as { result: unknown }).result ?? '').trim();
  return String(value).trim();
}

function rowHasValues(row: string[]): boolean {
  return row.some((cell) => cell.trim() !== '');
}

function columnLabel(index: number): string {
  let label = '';
  let current = index;
  do {
    label = String.fromCharCode(65 + (current % 26)) + label;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return `Column ${label}`;
}

function uniqueDisplayNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name, index) => {
    const base = name.trim() || columnLabel(index);
    const count = seen.get(base.toLowerCase()) ?? 0;
    seen.set(base.toLowerCase(), count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function looksLikeDate(value: string): boolean {
  return parseBankDate(value) !== null;
}

function looksLikeTime(value: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value.trim());
}

function normaliseTime(value: string): string | null {
  const trimmed = value.trim();
  if (!looksLikeTime(trimmed)) return null;
  const [hour = '', minute = '', second] = trimmed.split(':');
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}${second ? `:${second.padStart(2, '0')}` : ''}`;
}

function looksLikeMoney(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !/[0-9]/.test(trimmed)) return false;
  return /^-?\s*[£$€]?\s*\(?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\)?$|^-?\s*[£$€]?\s*\(?\d+(?:\.\d{1,2})?\)?$/.test(trimmed);
}

function moneyValue(value: string): number {
  return Number(parseMoneyToPence(value));
}

function isTextHeavy(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /[A-Za-z]{3,}/.test(trimmed) && !looksLikeDate(trimmed) && !looksLikeMoney(trimmed) && !looksLikeTime(trimmed);
}

function headerTokenScore(row: string[]): number {
  const joined = row.join(' ');
  let score = 0;
  if (DATE_HEADER_RE.test(joined)) score += 3;
  if (TIME_HEADER_RE.test(joined)) score += 1;
  if (DESCRIPTION_HEADER_RE.test(joined)) score += 3;
  if (REFERENCE_HEADER_RE.test(joined)) score += 1;
  if (MONEY_IN_HEADER_RE.test(joined) || MONEY_OUT_HEADER_RE.test(joined) || AMOUNT_HEADER_RE.test(joined)) score += 3;
  if (BALANCE_HEADER_RE.test(joined)) score += 1;
  return score;
}

function dataLikeScore(row: string[]): number {
  return row.reduce((score, cell) => {
    if (looksLikeDate(cell)) return score + 2;
    if (looksLikeTime(cell)) return score + 1;
    if (looksLikeMoney(cell)) return score + 1;
    return score;
  }, 0);
}

function detectHeaderInfo(rows: string[][]): { hasHeaders: boolean; headerRowIndex: number | null; dataStartRowIndex: number } {
  const candidates = rows.slice(0, 10);
  let bestIndex: number | null = null;
  let bestScore = 0;

  candidates.forEach((row, index) => {
    const score = headerTokenScore(row) - Math.min(dataLikeScore(row), 3);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  if (bestIndex !== null && bestScore >= 4) {
    return { hasHeaders: true, headerRowIndex: bestIndex, dataStartRowIndex: bestIndex + 1 };
  }

  return { hasHeaders: false, headerRowIndex: null, dataStartRowIndex: 0 };
}

function maxColumnCount(rows: string[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

function padRows(rows: string[][], width: number): string[][] {
  return rows.map((row) => Array.from({ length: width }, (_, index) => row[index]?.trim() ?? ''));
}

function samplesForColumn(rows: Record<string, string>[], columnKey: string): string[] {
  const samples: string[] = [];
  for (const row of rows) {
    const value = row[columnKey]?.trim();
    if (value && !samples.includes(value)) samples.push(value);
    if (samples.length >= MAX_SAMPLE_VALUES) break;
  }
  return samples;
}

function ratio(samples: string[], predicate: (value: string) => boolean): number {
  if (samples.length === 0) return 0;
  return samples.filter(predicate).length / samples.length;
}

function confidenceFromRatio(value: number): BankStatementConfidence {
  if (value >= 0.8) return 'high';
  if (value >= 0.5) return 'medium';
  return 'low';
}

function detectTypeForColumn(displayName: string, samples: string[]): { detectedType: BankStatementColumnType; confidence: BankStatementConfidence } {
  if (DATE_HEADER_RE.test(displayName)) return { detectedType: 'date', confidence: 'high' };
  if (TIME_HEADER_RE.test(displayName)) return { detectedType: 'time', confidence: 'high' };
  if (MONEY_IN_HEADER_RE.test(displayName)) return { detectedType: 'money_in', confidence: 'high' };
  if (MONEY_OUT_HEADER_RE.test(displayName)) return { detectedType: 'money_out', confidence: 'high' };
  if (BALANCE_HEADER_RE.test(displayName)) return { detectedType: 'balance', confidence: 'high' };
  if (AMOUNT_HEADER_RE.test(displayName)) return { detectedType: 'signed_amount', confidence: 'high' };
  if (ADDITIONAL_DESCRIPTION_HEADER_RE.test(displayName)) return { detectedType: 'additional_description', confidence: 'high' };
  if (REFERENCE_HEADER_RE.test(displayName)) return { detectedType: 'reference', confidence: 'medium' };
  if (DESCRIPTION_HEADER_RE.test(displayName)) return { detectedType: 'description', confidence: 'high' };

  const dateRatio = ratio(samples, looksLikeDate);
  const timeRatio = ratio(samples, looksLikeTime);
  const moneyRatio = ratio(samples, looksLikeMoney);
  const textRatio = ratio(samples, isTextHeavy);

  if (dateRatio >= 0.7) return { detectedType: 'date', confidence: confidenceFromRatio(dateRatio) };
  if (timeRatio >= 0.7) return { detectedType: 'time', confidence: confidenceFromRatio(timeRatio) };
  if (moneyRatio >= 0.7) return { detectedType: 'signed_amount', confidence: confidenceFromRatio(moneyRatio) };
  if (textRatio >= 0.5) return { detectedType: 'description', confidence: confidenceFromRatio(textRatio) };
  return { detectedType: 'unknown', confidence: 'low' };
}

function buildTable(rows: string[][]): ParsedStatementTable {
  const nonEmptyRows = rows.filter(rowHasValues);
  if (nonEmptyRows.length === 0) {
    return { headers: [], rows: [], rawRows: [], parse_errors: ['No transaction rows found.'], columns: [], hasHeaders: false, headerRowIndex: null, dataStartRowIndex: 0 };
  }

  const width = maxColumnCount(nonEmptyRows);
  const paddedRows = padRows(nonEmptyRows, width);
  const headerInfo = detectHeaderInfo(paddedRows);
  const displayNames = uniqueDisplayNames(
    headerInfo.hasHeaders && headerInfo.headerRowIndex !== null
      ? paddedRows[headerInfo.headerRowIndex].map((cell, index) => cell || columnLabel(index))
      : Array.from({ length: width }, (_, index) => columnLabel(index)),
  );
  const keys = Array.from({ length: width }, (_, index) => `col_${index}`);
  const dataRows = paddedRows.slice(headerInfo.dataStartRowIndex);

  const parsedRows = dataRows.map((row) => {
    const record: Record<string, string> = {};
    keys.forEach((key, index) => {
      record[key] = row[index] ?? '';
    });
    return record;
  });

  const columns = keys.map((columnKey, index) => {
    const sampleValues = samplesForColumn(parsedRows, columnKey);
    const detection = detectTypeForColumn(displayNames[index], sampleValues);
    return {
      columnKey,
      displayName: displayNames[index],
      sampleValues,
      detectedType: detection.detectedType,
      confidence: detection.confidence,
    };
  });

  return {
    headers: displayNames,
    rows: parsedRows,
    rawRows: paddedRows,
    parse_errors: [],
    columns,
    hasHeaders: headerInfo.hasHeaders,
    headerRowIndex: headerInfo.headerRowIndex,
    dataStartRowIndex: headerInfo.dataStartRowIndex,
  };
}

export function parseCsvStatement(input: string): ParsedStatementTable {
  const result = Papa.parse<string[]>(input, { skipEmptyLines: false });
  const rows = result.data
    .filter((row): row is string[] => Array.isArray(row))
    .map((row) => row.map(normaliseCell));

  return buildTable(rows);
}

export async function parseXlsxStatement(input: Buffer | ArrayBuffer): Promise<ParsedStatementTable> {
  const workbook = new ExcelJS.Workbook();
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const worksheet = workbook.worksheets[0];
  const rows: string[][] = [];

  worksheet.eachRow((row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(values.map(normaliseCell));
  });

  return buildTable(rows);
}

export function parseUnsupportedStatement(fileType: string): ParsedStatementTable {
  return {
    headers: [],
    rows: [],
    rawRows: [],
    parse_errors: [`${fileType.toUpperCase()} uploads are tracked, but parsing is not supported yet.`],
    columns: [],
    hasHeaders: false,
    headerRowIndex: null,
    dataStartRowIndex: 0,
  };
}

function keyForDetectedType(columns: BankStatementColumnMeta[], type: BankStatementColumnType): string | undefined {
  return columns.find((column) => column.detectedType === type && column.confidence !== 'low')?.columnKey;
}

function monetaryColumns(columns: BankStatementColumnMeta[], rows: Record<string, string>[]): BankStatementColumnMeta[] {
  return columns.filter((column) => {
    const samples = rows.map((row) => row[column.columnKey] ?? '').filter(Boolean).slice(0, 10);
    return ratio(samples, looksLikeMoney) >= 0.7;
  });
}

function moneyValuesForColumn(rows: Record<string, string>[], columnKey: string): number[] {
  return rows
    .map((row) => row[columnKey] ?? '')
    .filter((value) => value.trim() !== '')
    .map(moneyValue);
}

function signedMovementScore(values: number[]): number {
  const nonZero = values.filter((value) => value !== 0);
  if (nonZero.length === 0) return 0;
  const positiveCount = nonZero.filter((value) => value > 0).length;
  const negativeCount = nonZero.filter((value) => value < 0).length;
  const mixedSignScore = positiveCount > 0 && negativeCount > 0 ? 0.5 : 0;
  const sortedAbs = nonZero.map((value) => Math.abs(value)).sort((a, b) => a - b);
  const medianAbs = sortedAbs[Math.floor(sortedAbs.length / 2)] ?? 0;
  const transactionSizedScore = medianAbs > 0 && medianAbs <= 500000 ? 0.35 : 0.1;
  return mixedSignScore + transactionSizedScore;
}

function runningBalanceScore(params: {
  rows: Record<string, string>[];
  balanceColumnKey: string;
  amountColumnKey?: string;
}): number {
  const balances = moneyValuesForColumn(params.rows, params.balanceColumnKey);
  if (balances.length < 2) return 0;

  const populatedScore = balances.length / Math.max(params.rows.length, 1);
  const sortedAbs = balances.map((value) => Math.abs(value)).sort((a, b) => a - b);
  const medianAbs = sortedAbs[Math.floor(sortedAbs.length / 2)] ?? 0;
  const balanceSizedScore = medianAbs >= 100000 ? 0.25 : 0.1;

  if (!params.amountColumnKey) {
    return populatedScore * 0.45 + balanceSizedScore;
  }

  let checks = 0;
  let matches = 0;
  for (let index = 1; index < params.rows.length; index += 1) {
    const previousBalanceRaw = params.rows[index - 1]?.[params.balanceColumnKey] ?? '';
    const currentBalanceRaw = params.rows[index]?.[params.balanceColumnKey] ?? '';
    const amountRaw = params.rows[index]?.[params.amountColumnKey] ?? '';
    if (!looksLikeMoney(previousBalanceRaw) || !looksLikeMoney(currentBalanceRaw) || !looksLikeMoney(amountRaw)) continue;
    checks += 1;
    const previousBalance = moneyValue(previousBalanceRaw);
    const currentBalance = moneyValue(currentBalanceRaw);
    const amount = moneyValue(amountRaw);
    if (Math.abs(previousBalance + amount - currentBalance) <= 1) matches += 1;
  }

  const continuityScore = checks > 0 ? (matches / checks) * 0.4 : 0;
  return populatedScore * 0.35 + balanceSizedScore + continuityScore;
}

function bestSignedAmountColumn(columns: BankStatementColumnMeta[], rows: Record<string, string>[], excludeKeys = new Set<string>()): string | undefined {
  return monetaryColumns(columns, rows)
    .filter((column) => !excludeKeys.has(column.columnKey) && column.detectedType !== 'balance')
    .map((column) => ({
      column,
      score: signedMovementScore(moneyValuesForColumn(rows, column.columnKey)) + (column.detectedType === 'signed_amount' ? 0.2 : 0),
    }))
    .sort((a, b) => b.score - a.score)[0]?.column.columnKey;
}

function bestRunningBalanceColumn(
  columns: BankStatementColumnMeta[],
  rows: Record<string, string>[],
  amountColumnKey?: string,
): string | undefined {
  return monetaryColumns(columns, rows)
    .filter((column) => column.columnKey !== amountColumnKey)
    .map((column) => ({
      column,
      score: runningBalanceScore({ rows, balanceColumnKey: column.columnKey, amountColumnKey })
        + (column.detectedType === 'balance' ? 0.35 : 0),
    }))
    .filter((entry) => entry.score >= 0.55)
    .sort((a, b) => b.score - a.score)[0]?.column.columnKey;
}

function inferMoneyInOut(columns: BankStatementColumnMeta[], rows: Record<string, string>[]): { moneyIn?: string; moneyOut?: string } {
  const moneyColumns = monetaryColumns(columns, rows);
  const positiveColumns = moneyColumns.map((column) => {
    const values = rows.map((row) => moneyValue(row[column.columnKey] ?? '')).filter((value) => value !== 0);
    const positiveCount = values.filter((value) => value > 0).length;
    const negativeCount = values.filter((value) => value < 0).length;
    return { column, positiveCount, negativeCount };
  });

  const signed = positiveColumns.find((entry) => entry.positiveCount > 0 && entry.negativeCount > 0);
  if (signed) return {};

  if (positiveColumns.length >= 3) {
    const candidates = positiveColumns.filter((entry) => entry.column.detectedType !== 'balance');
    return {
      moneyOut: candidates[0]?.column.columnKey,
      moneyIn: candidates[1]?.column.columnKey,
    };
  }

  return {};
}

export function detectBankColumns(table: ParsedStatementTable): DetectedBankColumns {
  const { columns, rows } = table;
  const mapping: BankStatementColumnMapping = {};

  mapping.date = keyForDetectedType(columns, 'date');
  mapping.time = keyForDetectedType(columns, 'time');
  mapping.description = keyForDetectedType(columns, 'description');
  mapping.additional_description = keyForDetectedType(columns, 'additional_description');
  mapping.reference = keyForDetectedType(columns, 'reference');
  mapping.money_in = keyForDetectedType(columns, 'money_in');
  mapping.money_out = keyForDetectedType(columns, 'money_out');
  mapping.amount = keyForDetectedType(columns, 'signed_amount');
  if (!mapping.amount && (!mapping.money_in || !mapping.money_out)) {
    mapping.amount = bestSignedAmountColumn(columns, rows);
  }
  mapping.balance = bestRunningBalanceColumn(columns, rows, mapping.amount) ?? keyForDetectedType(columns, 'balance');

  if (!mapping.description) {
    mapping.description = columns.find((column) => {
      return ![mapping.date, mapping.time, mapping.amount, mapping.money_in, mapping.money_out, mapping.balance].includes(column.columnKey)
        && ratio(rows.map((row) => row[column.columnKey] ?? '').filter(Boolean).slice(0, 10), isTextHeavy) >= 0.4;
    })?.columnKey;
  }

  if (!mapping.additional_description) {
    mapping.additional_description = columns.find((column) => {
      return ![mapping.date, mapping.time, mapping.description, mapping.reference, mapping.amount, mapping.money_in, mapping.money_out, mapping.balance].includes(column.columnKey)
        && ratio(rows.map((row) => row[column.columnKey] ?? '').filter(Boolean).slice(0, 10), isTextHeavy) >= 0.4;
    })?.columnKey;
  }

  if (!mapping.amount && (!mapping.money_in || !mapping.money_out)) {
    const inferred = inferMoneyInOut(columns, rows);
    mapping.money_in = mapping.money_in ?? inferred.moneyIn;
    mapping.money_out = mapping.money_out ?? inferred.moneyOut;
  }

  if (!mapping.amount && (!mapping.money_in || !mapping.money_out)) {
    const moneyColumns = monetaryColumns(columns, rows).filter((column) => column.columnKey !== mapping.balance);
    mapping.amount = moneyColumns[0]?.columnKey;
  }

  mapping.balance = mapping.balance ?? bestRunningBalanceColumn(columns, rows, mapping.amount);

  const amountMode: BankStatementAmountMode = mapping.amount ? 'signed' : 'separate';
  mapping.amountMode = amountMode;

  const hasRequiredAmount = amountMode === 'signed' ? Boolean(mapping.amount) : Boolean(mapping.money_in && mapping.money_out);
  const mappedRequired = [mapping.date, mapping.description, hasRequiredAmount ? 'amount' : undefined].filter(Boolean).length;
  const confidence = mappedRequired >= 3 ? 'high' : mappedRequired >= 2 ? 'medium' : 'low';
  const mappedHeaders = new Set(Object.values(mapping).filter((value): value is string => typeof value === 'string'));
  const unmappedHeaders = columns.filter((column) => !mappedHeaders.has(column.columnKey)).map((column) => column.displayName);

  return {
    mapping,
    confidence,
    unmappedHeaders,
    columns,
    amountMode,
    hasHeaders: table.hasHeaders,
    headerRowIndex: table.headerRowIndex,
  };
}

function getMapped(row: Record<string, string>, key?: string): string {
  if (!key) return '';
  return row[key]?.trim() ?? '';
}

function buildDisplayDescription(description: string, additionalDescription: string | null): string {
  const parts = [description, additionalDescription ?? '']
    .map((part) => part.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join(' - ');
}

function parseAmountPair(row: Record<string, string>, mapping: BankStatementColumnMapping): {
  moneyInPence: number;
  moneyOutPence: number;
  amountPence: number;
} {
  const amountMode = mapping.amountMode ?? (mapping.amount ? 'signed' : 'separate');
  if (amountMode === 'signed') {
    const amount = Number(parseMoneyToPence(getMapped(row, mapping.amount)));
    return {
      moneyInPence: amount > 0 ? amount : 0,
      moneyOutPence: amount < 0 ? Math.abs(amount) : 0,
      amountPence: amount,
    };
  }

  const moneyInPence = Number(parseMoneyToPence(getMapped(row, mapping.money_in)));
  const moneyOutPence = Number(parseMoneyToPence(getMapped(row, mapping.money_out)));
  return {
    moneyInPence: Math.abs(moneyInPence),
    moneyOutPence: Math.abs(moneyOutPence),
    amountPence: Math.abs(moneyInPence) - Math.abs(moneyOutPence),
  };
}

export function generateBankTransactionFingerprint(params: {
  workspaceId: string;
  bankAccountId: string;
  transactionDate: string | null;
  amountPence: number;
  description: string;
  reference?: string | null;
  runningBalancePence?: number | null;
}): string {
  const parts = [
    params.workspaceId,
    params.bankAccountId,
    params.transactionDate ?? '',
    params.amountPence.toString(),
    normalizeText(params.description),
    normalizeText(params.reference ?? ''),
    params.runningBalancePence?.toString() ?? '',
  ].join('|');
  return createHash('sha256').update(parts).digest('hex');
}

export function normaliseBankTransactionRow(params: {
  row: Record<string, string>;
  rowNumber: number;
  mapping: BankStatementColumnMapping;
  workspaceId: string;
  bankAccountId: string;
}): NormalisedBankTransactionRow {
  const transactionDate = parseBankDate(getMapped(params.row, params.mapping.date));
  const transactionTime = normaliseTime(getMapped(params.row, params.mapping.time));
  const description = getMapped(params.row, params.mapping.description);
  const additionalDescription = getMapped(params.row, params.mapping.additional_description) || null;
  const displayDescription = buildDisplayDescription(description, additionalDescription);
  const reference = getMapped(params.row, params.mapping.reference) || null;
  const { moneyInPence, moneyOutPence, amountPence } = parseAmountPair(params.row, params.mapping);
  const balanceRaw = getMapped(params.row, params.mapping.balance);
  const runningBalancePence = balanceRaw ? Number(parseMoneyToPence(balanceRaw)) : null;
  const raw = { ...params.row };
  if (transactionTime) raw.__transaction_time = transactionTime;
  raw.__row_number = String(params.rowNumber);
  raw.__mapping = JSON.stringify(params.mapping);

  const validation_errors = validateBankTransactionRow({
    transaction_date: transactionDate,
    description: displayDescription || description,
    money_in_pence: moneyInPence,
    money_out_pence: moneyOutPence,
    amount_pence: amountPence,
    amountMode: params.mapping.amountMode ?? (params.mapping.amount ? 'signed' : 'separate'),
  });
  const validation_warnings: string[] = [];
  if (description && looksLikeTime(description)) {
    validation_warnings.push(DESCRIPTION_TIME_WARNING);
  }
  if (
    params.mapping.amount
    && params.mapping.balance
    && (
      params.mapping.amount === params.mapping.balance
      || (runningBalancePence != null && amountPence === runningBalancePence)
    )
  ) {
    validation_warnings.push(AMOUNT_BALANCE_WARNING);
  }
  if (
    params.mapping.balance
    && params.mapping.amount
    && params.mapping.balance !== params.mapping.amount
    && runningBalancePence != null
    && Math.abs(runningBalancePence) === Math.abs(amountPence)
  ) {
    validation_warnings.push(BALANCE_AMOUNT_WARNING);
  }

  const fingerprint = generateBankTransactionFingerprint({
    workspaceId: params.workspaceId,
    bankAccountId: params.bankAccountId,
    transactionDate,
    amountPence,
    description: displayDescription || description,
    reference,
    runningBalancePence,
  });

  return {
    row_number: params.rowNumber,
    transaction_date: transactionDate,
    transaction_time: transactionTime,
    description: displayDescription || description,
    additional_description: additionalDescription,
    display_description: displayDescription || description,
    reference,
    money_in_pence: moneyInPence,
    money_out_pence: moneyOutPence,
    amount_pence: amountPence,
    running_balance_pence: runningBalancePence,
    fingerprint,
    raw,
    validation_errors,
    validation_warnings,
    validation_status: validation_errors.length > 0 ? 'error' : validation_warnings.length > 0 ? 'warning' : 'valid',
  };
}

export function normaliseStatementRows(params: {
  rows: Record<string, string>[];
  mapping: BankStatementColumnMapping;
  workspaceId: string;
  bankAccountId: string;
}): NormalisedBankTransactionRow[] {
  return params.rows.map((row, index) => normaliseBankTransactionRow({
    row,
    rowNumber: index + 1,
    mapping: params.mapping,
    workspaceId: params.workspaceId,
    bankAccountId: params.bankAccountId,
  }));
}

export function validateBankTransactionRow(row: {
  transaction_date: string | null;
  description: string;
  money_in_pence: number;
  money_out_pence: number;
  amount_pence: number;
  amountMode?: BankStatementAmountMode;
}): string[] {
  const errors: string[] = [];
  if (!row.transaction_date) errors.push('Transaction date is missing or invalid.');
  if (!row.description) errors.push('Description is required.');
  if (row.amount_pence === 0) errors.push('Transaction amount is zero or missing.');
  if (row.money_in_pence > 0 && row.money_out_pence > 0) errors.push('Money in and money out cannot both be populated.');
  if (row.amountMode === 'separate' && row.money_in_pence === 0 && row.money_out_pence === 0) {
    errors.push('Separate money in/out mode requires at least one amount per row.');
  }
  return errors;
}
