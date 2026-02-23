'use client';

import { useState, useCallback, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Upload, FileText, CheckCircle2, AlertTriangle, BookOpen, Landmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { importGivingCsv } from '@/lib/giving/actions';
import type { GivingImportResult } from '@/lib/giving/types';
import type { GivingImportSummary } from '@/lib/giving/types';
import { PROVIDER_LABELS } from '@/lib/giving-platforms/types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BankAccountOption {
  id: string;
  name: string;
}

interface Props {
  orgId: string;
  imports: GivingImportSummary[];
  activeProviders: string[];
  bankAccounts: BankAccountOption[];
}

const ALL_PROVIDERS = ['gocardless', 'sumup', 'izettle'] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function GivingImportsClient({ orgId, imports, activeProviders, bankAccounts }: Props) {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<string>(
    activeProviders[0] ?? 'gocardless'
  );
  const [file, setFile] = useState<File | null>(null);
  const [bankAccountId, setBankAccountId] = useState<string>(bankAccounts[0]?.id ?? '');
  const [result, setResult] = useState<GivingImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  // Stats
  const totalImports = imports.length;
  const totalInserted = imports.reduce((s, i) => s + i.inserted_count, 0);
  const totalJournals = imports.reduce((s, i) => s + i.journals_created, 0);

  // Filter imports by selected provider
  const filteredImports = imports.filter((i) => i.provider === selectedProvider);

  const handleImport = useCallback(() => {
    if (!file) {
      toast.error('Please select a CSV file.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set('provider', selectedProvider);
      formData.set('file', file);
      if (bankAccountId) {
        formData.set('bankAccountLedgerId', bankAccountId);
      }

      try {
        const importResult = await importGivingCsv(formData);
        setResult(importResult);

        if (importResult.inserted_count > 0) {
          toast.success(
            `Imported ${importResult.inserted_count} rows. ${importResult.journals_created} journal(s) created.`
          );
        } else if (importResult.skipped_count > 0) {
          toast.info('All rows were duplicates — nothing new to import.');
        } else if (importResult.error_count > 0) {
          toast.error('Import completed with errors. See details below.');
        }

        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Import failed.';
        toast.error(msg);
      }
    });
  }, [file, selectedProvider, router]);

  const handleReset = useCallback(() => {
    setFile(null);
    setResult(null);
  }, []);

  return (
    <div className="space-y-8">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Imports"
          value={totalImports}
          subtitle="Across all providers"
          href="/giving-imports"
          gradient="bg-gradient-to-br from-violet-500 to-violet-700"
          icon={<Upload size={20} />}
        />
        <StatCard
          title="Rows Imported"
          value={totalInserted}
          subtitle="Donation transactions"
          href="/giving-imports"
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-700"
          icon={<CheckCircle2 size={20} />}
        />
        <StatCard
          title="Journals Created"
          value={totalJournals}
          subtitle="Posted automatically"
          href="/journals"
          gradient="bg-gradient-to-br from-blue-500 to-blue-700"
          icon={<BookOpen size={20} />}
        />
      </div>

      {/* Provider tabs */}
      <div className="flex gap-2 border-b pb-2">
        {ALL_PROVIDERS.map((p) => {
          const isActive = activeProviders.includes(p);
          const isSelected = selectedProvider === p;
          return (
            <button
              key={p}
              onClick={() => {
                setSelectedProvider(p);
                setResult(null);
              }}
              disabled={!isActive}
              className={`px-4 py-2 text-sm rounded-t-md transition-colors ${
                isSelected
                  ? 'bg-primary text-primary-foreground font-medium'
                  : isActive
                  ? 'hover:bg-muted text-muted-foreground'
                  : 'text-muted-foreground/40 cursor-not-allowed'
              }`}
            >
              {PROVIDER_LABELS[p] ?? p}
              {!isActive && (
                <span className="ml-1 text-xs">(inactive)</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Upload section */}
      {!result ? (
        <Card className="border shadow-sm rounded-2xl">
          <CardHeader>
            <CardTitle>Import {PROVIDER_LABELS[selectedProvider] ?? selectedProvider} CSV</CardTitle>
            <CardDescription>
              Upload a CSV export from {PROVIDER_LABELS[selectedProvider] ?? selectedProvider}.
              Columns will be auto-detected. Duplicate rows are automatically skipped.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="csvFile">CSV File</Label>
              <Input
                id="csvFile"
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {bankAccounts.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="bankAccount">
                  <Landmark className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                  Bank Account for Payouts
                </Label>
                <p className="text-xs text-muted-foreground">
                  Select the bank account where platform payouts are received. Used to create payout journals.
                </p>
                <select
                  id="bankAccount"
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">No payout journals</option>
                  {bankAccounts.map((ba) => (
                    <option key={ba.id} value={ba.id}>
                      {ba.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleImport} disabled={!file || isPending}>
                {isPending ? 'Importing...' : 'Import CSV'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Results */
        <Card className="border shadow-sm rounded-2xl">
          <CardHeader>
            <CardTitle>Import Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
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
                <p className="text-muted-foreground">Skipped</p>
                <p className="text-2xl font-semibold text-yellow-600">
                  {result.skipped_count}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Errors</p>
                <p className="text-2xl font-semibold text-red-600">
                  {result.error_count}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Journals</p>
                <p className="text-2xl font-semibold text-blue-600">
                  {result.journals_created}
                </p>
              </div>
            </div>

            {result.sample_errors.length > 0 && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive space-y-1">
                <p className="font-medium flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> Errors:
                </p>
                {result.sample_errors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}

            {result.importId && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/giving-imports/${result.importId}`}>
                  View Import Details
                </Link>
              </Button>
            )}

            <Button onClick={handleReset} variant="outline">
              Import Another File
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Import history */}
      <Card className="border shadow-sm rounded-2xl">
        <CardHeader>
          <CardTitle>Import History — {PROVIDER_LABELS[selectedProvider] ?? selectedProvider}</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredImports.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date Range</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead className="text-right">Inserted</TableHead>
                    <TableHead className="text-right">Skipped</TableHead>
                    <TableHead className="text-right">Journals</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Imported</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredImports.map((imp) => (
                    <TableRow key={imp.id}>
                      <TableCell className="whitespace-nowrap">
                        {imp.import_start ?? '—'} → {imp.import_end ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {imp.file_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {imp.inserted_count}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {imp.skipped_count}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {imp.journals_created}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={imp.status === 'completed' ? 'default' : 'destructive'}
                        >
                          {imp.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(imp.created_at).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/giving-imports/${imp.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center space-y-3">
              <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="text-muted-foreground">
                No imports yet for {PROVIDER_LABELS[selectedProvider] ?? selectedProvider}.
              </p>
              <p className="text-sm text-muted-foreground">
                Upload a CSV above to get started.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
