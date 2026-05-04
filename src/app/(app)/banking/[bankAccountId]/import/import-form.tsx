'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  importParsedBankStatement,
  parseBankStatementImport,
  reprocessBankStatementImport,
  uploadBankStatementFile,
} from '@/lib/banking/import-actions';
import type { ImportParsedStatementResult, StatementPreviewResult } from '@/lib/banking/import-actions.types';
import type { BankStatementAmountMode, BankStatementColumnMapping } from '@/lib/banking/statement-parser';
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

interface BankAccountOption {
  id: string;
  name: string;
}

interface Props {
  bankAccountId?: string;
  bankAccountName?: string;
  accounts?: BankAccountOption[];
}

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'results';
type MappingField = Exclude<keyof BankStatementColumnMapping, 'amountMode'>;

const FIELD_LABELS: Record<MappingField, string> = {
  date: 'Date',
  time: 'Time',
  description: 'Description',
  additional_description: 'Additional description / details',
  reference: 'Reference',
  money_in: 'Money in',
  money_out: 'Money out',
  amount: 'Transaction Amount',
  balance: 'Running Balance',
};

const FIELD_HELP: Record<MappingField, string> = {
  date: 'Required',
  time: 'Optional, used in preview and raw audit trace',
  description: 'Required',
  additional_description: 'Optional, combined with Description for clearer bank transaction display',
  reference: 'Optional payment ID, invoice number, donor reference, cheque number, card reference, or bank reference',
  money_in: 'Use with Money out when the file has separate credit/debit columns',
  money_out: 'Use with Money in when the file has separate credit/debit columns',
  amount: 'The amount that moved in or out of the account. Negative values are money out, positive values are money in.',
  balance: 'The bank account balance after this transaction. Used for checking statement accuracy.',
};

function formatMoney(value: number | null): string {
  if (value == null) return '—';
  return `£${Math.abs(value).toFixed(2)}`;
}

function statusBadge(row: StatementPreviewResult['preview_rows'][number]) {
  if (row.validation_status === 'error') {
    return <Badge variant="outline" className="border-danger/20 bg-danger-soft text-danger">Invalid</Badge>;
  }
  if (row.validation_status === 'warning') {
    return <Badge variant="outline" className="border-warning/20 bg-warning-soft text-warning">Warning</Badge>;
  }
  return <Badge variant="outline" className="border-success/20 bg-success-soft text-success">Valid</Badge>;
}

