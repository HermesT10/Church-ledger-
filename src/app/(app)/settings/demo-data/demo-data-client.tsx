'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  generateDemoData,
  clearDemoData,
} from './actions';
import type { DemoBatchInfo } from './types';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface DemoDataClientProps {
  orgId: string;
  initialBatchInfo: DemoBatchInfo;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DemoDataClient({ orgId, initialBatchInfo }: DemoDataClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [batchInfo, setBatchInfo] = useState(initialBatchInfo);
  const [generateInput, setGenerateInput] = useState('');
  const [clearInput, setClearInput] = useState('');
  const [result, setResult] = useState<{
    type: 'generate' | 'clear';
    success: boolean;
    message: string;
    batchId?: string;
    counts?: Record<string, number>;
  } | null>(null);

  const canGenerate = generateInput === 'GENERATE DEMO DATA';
  const canClear = clearInput === 'CLEAR DEMO DATA';
  const hasDemoData = batchInfo.totalDemoRecords > 0;

  function handleGenerate() {
    startTransition(async () => {
      setResult(null);
      const res = await generateDemoData(orgId);
      if (res.success) {
        setResult({
          type: 'generate',
          success: true,
          message: `Demo data generated successfully.`,
          batchId: res.batchId ?? undefined,
        });
        setGenerateInput('');
        router.refresh();
      } else {
        setResult({
          type: 'generate',
          success: false,
          message: res.error ?? 'Unknown error.',
        });
      }
    });
  }

  function handleClear() {
    startTransition(async () => {
      setResult(null);
      const res = await clearDemoData(orgId);
      if (res.success) {
        const totalDeleted = Object.values(res.deletedCounts).reduce(
          (s, v) => s + v,
          0,
        );
        setResult({
          type: 'clear',
          success: true,
          message: `Cleared ${totalDeleted} demo records.`,
          counts: res.deletedCounts,
        });
        setClearInput('');
        setBatchInfo({ totalDemoRecords: 0, counts: {} });
        router.refresh();
      } else {
        setResult({
          type: 'clear',
          success: false,
          message: res.error ?? 'Unknown error.',
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Warning Card */}
      <Card className="border-amber-200 bg-amber-100/75">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <CardTitle className="text-base text-amber-800">
              Demo Data Warning
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-amber-700">
            Generating demo data will create realistic sample records across your
            organisation: funds, accounts, bank accounts, bank lines, journals,
            suppliers, bills, payment runs, donors, donations, gift aid claims,
            giving imports, and payroll runs. All demo records are tagged with a
            batch ID and can be removed at any time without affecting real data.
          </p>
        </CardContent>
      </Card>

      {/* Generate Section */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle>Generate Demo Data</CardTitle>
          <CardDescription>
            Create a complete set of sample data for end-to-end testing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="generate-confirm" className="text-sm">
              Type <span className="font-mono font-bold">GENERATE DEMO DATA</span> to
              confirm
            </Label>
            <Input
              id="generate-confirm"
              placeholder="GENERATE DEMO DATA"
              value={generateInput}
              onChange={(e) => setGenerateInput(e.target.value)}
              className="font-mono"
            />
          </div>
          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || isPending}
            className="w-full sm:w-auto"
          >
            {isPending && result === null
              ? 'Generating...'
              : 'Generate Demo Data'}
          </Button>
        </CardContent>
      </Card>

      {/* Clear Section (only shown if demo data exists) */}
      {hasDemoData && (
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Clear Demo Data</CardTitle>
                <CardDescription>
                  Remove all demo-tagged records from this organisation
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs">
                {batchInfo.totalDemoRecords} demo records
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Demo record counts */}
            <div className="rounded-lg border p-4">
              <p className="mb-2 text-sm font-medium">
                Demo records by table
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {Object.entries(batchInfo.counts)
                  .filter(([, count]) => count > 0)
                  .map(([table, count]) => (
                    <div
                      key={table}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">{table}</span>
                      <span className="font-mono">{count}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clear-confirm" className="text-sm">
                Type{' '}
                <span className="font-mono font-bold">CLEAR DEMO DATA</span> to
                confirm
              </Label>
              <Input
                id="clear-confirm"
                placeholder="CLEAR DEMO DATA"
                value={clearInput}
                onChange={(e) => setClearInput(e.target.value)}
                className="font-mono"
              />
            </div>
            <Button
              variant="destructive"
              onClick={handleClear}
              disabled={!canClear || isPending}
              className="w-full sm:w-auto"
            >
              {isPending && result === null
                ? 'Clearing...'
                : 'Clear Demo Data'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Result Display */}
      {result && (
        <Card
          className={
            result.success
              ? 'border-green-200 bg-green-100/75'
              : 'border-destructive/30 bg-destructive/5'
          }
        >
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {result.success ? (
                <svg
                  className="mt-0.5 h-5 w-5 text-green-600 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              ) : (
                <svg
                  className="mt-0.5 h-5 w-5 text-destructive shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
              <div>
                <p
                  className={`text-sm font-medium ${
                    result.success ? 'text-green-800' : 'text-destructive'
                  }`}
                >
                  {result.message}
                </p>
                {result.batchId && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Batch ID:{' '}
                    <span className="font-mono">{result.batchId}</span>
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
