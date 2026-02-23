'use client';

import { useState, useCallback } from 'react';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { importBankCsv, listRecentBankLines } from '@/lib/banking/importCsv';
import type { ImportResult } from '@/lib/banking/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  orgId: string;
  bankAccountId: string;
  bankAccountName: string;
}

interface BankLine {
  id: string;
  txn_date: string;
  description: string | null;
  reference: string | null;
  amount_pence: number;
  balance_pence: number | null;
}

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'results';

const REQUIRED_FIELDS = ['date', 'description', 'amount'] as const;
const OPTIONAL_FIELDS = ['reference', 'balance'] as const;
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS] as const;

const FIELD_LABELS: Record<string, string> = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount',
  reference: 'Reference',
  balance: 'Balance',
};

/* ------------------------------------------------------------------ */
/*  Column classification                                              */
/* ------------------------------------------------------------------ */

type ColumnType = 'date' | 'numeric' | 'text';

const DATE_PATTERN = /^(\d{1,2}[/\-.](\d{1,2}|\w{3})[/\-.]?\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s?\w{3}\s?\d{4})/;
const NUMERIC_PATTERN = /^[£$€()?\-\d,.\s]+$/;
const TIME_PATTERN = /^\d{1,2}:\d{2}(:\d{2})?$/;

/**
 * Classify a CSV column based on its sample values.
 * Returns 'date', 'numeric', or 'text'.
 */
function classifyColumn(
  header: string,
  rows: Record<string, string>[],
): ColumnType {
  const samples = rows.map((r) => r[header]?.trim()).filter(Boolean);
  if (samples.length === 0) return 'text';

  let dateHits = 0;
  let numericHits = 0;

  for (const s of samples) {
    if (DATE_PATTERN.test(s)) {
      dateHits++;
    } else if (TIME_PATTERN.test(s)) {
      // Times are neither date nor useful numeric — classify as text
    } else if (NUMERIC_PATTERN.test(s) && s.replace(/[£$€(),\-.\s]/g, '').length > 0) {
      numericHits++;
    }
  }

  const threshold = samples.length * 0.5;
  if (dateHits >= threshold) return 'date';
  if (numericHits >= threshold) return 'numeric';
  return 'text';
}

/**
 * Build a map of header -> ColumnType for all headers.
 */
function classifyAllColumns(
  headers: string[],
  rows: Record<string, string>[],
): Record<string, ColumnType> {
  const result: Record<string, ColumnType> = {};
  for (const h of headers) {
    result[h] = classifyColumn(h, rows);
  }
  return result;
}

/**
 * Which column types are relevant for each mapping field.
 */
const FIELD_COLUMN_TYPES: Record<string, ColumnType[]> = {
  date: ['date'],
  description: ['text'],
  amount: ['numeric'],
  reference: ['text', 'numeric'],
  balance: ['numeric'],
};

/**
 * Get filtered headers for a given field, based on column classification.
 * Returns the best-match headers first, with all remaining headers
 * available under an "Other columns" section.
 */
function getFilteredHeaders(
  field: string,
  headers: string[],
  classifications: Record<string, ColumnType>,
): { recommended: string[]; other: string[] } {
  const allowedTypes = FIELD_COLUMN_TYPES[field] ?? ['text', 'numeric', 'date'];

  const recommended: string[] = [];
  const other: string[] = [];

  for (const h of headers) {
    if (allowedTypes.includes(classifications[h])) {
      recommended.push(h);
    } else {
      other.push(h);
    }
  }

  return { recommended, other };
}

/* ------------------------------------------------------------------ */
/*  Auto-mapping heuristics                                            */
/* ------------------------------------------------------------------ */

const AUTO_MAP: Record<string, string[]> = {
  date: ['date', 'transaction date', 'txn date', 'trans date', 'value date', 'posting date'],
  description: ['description', 'details', 'narrative', 'memo', 'transaction description', 'particulars'],
  amount: ['amount', 'value', 'debit/credit', 'credit/debit', 'net amount'],
  reference: ['reference', 'ref', 'cheque no', 'check no', 'transaction ref'],
  balance: ['balance', 'running balance', 'closing balance', 'available balance'],
};