function formatPence(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value < 0 ? '-' : ''}£${Math.abs(value / 100).toFixed(2)}`;
}

function visibleMappingFields(amountMode: BankStatementAmountMode): MappingField[] {
  const base: MappingField[] = ['date', 'time', 'description', 'additional_description', 'reference'];
  const amountFields: MappingField[] = amountMode === 'signed' ? ['amount'] : ['money_in', 'money_out'];
  return [...base, ...amountFields, 'balance'];
}

function columnOptionLabel(column: StatementPreviewResult['columns'][number]): string {
  const samples = column.sampleValues.slice(0, 3).join(' | ');
  return samples ? `${column.displayName} - ${samples}` : column.displayName;
}

function columnDisplayName(preview: StatementPreviewResult | null, columnKey?: string): string {
  if (!columnKey || !preview) return 'Not detected';
  return preview.columns.find((column) => column.columnKey === columnKey)?.displayName ?? columnKey;
}

function mappedSummaryValue(preview: StatementPreviewResult | null, mapping: BankStatementColumnMapping, field: MappingField): string {
  if (field === 'description' && mapping.description && mapping.additional_description) {
    return `${columnDisplayName(preview, mapping.description)} + ${columnDisplayName(preview, mapping.additional_description)}`;
  }
  return columnDisplayName(preview, mapping[field]);
}

function downloadInvalidRows(preview: StatementPreviewResult | null) {
  if (!preview) return;
  const rows = preview.invalid_rows.map((row) => ({
    row_number: row.row_number,
    errors: row.validation_errors.join('; '),
    warnings: row.validation_warnings.join('; '),
    raw: JSON.stringify(row.raw).replaceAll('"', '""'),
  }));
  const csv = [
    'row_number,errors,warnings,raw',
    ...rows.map((row) => `${row.row_number},"${row.errors}","${row.warnings}","${row.raw}"`),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bank-statement-errors-${preview.statement_import_id ?? 'preview'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportForm({ bankAccountId, bankAccountName, accounts = [] }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [selectedAccountId, setSelectedAccountId] = useState(bankAccountId ?? accounts[0]?.id ?? '');
  const [preview, setPreview] = useState<StatementPreviewResult | null>(null);
  const [mapping, setMapping] = useState<BankStatementColumnMapping>({});
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [mappingName, setMappingName] = useState('');
  const [result, setResult] = useState<ImportParsedStatementResult | null>(null);
  const [existingImportMode, setExistingImportMode] = useState(false);
  const [showAdvancedMapping, setShowAdvancedMapping] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedAccountName = useMemo(() => {
    if (bankAccountName) return bankAccountName;
    return accounts.find((account) => account.id === selectedAccountId)?.name ?? 'selected account';
  }, [accounts, bankAccountName, selectedAccountId]);

  async function handleUpload(formData: FormData) {
    if (selectedAccountId) formData.set('bankAccountId', selectedAccountId);
    startTransition(async () => {
      const uploaded = await uploadBankStatementFile(formData);
      if (!uploaded.ok || !uploaded.statement_import_id) {
        if (!uploaded.duplicate_statement_import_id) {
          toast.error(uploaded.error ?? 'Upload failed.');
          return;
        }
        toast.warning('This file was already uploaded. You can review the mapping and reprocess it if all rows are still unmatched.');
        const parsed = await parseBankStatementImport({ statementImportId: uploaded.duplicate_statement_import_id });
        if (!parsed.ok) {
          toast.error(parsed.error ?? 'Statement parsing failed.');
          return;
        }
        setExistingImportMode(true);
        setPreview(parsed);
        setMapping(parsed.mapping);
        setStep('mapping');
        return;
      }

      const parsed = await parseBankStatementImport({ statementImportId: uploaded.statement_import_id });
      if (!parsed.ok) {
        toast.error(parsed.error ?? 'Statement parsing failed.');
        return;
      }

      setExistingImportMode(false);
      setPreview(parsed);
      setMapping(parsed.mapping);
      setShowAdvancedMapping(parsed.confidence !== 'high' || parsed.summary.invalid_rows > 0);
      setStep(parsed.confidence === 'high' && parsed.summary.invalid_rows === 0 && !parsed.saved_template_applied ? 'preview' : 'mapping');
      toast.success('Statement uploaded and analysed.');
    });
  }

  function refreshPreview(nextMapping: BankStatementColumnMapping) {
    if (!preview?.statement_import_id) return;
    startTransition(async () => {
      const parsed = await parseBankStatementImport({
        statementImportId: preview.statement_import_id!,
        mapping: nextMapping,
      });
      if (!parsed.ok) {
        toast.error(parsed.error ?? 'Could not refresh preview.');
        return;
      }
      setPreview(parsed);
      setMapping(parsed.mapping);
      setShowAdvancedMapping(false);
      setStep('preview');
    });
  }

  function handleImport() {
    if (!preview?.statement_import_id) return;
    setStep('importing');
    startTransition(async () => {
      const imported = await importParsedBankStatement({
        statementImportId: preview.statement_import_id!,
        mapping,
        saveMapping: saveTemplate,
        mappingName,
      });
      setResult(imported);
      setStep('results');
      if (imported.ok) toast.success('Statement import complete.');
      else toast.error(imported.error ?? 'Statement import failed.');
    });
  }

  function handleReprocess() {
    if (!preview?.statement_import_id) return;
    setStep('importing');
    startTransition(async () => {
      const imported = await reprocessBankStatementImport({
        statementImportId: preview.statement_import_id!,
        mapping,
        saveMapping: saveTemplate,
        mappingName,
      });
      setResult(imported);
      setStep('results');
      if (imported.ok) toast.success('Statement reprocessed with corrected mapping.');
      else toast.error(imported.error ?? 'Statement reprocess failed.');
    });
  }

  const columns = preview?.columns ?? [];
  const amountMode = mapping.amountMode ?? preview?.amountMode ?? 'signed';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Upload statement</CardTitle>
          <CardDescription>
            CSV and XLSX files are stored privately before parsing. Re-uploaded files are blocked by file hash.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleUpload} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            {!bankAccountId && (
              <div className="space-y-2">
                <Label htmlFor="bankAccountId">Bank account</Label>
                <select
                  id="bankAccountId"
                  name="bankAccountId"
                  value={selectedAccountId}
                  onChange={(event) => setSelectedAccountId(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  required
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </div>
            )}
            {bankAccountId && <input type="hidden" name="bankAccountId" value={bankAccountId} />}
            <div className="space-y-2">
              <Label htmlFor="file">Statement file</Label>
              <Input id="file" name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={isPending || !selectedAccountId}>
                {isPending && step === 'upload' ? 'Uploading...' : 'Upload and analyse'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>2. Detected statement format</CardTitle>
                <CardDescription>
                  Confirm the plain-language mapping before importing into {selectedAccountName}.
                </CardDescription>
              </div>
              <Badge variant={preview.confidence === 'high' ? 'default' : 'secondary'}>
                {preview.confidence} confidence
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.detection_reasons.length > 0 && (
              <p className="text-sm text-muted-foreground">{preview.detection_reasons.join(' · ')}</p>
            )}
            <div className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-2">
              {[
                ['date', 'Date'],
                ['time', 'Time'],
                ['description', 'Description'],
                ['reference', 'Reference'],
                [amountMode === 'signed' ? 'amount' : 'money_in', amountMode === 'signed' ? 'Transaction Amount' : 'Money In'],
                [amountMode === 'signed' ? 'balance' : 'money_out', amountMode === 'signed' ? 'Running Balance' : 'Money Out'],
                ...(amountMode === 'separate' ? [['balance', 'Running Balance']] as [MappingField, string][] : []),
              ].map(([field, label]) => (
                <div key={`${field}-${label}`} className="flex items-start justify-between gap-3 rounded-xl border border-border/70 p-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-1 text-sm font-semibold">{mappedSummaryValue(preview, mapping, field as MappingField)}</p>
                  </div>
                  {mappedSummaryValue(preview, mapping, field as MappingField) === 'Not detected' && (
                    <Badge variant="outline">Optional</Badge>
                  )}
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-muted bg-muted/30 p-4 text-sm text-muted-foreground">
              <p><strong className="text-foreground">Transaction Amount:</strong> The amount that moved in or out of the account. Negative values are money out, positive values are money in.</p>
              <p className="mt-2"><strong className="text-foreground">Running Balance:</strong> The bank account balance after this transaction. Used for checking statement accuracy.</p>
              <p className="mt-2"><strong className="text-foreground">Reference:</strong> A payment ID, invoice number, donor reference, standing order reference, cheque number, card reference, or bank reference used to help match transactions.</p>
            </div>
            {preview.saved_template_applied && (
              <div className="rounded-xl border border-success/20 bg-success-soft p-3 text-sm text-success">
                Saved template applied: {preview.saved_template_name}
              </div>
            )}
            {existingImportMode && (
              <div className="rounded-xl border border-warning/20 bg-warning-soft p-3 text-sm text-warning">
                This statement already has an import record. Reprocessing is only allowed while all rows from the import are still unmatched and unreconciled.
              </div>
            )}
            <Button type="button" variant="outline" onClick={() => setShowAdvancedMapping((value) => !value)}>
              {showAdvancedMapping ? 'Hide advanced mapping' : 'Advanced: Edit column mapping'}
            </Button>
            {showAdvancedMapping && (
              <div className="space-y-4 rounded-2xl border p-4">
                <div className="overflow-x-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Column</TableHead>
                        <TableHead>Sample values</TableHead>
                        <TableHead>Detected as</TableHead>
                        <TableHead>Confidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {columns.map((column) => (
                        <TableRow key={column.columnKey} className={column.sampleValues.length === 0 ? 'opacity-50' : undefined}>
                          <TableCell>
                            <div className="font-medium">{column.displayName}</div>
                            <div className="text-xs text-muted-foreground">{column.columnKey}</div>
                          </TableCell>
                          <TableCell className="max-w-[360px] text-sm text-muted-foreground">
                            {column.sampleValues.length > 0 ? column.sampleValues.join(' | ') : 'Empty / unknown'}
                          </TableCell>
                          <TableCell>{column.detectedType.replaceAll('_', ' ')}</TableCell>
                          <TableCell>
                            <Badge variant={column.confidence === 'high' ? 'default' : 'secondary'}>{column.confidence}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="max-w-md space-y-2">
                  <Label htmlFor="amountMode">Amount format</Label>
                  <select
                    id="amountMode"
                    value={amountMode}
                    onChange={(event) => {
                      const nextMode = event.target.value as BankStatementAmountMode;
                      setMapping((current) => ({
                        ...current,
                        amountMode: nextMode,
                        amount: nextMode === 'signed' ? current.amount : undefined,
                        money_in: nextMode === 'separate' ? current.money_in : undefined,
                        money_out: nextMode === 'separate' ? current.money_out : undefined,
                      }));
                    }}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="signed">Single transaction amount column</option>
                    <option value="separate">Separate money in and money out columns</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Transaction amount mode expects one positive/negative amount column. Separate mode expects money in and money out columns.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {visibleMappingFields(amountMode).map((field) => (
                    <div key={field} className="space-y-2">
                      <Label htmlFor={`mapping-${field}`}>{FIELD_LABELS[field]}</Label>
                      <select
                        id={`mapping-${field}`}
                        value={mapping[field] ?? ''}
                        onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value || undefined }))}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">Not mapped</option>
                        {columns.map((column) => (
                          <option key={column.columnKey} value={column.columnKey}>{columnOptionLabel(column)}</option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">{FIELD_HELP[field]}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" disabled={isPending} onClick={() => refreshPreview(mapping)}>
                Refresh preview
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={saveTemplate}
                  onChange={(event) => setSaveTemplate(event.target.checked)}
                />
                Save this mapping template
              </label>
              {saveTemplate && (
                <Input
                  value={mappingName}
                  onChange={(event) => setMappingName(event.target.value)}
                  placeholder="Template name"
                  className="max-w-xs"
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {preview && (step === 'preview' || step === 'mapping' || step === 'importing' || step === 'results') && (
        <Card>
          <CardHeader>
            <CardTitle>3. Preview and validation</CardTitle>
            <CardDescription>
              Valid non-duplicate rows will be imported. Invalid rows stay in the report for correction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">Rows detected</p>
                <p className="text-2xl font-semibold">{preview.summary.rows_detected}</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">Valid / invalid</p>
                <p className="text-2xl font-semibold">{preview.summary.valid_rows} / {preview.summary.invalid_rows}</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">Duplicates</p>
                <p className="text-2xl font-semibold">{preview.summary.duplicate_rows}</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">Date range</p>
                <p className="text-sm font-medium">{preview.summary.date_start ?? '—'} to {preview.summary.date_end ?? '—'}</p>
              </div>
            </div>
            <div className="rounded-xl border p-4 text-sm">
              Opening balance {formatMoney(preview.summary.opening_balance)} · Closing balance {formatMoney(preview.summary.closing_balance)}
            </div>

            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Money in</TableHead>
                    <TableHead className="text-right">Money out</TableHead>
                    <TableHead className="text-right">Transaction Amount</TableHead>
                    <TableHead className="text-right">Running Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.preview_rows.map((row) => (
                    <TableRow key={row.row_number}>
                      <TableCell>{row.row_number}</TableCell>
                      <TableCell>{row.transaction_date ?? '—'}</TableCell>
                      <TableCell>{row.transaction_time ?? '—'}</TableCell>
                      <TableCell className="max-w-[260px] truncate">{row.display_description || row.description || '—'}</TableCell>
                      <TableCell>{row.reference ?? '—'}</TableCell>
                      <TableCell className="text-right text-success">
                        {formatPence(row.money_in_pence > 0 ? row.money_in_pence : null)}
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {formatPence(row.money_out_pence > 0 ? row.money_out_pence : null)}
                      </TableCell>
                      <TableCell className={row.amount_pence < 0 ? 'text-right text-foreground' : 'text-right text-success'}>
                        {formatPence(row.amount_pence)}
                      </TableCell>
                      <TableCell className="text-right">{formatPence(row.running_balance_pence)}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {statusBadge(row)}
                          {[...row.validation_errors, ...row.validation_warnings].slice(0, 2).map((message) => (
                            <p key={message} className="max-w-[260px] text-xs text-muted-foreground">{message}</p>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={() => downloadInvalidRows(preview)} disabled={preview.invalid_rows.length === 0}>
                Download error report
              </Button>
              <div className="flex gap-2">
                <Button asChild variant="outline">
                  <Link href="/banking">Cancel</Link>
                </Button>
                <Button type="button" onClick={handleImport} disabled={isPending || preview.summary.valid_rows === 0 || step === 'importing'}>
                  {step === 'importing' ? 'Importing...' : 'Import valid rows'}
                </Button>
                {existingImportMode && (
                  <Button type="button" variant="secondary" onClick={handleReprocess} disabled={isPending || preview.summary.valid_rows === 0 || step === 'importing'}>
                    Reprocess import with corrected mapping
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {result && step === 'results' && (
        <Card>
          <CardHeader>
            <CardTitle>Import result</CardTitle>
            <CardDescription>
              {result.ok ? 'Statement import completed.' : result.error}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">Imported</p>
                <p className="text-2xl font-semibold">{result.inserted_count}</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">Duplicates skipped</p>
                <p className="text-2xl font-semibold">{result.skipped_duplicates}</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">Errors</p>
                <p className="text-2xl font-semibold">{result.errors_count}</p>
              </div>
            </div>
            {result.sample_errors.length > 0 && (
              <div className="rounded-xl border border-warning/20 bg-warning-soft p-4 text-sm text-warning">
                {result.sample_errors.join(' · ')}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/banking/${selectedAccountId}`}>View transactions</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/reconciliation">Go to reconciliation</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
