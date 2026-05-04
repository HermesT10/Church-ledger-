'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Database, History, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  deleteDemoDataAction,
  getWorkspaceDataResetHistory,
  getWorkspaceDataResetPreview,
  resetFinancialDataAction,
  type WorkspaceResetHistoryItem,
  type WorkspaceResetPreview,
  type WorkspaceResetResult,
} from './actions';

interface Props {
  initialDemoPreview: WorkspaceResetPreview;
  initialResetPreview: WorkspaceResetPreview;
  initialHistory: WorkspaceResetHistoryItem[];
}

interface ActionCardProps {
  title: string;
  description: string;
  confirmationPhrase: string;
  destructiveLabel: string;
  preview: WorkspaceResetPreview;
  variant: 'demo' | 'reset';
  onRefresh: () => void;
  onSubmit: (input: { confirmation: string; deleteDocuments: boolean; deleteReportExports: boolean }) => Promise<WorkspaceResetResult>;
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-GB').format(value);
}

function formatDate(value: string | null) {
  if (!value) return 'Not completed';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function topModules(preview: WorkspaceResetPreview) {
  return Object.entries(preview.modules)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
}

function topTables(preview: WorkspaceResetPreview) {
  return Object.entries(preview.counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
}

function ActionCard({
  title,
  description,
  confirmationPhrase,
  destructiveLabel,
  preview,
  variant,
  onRefresh,
  onSubmit,
}: ActionCardProps) {
  const [deleteDocuments, setDeleteDocuments] = useState(preview.options.deleteDocuments);
  const [deleteReportExports, setDeleteReportExports] = useState(preview.options.deleteReportExports);
  const [confirmation, setConfirmation] = useState('');
  const [result, setResult] = useState<WorkspaceResetResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const modules = useMemo(() => topModules(preview), [preview]);
  const tables = useMemo(() => topTables(preview), [preview]);
  const canSubmit =
    confirmation === confirmationPhrase && !isPending && !preview.previewError;

  const refreshPreview = () => {
    startTransition(() => {
      onRefresh();
    });
  };

  const submit = () => {
    startTransition(async () => {
      const response = await onSubmit({ confirmation, deleteDocuments, deleteReportExports });
      setResult(response);
      if (response.success) {
        toast.success(`${destructiveLabel} completed`);
        if (response.warning) {
          toast.warning(response.warning);
        }
        setConfirmation('');
        onRefresh();
      } else {
        toast.error(response.error ?? `${destructiveLabel} failed`);
      }
    });
  };

  return (
    <Card className="rounded-3xl border-border/70 shadow-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {variant === 'demo' ? <Trash2 size={18} /> : <AlertTriangle size={18} className="text-destructive" />}
              {title}
            </CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <Badge variant={preview.total > 0 ? 'secondary' : 'outline'}>
            {formatCount(preview.total)} rows
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {preview.previewError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-medium">Preview failed</p>
            <p className="mt-1">{preview.previewError}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Check server logs and ensure <code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code> matches this project. Operations below may fail until preview works.
            </p>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {preview.previewError ? null : modules.length > 0 ? modules.map(([module, count]) => (
            <div key={module} className="rounded-2xl border border-border/70 bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{module.replaceAll('_', ' ')}</p>
              <p className="mt-1 text-xl font-semibold">{formatCount(count)}</p>
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground sm:col-span-2">
              No matching rows found for this action.
            </div>
          )}
        </div>

        {!preview.previewError && tables.length > 0 && (
          <div className="rounded-2xl border border-border/70">
            <div className="border-b border-border/70 px-4 py-2 text-sm font-medium">Largest affected tables</div>
            <div className="divide-y divide-border/70">
              {tables.map(([table, count]) => (
                <div key={table} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-muted-foreground">{table}</span>
                  <span className="font-medium">{formatCount(count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-border/70 p-4">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={deleteDocuments} onCheckedChange={(checked) => setDeleteDocuments(checked === true)} />
            <span>
              Delete linked document artifacts
              <span className="block text-xs text-muted-foreground">Includes generated document/export versions when present.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={deleteReportExports} onCheckedChange={(checked) => setDeleteReportExports(checked === true)} />
            <span>
              Delete report exports
              <span className="block text-xs text-muted-foreground">Includes report export rows and exported report versions.</span>
            </span>
          </label>
          <Button variant="outline" size="sm" onClick={refreshPreview} disabled={isPending}>
            Refresh Preview
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${variant}-confirmation`}>
            Type <span className="font-semibold">{confirmationPhrase}</span> to confirm
          </Label>
          <Input
            id={`${variant}-confirmation`}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={confirmationPhrase}
          />
        </div>

        {result && (
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm">
            {result.success ? (
              <div className="space-y-2">
                <p className="flex items-center gap-2 font-medium">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  Completed. {formatCount(result.total)} rows changed.
                </p>
                {result.warning ? (
                  <p className="flex items-start gap-2 text-amber-700 dark:text-amber-500">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    {result.warning}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="font-medium text-destructive">{result.error}</p>
            )}
          </div>
        )}

        <Button
          variant="destructive"
          className="w-full"
          onClick={submit}
          disabled={!canSubmit}
        >
          {isPending ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
          {destructiveLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

export function DataManagementClient({
  initialDemoPreview,
  initialResetPreview,
  initialHistory,
}: Props) {
  const [demoPreview, setDemoPreview] = useState(initialDemoPreview);
  const [resetPreview, setResetPreview] = useState(initialResetPreview);
  const [history, setHistory] = useState(initialHistory);

  const refreshAll = async () => {
    const [demo, reset, nextHistory] = await Promise.all([
      getWorkspaceDataResetPreview('demo', demoPreview.options),
      getWorkspaceDataResetPreview('financial', resetPreview.options),
      getWorkspaceDataResetHistory(),
    ]);
    setDemoPreview(demo);
    setResetPreview(reset);
    setHistory(nextHistory);
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-destructive/20 bg-destructive/5 shadow-card">
        <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 text-destructive" size={20} />
            <div>
              <p className="font-semibold">Organisation access and settings are preserved.</p>
              <p className="text-sm text-muted-foreground">
                These tools remove data scoped to the active workspace only. Members, roles, profile details, and audit logs remain.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={refreshAll}>
            Refresh All
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <ActionCard
          title="Delete legacy demo data"
          description="Remove rows registered or tagged as demo from older tooling. For a completely empty ledger, use Reset Financial Data."
          confirmationPhrase="DELETE DEMO"
          destructiveLabel="Delete legacy demo data"
          preview={demoPreview}
          variant="demo"
          onRefresh={refreshAll}
          onSubmit={deleteDemoDataAction}
        />
        <ActionCard
          title="Reset Financial Data"
          description="Clear financial activity, bank accounts, accounts, funds, and setup progress while keeping users, roles, and organisation profile settings."
          confirmationPhrase="RESET"
          destructiveLabel="Reset Financial Data"
          preview={resetPreview}
          variant="reset"
          onRefresh={refreshAll}
          onSubmit={resetFinancialDataAction}
        />
      </div>

      <Card className="rounded-3xl border-border/70 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History size={18} />
            Reset History
          </CardTitle>
          <CardDescription>Recent data management actions for this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length > 0 ? (
            <div className="divide-y divide-border/70 rounded-2xl border border-border/70">
              {history.map((item) => (
                <div key={item.id} className="grid gap-2 p-4 md:grid-cols-[1fr_auto]">
                  <div>
                    <p className="font-medium">
                      {item.actionType === 'delete_demo_data' ? 'Delete legacy demo data' : 'Reset financial data'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Requested by {item.requestedByName ?? 'Unknown'} on {formatDate(item.createdAt)}
                    </p>
                    {item.error && <p className="mt-1 text-sm text-destructive">{item.error}</p>}
                  </div>
                  <div className="text-left md:text-right">
                    <Badge variant={item.status === 'completed' ? 'secondary' : item.status === 'failed' ? 'destructive' : 'outline'}>
                      {item.status}
                    </Badge>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatCount(Number((item.counts.total as number | undefined) ?? 0))} rows
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
              No reset history yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
