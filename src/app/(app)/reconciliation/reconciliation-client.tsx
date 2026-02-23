'use client';

import { Fragment, useState, useCallback, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  Search,
  X,
  Sparkles,
  Link2Off,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import {
  getUnreconciledBankLines,
  getReconciledBankLines,
  getReconciliationStats,
  suggestMatches,
  createMatch,
  removeMatch,
} from '@/lib/reconciliation/actions';
import type { UnreconciledBankLine, ReconciledBankLine, ReconciliationStats } from '@/lib/reconciliation/types';
import type { MatchCandidate } from '@/lib/reconciliation/matching';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  bankAccounts: { id: string; name: string }[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function penceToPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function scoreBadge(score: number) {
  if (score >= 70) return <Badge className="bg-green-100 text-green-800 border-green-200">{score}%</Badge>;
  if (score >= 40) return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">{score}%</Badge>;
  return <Badge className="bg-gray-100 text-gray-600 border-gray-200">{score}%</Badge>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ReconciliationClient({ bankAccounts }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialBankId = searchParams.get('bankAccount') ?? bankAccounts[0]?.id ?? '';

  const [selectedBankId, setSelectedBankId] = useState(initialBankId);
  const [stats, setStats] = useState<ReconciliationStats | null>(null);
  const [unreconciledLines, setUnreconciledLines] = useState<UnreconciledBankLine[]>([]);
  const [reconciledLines, setReconciledLines] = useState<ReconciledBankLine[]>([]);
  const [showReconciled, setShowReconciled] = useState(false);
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MatchCandidate[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  /* ---- Load data ---- */
  const loadData = useCallback(
    (bankId: string) => {
      startTransition(async () => {
        const dateFrom = searchParams.get('dateFrom') ?? undefined;
        const dateTo = searchParams.get('dateTo') ?? undefined;

        const [statsRes, unrecRes, recRes] = await Promise.all([
          getReconciliationStats(bankId),
          getUnreconciledBankLines(bankId, dateFrom, dateTo),
          getReconciledBankLines(bankId, dateFrom, dateTo),
        ]);

        setStats(statsRes.data);
        setUnreconciledLines(unrecRes.data);
        setReconciledLines(recRes.data);
        setLoaded(true);
        setExpandedLineId(null);
        setSuggestions([]);
      });
    },
    [searchParams]
  );

  /* ---- Initial + bank account change ---- */
  const handleBankChange = useCallback(
    (bankId: string) => {
      setSelectedBankId(bankId);
      setLoaded(false);
      loadData(bankId);
    },
    [loadData]
  );

  /* ---- Load on first render ---- */
  useEffect(() => {
    if (!loaded && selectedBankId) {
      loadData(selectedBankId);
    }
  }, [loaded, selectedBankId, loadData]);

  /* ---- Suggest matches for a bank line ---- */
  const handleSuggest = useCallback(
    async (bankLineId: string) => {
      if (expandedLineId === bankLineId) {
        setExpandedLineId(null);
        setSuggestions([]);
        return;
      }
      setExpandedLineId(bankLineId);
      setSuggestionsLoading(true);
      const result = await suggestMatches(bankLineId);
      setSuggestions(result.data);
      setSuggestionsLoading(false);
    },
    [expandedLineId]
  );

  /* ---- Accept a match ---- */
  const handleAcceptMatch = useCallback(
    async (bankLineId: string, candidate: MatchCandidate) => {
      const res = await createMatch({
        bankLineId,
        journalId: candidate.journalId,
        matchType: candidate.matchType,
        provider: candidate.provider,
      });

      if (res.success) {
        toast.success('Bank line matched to journal.');
        setExpandedLineId(null);
        setSuggestions([]);
        loadData(selectedBankId);
      } else {
        toast.error(res.error ?? 'Failed to match.');
      }
    },
    [selectedBankId, loadData]
  );

  /* ---- Remove a match ---- */
  const handleRemoveMatch = useCallback(
    async (matchId: string) => {
      const res = await removeMatch(matchId);
      if (res.success) {
        toast.success('Match removed.');
        loadData(selectedBankId);
      } else {
        toast.error(res.error ?? 'Failed to remove match.');
      }
    },
    [selectedBankId, loadData]
  );

  return (
    <div className="space-y-8">
      {/* Sub-navigation */}
      <div className="flex gap-4 text-sm border-b">
        <span className="font-medium text-foreground border-b-2 border-primary pb-2">
          Journal Matching
        </span>
        <Link
          href="/reconciliation/statement"
          className="text-muted-foreground hover:text-foreground transition-colors pb-2"
        >
          Statement Reconciliation
        </Link>
        <Link
          href="/reconciliation/clearing"
          className="text-muted-foreground hover:text-foreground transition-colors pb-2"
        >
          Clearing Accounts
        </Link>
        <Link
          href="/reconciliation/history"
          className="text-muted-foreground hover:text-foreground transition-colors pb-2"
        >
          History
        </Link>
      </div>

      {/* Bank account selector */}
      <Card className="border shadow-sm rounded-2xl">
        <CardContent className="py-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label htmlFor="bankSelect" className="text-sm font-medium">
              Bank Account
            </label>
            <select
              id="bankSelect"
              value={selectedBankId}
              onChange={(e) => handleBankChange(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {bankAccounts.length === 0 && (
                <option value="">No bank accounts</option>
              )}
              {bankAccounts.map((ba) => (
                <option key={ba.id} value={ba.id}>
                  {ba.name}
                </option>
              ))}
            </select>
            {isPending && (
              <span className="text-xs text-muted-foreground">Loading...</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Lines"
            value={stats.totalLines}
            subtitle="In selected account"
            href="/reconciliation"
            gradient="bg-gradient-to-br from-slate-500 to-slate-700"
            icon={<ArrowLeftRight size={20} />}
          />
          <StatCard
            title="Reconciled"
            value={stats.reconciledCount}
            subtitle="Matched to journals"
            href="/reconciliation"
            gradient="bg-gradient-to-br from-emerald-500 to-emerald-700"
            icon={<CheckCircle2 size={20} />}
          />
          <StatCard
            title="Unreconciled"
            value={stats.unreconciledCount}
            subtitle="Needs matching"
            href="/reconciliation"
            gradient="bg-gradient-to-br from-amber-500 to-amber-700"
            icon={<AlertCircle size={20} />}
          />
          <StatCard
            title="Unreconciled Total"
            value={`£${penceToPounds(stats.unreconciledAmountPence)}`}
            subtitle="Absolute value"
            href="/reconciliation"
            gradient="bg-gradient-to-br from-violet-500 to-violet-700"
            icon={<Search size={20} />}
          />
        </div>
      )}

      {/* Empty state */}
      {loaded && bankAccounts.length === 0 && (
        <Card className="border shadow-sm rounded-2xl">
          <CardContent className="py-12 text-center space-y-3">
            <ArrowLeftRight className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">No bank accounts found.</p>
            <p className="text-sm text-muted-foreground">
              Import bank statements first to start reconciling.
            </p>
            <Button asChild variant="outline">
              <Link href="/banking">Go to Banking</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Unreconciled bank lines */}
      {loaded && unreconciledLines.length > 0 && (
        <Card className="border shadow-sm rounded-2xl">
          <CardHeader>
            <CardTitle>
              Unreconciled Lines ({unreconciledLines.length})
            </CardTitle>
            <CardDescription>
              Click &quot;Find Match&quot; to see suggested journal matches for
              each bank line.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unreconciledLines.map((bl) => (
                    <Fragment key={bl.id}>
                      <TableRow>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(bl.txn_date)}
                        </TableCell>
                        <TableCell className="max-w-[250px] truncate">
                          {bl.description ?? '—'}
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[150px] truncate">
                          {bl.reference ?? '—'}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${
                            bl.amount_pence >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {bl.amount_pence >= 0 ? '+' : ''}
                          £{penceToPounds(bl.amount_pence)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSuggest(bl.id)}
                          >
                            {expandedLineId === bl.id ? (
                              <>
                                <X className="h-3.5 w-3.5 mr-1" />
                                Close
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3.5 w-3.5 mr-1" />
                                Find Match
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {/* Suggestions inline */}
                      {expandedLineId === bl.id && (
                        <TableRow key={`${bl.id}-suggestions`}>
                          <TableCell colSpan={5} className="bg-muted/30 px-6 py-4">
                            {suggestionsLoading ? (
                              <p className="text-sm text-muted-foreground">
                                Searching for matches...
                              </p>
                            ) : suggestions.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No matching journals found within ±14 days.
                              </p>
                            ) : (
                              <div className="space-y-3">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                  Suggested Matches
                                </p>
                                {suggestions.map((cand) => (
                                  <div
                                    key={cand.journalId}
                                    className="flex items-center justify-between rounded-lg border bg-background p-3 gap-4"
                                  >
                                    <div className="flex-1 min-w-0 space-y-1">
                                      <div className="flex items-center gap-2">
                                        {scoreBadge(cand.score)}
                                        <Badge
                                          variant="outline"
                                          className="text-xs"
                                        >
                                          {cand.matchType}
                                        </Badge>
                                        {cand.provider && (
                                          <Badge
                                            variant="outline"
                                            className="text-xs"
                                          >
                                            {cand.provider}
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-sm truncate">
                                        {cand.memo || '(no memo)'}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {formatDate(cand.journalDate)} · £
                                        {penceToPounds(cand.amountPence)}
                                        {cand.reasons.length > 0 && (
                                          <> · {cand.reasons.join(' · ')}</>
                                        )}
                                      </p>
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handleAcceptMatch(bl.id, cand)
                                      }
                                    >
                                      Accept
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No unreconciled lines */}
      {loaded && unreconciledLines.length === 0 && bankAccounts.length > 0 && (
        <Card className="border shadow-sm rounded-2xl">
          <CardContent className="py-12 text-center space-y-3">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-500/60" />
            <p className="text-muted-foreground">
              All bank lines are reconciled for this account.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Reconciled lines (collapsible) */}
      {loaded && reconciledLines.length > 0 && (
        <Card className="border shadow-sm rounded-2xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Reconciled Lines ({reconciledLines.length})
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowReconciled(!showReconciled)}
              >
                {showReconciled ? 'Hide' : 'Show'}
              </Button>
            </div>
          </CardHeader>
          {showReconciled && (
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Matched Journal</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reconciledLines.map((bl) => (
                      <TableRow key={bl.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(bl.txn_date)}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {bl.description ?? '—'}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${
                            bl.amount_pence >= 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          £{penceToPounds(bl.amount_pence)}
                        </TableCell>
                        <TableCell className="max-w-[250px] truncate text-sm">
                          <Link
                            href={`/journals/${bl.journal_id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {bl.journal_memo
                              ? bl.journal_memo.slice(0, 50)
                              : bl.journal_id.slice(0, 8)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {bl.match_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveMatch(bl.match_id)}
                          >
                            <Link2Off className="h-3.5 w-3.5 mr-1" />
                            Unmatch
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