function autoMatch(
  headers: string[],
  classifications: Record<string, ColumnType>,
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  for (const field of ALL_FIELDS) {
    // First try name-based matching
    const candidates = AUTO_MAP[field] ?? [];
    const idx = lowerHeaders.findIndex((h) => candidates.includes(h));
    if (idx !== -1) {
      mapping[field] = headers[idx];
      continue;
    }

    // Fallback: if there's exactly one column of the right type, auto-select it
    const allowedTypes = FIELD_COLUMN_TYPES[field] ?? [];
    const typedColumns = headers.filter((h) => allowedTypes.includes(classifications[h]));
    if (typedColumns.length === 1) {
      mapping[field] = typedColumns[0];
    }
  }

  return mapping;
}

/* ------------------------------------------------------------------ */
/*  Header detection helpers                                           */
/* ------------------------------------------------------------------ */

/**
 * Detect whether a row looks like a genuine header row vs a data row.
 * Heuristic: a real header has no purely-numeric or date-like values.
 */
function looksLikeHeaderRow(fields: string[]): boolean {
  if (fields.length === 0) return false;

  let textCount = 0;
  for (const f of fields) {
    const v = f.trim();
    if (!v) continue;
    // If it parses as a number or looks like a date, it's probably data
    if (!isNaN(Number(v.replace(/[£$€,]/g, '')))) continue;
    if (/^\d{1,2}[/\-.]?\w{3}[/\-.]?\d{4}$/.test(v)) continue;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) continue;
    textCount++;
  }

  // If most fields are text-like (not numbers or dates), it's likely a header
  return textCount >= Math.ceil(fields.length * 0.5);
}

/**
 * Parse CSV with smart header detection.
 * Some bank CSVs have preamble rows (title, blank, metadata) before
 * the real header. This function finds the first row that looks like
 * a header and parses from there.
 */
function smartParseCsv(
  text: string,
  previewLimit: number = 5,
): {
  headers: string[];
  previewRows: Record<string, string>[];
  skippedPreambleLines: number;
} {
  // First, try normal header parse
  const normalParse = Papa.parse<Record<string, string>>(text, {
    header: true,
    preview: previewLimit + 1,
    skipEmptyLines: true,
  });

  const normalHeaders = normalParse.meta.fields ?? [];

  // Check if the detected headers look real
  if (normalHeaders.length > 0 && looksLikeHeaderRow(normalHeaders)) {
    return {
      headers: normalHeaders,
      previewRows: normalParse.data.slice(0, previewLimit),
      skippedPreambleLines: 0,
    };
  }

  // Headers look like data values — try parsing without headers to find the real one
  const rawParse = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
  });

  const allRows = rawParse.data;

  // Find the first row that looks like a header
  for (let i = 0; i < Math.min(allRows.length, 15); i++) {
    if (looksLikeHeaderRow(allRows[i])) {
      // Re-parse from this row onward
      const remainingLines = allRows.slice(i);
      const headerRow = remainingLines[0];
      const dataRows = remainingLines.slice(1, 1 + previewLimit);

      const headers = headerRow.map((h) => h.trim()).filter(Boolean);
      const previewRows: Record<string, string>[] = dataRows.map((row) => {
        const obj: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
          obj[headers[j]] = row[j] ?? '';
        }
        return obj;
      });

      return {
        headers,
        previewRows,
        skippedPreambleLines: i,
      };
    }
  }

  // Couldn't find a better header — fall back to the original parse
  return {
    headers: normalHeaders,
    previewRows: normalParse.data.slice(0, previewLimit),
    skippedPreambleLines: 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ImportForm({ orgId, bankAccountId, bankAccountName }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [recentLines, setRecentLines] = useState<BankLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [skippedPreamble, setSkippedPreamble] = useState(0);
  const [columnTypes, setColumnTypes] = useState<Record<string, ColumnType>>({});

  /* ---- Step 1: File upload ---- */
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;

      setFile(selectedFile);

      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const { headers: h, previewRows: rows, skippedPreambleLines } = smartParseCsv(text, 5);

        if (h.length === 0) {
          toast.error('Could not detect column headers in this CSV.');
          return;
        }

        const types = classifyAllColumns(h, rows);
        setHeaders(h);
        setPreviewRows(rows);
        setSkippedPreamble(skippedPreambleLines);
        setColumnTypes(types);
        setMapping(autoMatch(h, types));
        setStep('mapping');

        if (skippedPreambleLines > 0) {
          toast.info(`Skipped ${skippedPreambleLines} preamble row(s) before the header.`);
        }
      };
      reader.onerror = () => {
        toast.error('Failed to read file.');
      };
      reader.readAsText(selectedFile);
    },
    []
  );

  /* ---- Step 2: Mapping update ---- */
  const updateMapping = useCallback((field: string, headerName: string) => {
    setMapping((prev) => ({ ...prev, [field]: headerName }));
  }, []);

  const isMappingValid = REQUIRED_FIELDS.every((f) => !!mapping[f]);

  /* ---- Step 2→3: Preview ---- */
  const handleGoToPreview = useCallback(() => {
    if (!isMappingValid) {
      toast.error('Please map all required columns (Date, Description, Amount).');
      return;
    }
    setStep('preview');
  }, [isMappingValid]);

  /* ---- Step 3→4: Import ---- */
  const handleImport = useCallback(async () => {
    if (!file) return;

    setStep('importing');
    setLoading(true);

    const formData = new FormData();
    formData.set('orgId', orgId);
    formData.set('bankAccountId', bankAccountId);
    formData.set('file', file);
    formData.set('mapping', JSON.stringify(mapping));

    try {
      const importResult = await importBankCsv(formData);
      setResult(importResult);

      if (importResult.inserted_count > 0) {
        toast.success(`Imported ${importResult.inserted_count} of ${importResult.total_rows} transactions.`);
      } else if (importResult.skipped_duplicates > 0) {
        toast.info('All rows were duplicates — nothing new to import.');
      } else if (importResult.errors_count > 0) {
        toast.error('Import completed with errors. See details below.');
      }

      const { data } = await listRecentBankLines(orgId, bankAccountId);
      setRecentLines(data as BankLine[]);

      setStep('results');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed.';
      toast.error(msg);
      setStep('mapping');
    } finally {
      setLoading(false);
    }
  }, [file, mapping, orgId, bankAccountId]);

  /* ---- Reset ---- */
  const handleReset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setHeaders([]);
    setPreviewRows([]);
    setMapping({});
    setResult(null);
    setRecentLines([]);
    setSkippedPreamble(0);
    setColumnTypes({});
  }, []);

  /* ---- Get sample value for a header column ---- */
  const getSample = useCallback(
    (header: string) => {
      for (const row of previewRows) {
        const val = row[header]?.trim();
        if (val) return val;
      }
      return '';
    },
    [previewRows]
  );

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {(['upload', 'mapping', 'preview', 'results'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground/40">→</span>}
            <span
              className={
                step === s || (step === 'importing' && s === 'preview')
                  ? 'font-semibold text-foreground'
                  : ''
              }
            >
              {i + 1}. {s === 'upload' ? 'Upload' : s === 'mapping' ? 'Map Columns' : s === 'preview' ? 'Preview' : 'Results'}
            </span>
          </div>
        ))}
      </div>

      {/* ============================================================ */}
      {/* Step 1: Upload                                                */}
      {/* ============================================================ */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Upload CSV File</CardTitle>
            <CardDescription>
              Select a CSV bank statement to import into{' '}
              <strong>{bankAccountName}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <Label htmlFor="csvFile">CSV File</Label>
              <Input
                id="csvFile"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Supported date formats: DD/MM/YYYY, YYYY-MM-DD, 31Dec2025, and more.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* Step 2: Mapping                                               */}
      {/* ============================================================ */}
      {step === 'mapping' && (
        <Card>
          <CardHeader>
            <CardTitle>Map Columns</CardTitle>
            <CardDescription>
              Map your CSV columns to the required fields.
              {skippedPreamble > 0 && (
                <span className="ml-1 text-amber-600">
                  ({skippedPreamble} preamble row(s) were auto-skipped.)
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ALL_FIELDS.map((field) => {
                const isRequired = (REQUIRED_FIELDS as readonly string[]).includes(field);
                const { recommended } = getFilteredHeaders(field, headers, columnTypes);

                return (
                  <div key={field} className="flex flex-col gap-1.5">
                    <Label className="flex items-center gap-1">
                      {FIELD_LABELS[field]}
                      {isRequired && (
                        <span className="text-destructive">*</span>
                      )}
                    </Label>
                    <select
                      value={mapping[field] ?? ''}
                      onChange={(e) => updateMapping(field, e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">— Select column —</option>
                      {recommended.map((h) => {
                        const sample = getSample(h);
                        return (
                          <option key={h} value={h}>
                            {h}{sample ? ` (e.g. ${sample.length > 25 ? sample.slice(0, 25) + '…' : sample})` : ''}
                          </option>
                        );
                      })}
                    </select>
                    {/* Show selected column's sample value */}
                    {mapping[field] && (
                      <p className="text-xs text-muted-foreground truncate">
                        Sample: {getSample(mapping[field]) || '(empty)'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Preview table */}
            {previewRows.length > 0 && (
              <div className="mt-4">
                <Label className="mb-2 block text-sm font-medium">
                  CSV Preview (first {previewRows.length} rows)
                </Label>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {headers.map((h) => (
                          <th
                            key={h}
                            className="px-2 py-1.5 text-left font-medium whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {headers.map((h) => (
                            <td key={h} className="px-2 py-1 whitespace-nowrap">
                              {row[h] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={handleGoToPreview} disabled={!isMappingValid}>
                Next: Preview
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* Step 3: Preview mapped data                                   */}
      {/* ============================================================ */}
      {step === 'preview' && (
        <Card>
          <CardHeader>
            <CardTitle>Preview Mapped Data</CardTitle>
            <CardDescription>
              Verify the mapping looks correct before importing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    {mapping.reference && <TableHead>Reference</TableHead>}
                    {mapping.balance && (
                      <TableHead className="text-right">Balance</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {row[mapping.date] ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {row[mapping.description] ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {row[mapping.amount] ?? '—'}
                      </TableCell>
                      {mapping.reference && (
                        <TableCell className="text-xs">
                          {row[mapping.reference] ?? '—'}
                        </TableCell>
                      )}
                      {mapping.balance && (
                        <TableCell className="text-right font-mono text-xs">
                          {row[mapping.balance] ?? '—'}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              <p>
                <strong>{file?.name}</strong> — showing {previewRows.length} preview
                rows. The full file will be imported.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleImport} disabled={loading}>
                {loading ? 'Importing…' : 'Import All Rows'}
              </Button>
              <Button variant="outline" onClick={() => setStep('mapping')}>
                Back to Mapping
              </Button>
              <Button variant="ghost" onClick={handleReset}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* Step 3.5: Importing spinner                                   */}
      {/* ============================================================ */}
      {step === 'importing' && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <p className="text-muted-foreground">
              Importing transactions into <strong>{bankAccountName}</strong>…
            </p>
            <p className="text-xs text-muted-foreground">
              This may take a moment for large files.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/* Step 4: Results                                               */}
      {/* ============================================================ */}
      {step === 'results' && result && (
        <>
          {/* Summary card */}
          <Card>
            <CardHeader>
              <CardTitle>Import Results</CardTitle>
              <CardDescription>
                {result.inserted_count > 0
                  ? `Successfully imported ${result.inserted_count} transactions.`
                  : result.skipped_duplicates > 0
                  ? 'All rows were already imported (duplicates).'
                  : 'No rows were imported.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Rows</p>
                  <p className="text-2xl font-semibold">{result.total_rows}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Inserted</p>
                  <p className="text-2xl font-semibold text-green-600">
                    {result.inserted_count}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Duplicates Skipped</p>
                  <p className="text-2xl font-semibold text-yellow-600">
                    {result.skipped_duplicates}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Errors</p>
                  <p className="text-2xl font-semibold text-red-600">
                    {result.errors_count}
                  </p>
                </div>
              </div>

              {result.sample_errors.length > 0 && (
                <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive space-y-1">
                  <p className="font-medium">
                    Errors (showing first {result.sample_errors.length}):
                  </p>
                  {result.sample_errors.map((err, i) => (
                    <p key={i} className="text-xs">
                      {err}
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <Button onClick={handleReset}>Import Another File</Button>
                <Button asChild variant="outline">
                  <a href="/banking">Back to Banking</a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent lines table */}
          {recentLines.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions (Last 20)</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount (£)</TableHead>
                      <TableHead className="text-right">Balance (£)</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentLines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(line.txn_date).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {line.description || '—'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {line.reference || '—'}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${
                            line.amount_pence < 0
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`}
                        >
                          {(line.amount_pence / 100).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {line.balance_pence != null
                            ? (line.balance_pence / 100).toFixed(2)
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">Unmatched</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
