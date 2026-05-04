'use client';

import { Fragment, useState, useCallback, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeftRight,
  CheckCircle2,
  X,
  Sparkles,
  Link2Off,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReconciliationCard } from '@/components/finance';
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
  reconcileBankLineAsDonation,
  findDonorMatchesForBankTransaction,
} from '@/lib/reconciliation/actions';
import type { BankDonationDonorSuggestion } from '@/lib/reconciliation/actions.types';
import {
  confirmTransactionMatch,
  suggestManualMatchesForBankLine,
} from '@/lib/transactions/actions';
import type { UnreconciledBankLine, ReconciledBankLine, ReconciliationStats } from '@/lib/reconciliation/types';
import type { MatchCandidate } from '@/lib/reconciliation/matching';
import type { MatchSuggestion } from '@/lib/transactions/types';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  bankAccounts: { id: string; name: string }[];
  donors: { id: string; name: string; postcode: string | null }[];
  declarations: {
    id: string;
    donor_id: string;
    status: string;
    start_date: string;
    end_date: string | null;
    declaration_date: string | null;
  }[];
  funds: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  incomeStreams: { id: string; name: string }[];
}

type DonationFormState = {
  donorId: string;
  quickCreate: boolean;
  quickName: string;
  quickEmail: string;
  fundId: string;
  accountId: string;
  incomeStreamId: string;
  giftAidEligible: boolean;
  declarationId: string;
  anonymous: boolean;
  saveBankReferenceAsAlias: boolean;
};

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

export function ReconciliationClient({
  bankAccounts,
  donors,
  declarations,
  funds,
  accounts,
  incomeStreams,
}: Props) {
  const searchParams = useSearchParams();

  const initialBankId = searchParams.get('bankAccount') ?? bankAccounts[0]?.id ?? '';

  const [selectedBankId, setSelectedBankId] = useState(initialBankId);
  const [stats, setStats] = useState<ReconciliationStats | null>(null);
  const [unreconciledLines, setUnreconciledLines] = useState<UnreconciledBankLine[]>([]);
  const [reconciledLines, setReconciledLines] = useState<ReconciledBankLine[]>([]);
  const [showReconciled, setShowReconciled] = useState(false);
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MatchCandidate[]>([]);
  const [transactionSuggestions, setTransactionSuggestions] = useState<MatchSuggestion[]>([]);
  const [donorSuggestions, setDonorSuggestions] = useState<BankDonationDonorSuggestion[]>([]);
  const [donorSuggestionWarning, setDonorSuggestionWarning] = useState<string | null>(null);
  const [donorSuggestionsLoading, setDonorSuggestionsLoading] = useState(false);
  const [includeArchivedDonors, setIncludeArchivedDonors] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [donationLineId, setDonationLineId] = useState<string | null>(null);
  const [donationForm, setDonationForm] = useState<DonationFormState>({
    donorId: '',
    quickCreate: false,
    quickName: '',
    quickEmail: '',
    fundId: funds[0]?.id ?? '',
    accountId: accounts[0]?.id ?? '',
    incomeStreamId: '',
    giftAidEligible: true,
    declarationId: '',
    anonymous: false,
    saveBankReferenceAsAlias: true,
  });
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
        setTransactionSuggestions([]);
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
        setTransactionSuggestions([]);
        return;
      }
      setExpandedLineId(bankLineId);
      setSuggestionsLoading(true);
      const [journalResult, transactionResult] = await Promise.all([
        suggestMatches(bankLineId),
        suggestManualMatchesForBankLine(bankLineId),
      ]);
      setSuggestions(journalResult.data);
      setTransactionSuggestions(transactionResult.data);
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
        setTransactionSuggestions([]);
        loadData(selectedBankId);
      } else {
        toast.error(res.error ?? 'Failed to match.');
      }
    },
    [selectedBankId, loadData]
  );

  const handleAcceptTransactionMatch = useCallback(
    async (bankLineId: string, suggestion: MatchSuggestion) => {
      const res = await confirmTransactionMatch({
        bankLineId,
        manualTransactionId: suggestion.manual_transaction_id,
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success('Bank line matched to manual transaction.');
        setExpandedLineId(null);
        setSuggestions([]);
        setTransactionSuggestions([]);
        loadData(selectedBankId);
      }
    },
    [selectedBankId, loadData],
  );

  const resetDonationFormForLine = useCallback(
    (lineId: string | null) => {
      setDonationLineId(lineId);
      setDonorSuggestions([]);
      setDonorSuggestionWarning(null);
      setDonationForm({
        donorId: '',
        quickCreate: false,
        quickName: '',
        quickEmail: '',
        fundId: funds[0]?.id ?? '',
        accountId: accounts[0]?.id ?? '',
        incomeStreamId: '',
        giftAidEligible: true,
        declarationId: '',
        anonymous: false,
        saveBankReferenceAsAlias: true,
      });
      if (lineId) {
        setDonorSuggestionsLoading(true);
        findDonorMatchesForBankTransaction(lineId, {
          includeArchived: includeArchivedDonors,
        }).then((result) => {
          if (result.error) {
            toast.error(result.error);
          } else {
            setDonorSuggestions(result.data);
            setDonorSuggestionWarning(result.warning);
          }
          setDonorSuggestionsLoading(false);
        });
      }
    },
    [accounts, funds, includeArchivedDonors]
  );

  const selectedDonorDeclarations = declarations.filter(
    (declaration) => declaration.donor_id === donationForm.donorId
  );

  const validSelectedDonorDeclarations = selectedDonorDeclarations.filter(
    (declaration) => declaration.status === 'active'
  );

  const declarationMissing =
    !donationForm.anonymous &&
    donationForm.giftAidEligible &&
    (donationForm.quickCreate ||
      (Boolean(donationForm.donorId) &&
        validSelectedDonorDeclarations.length === 0));

  const handleReconcileAsDonation = useCallback(
    async (bankLine: UnreconciledBankLine) => {
      const declarationId =
        donationForm.declarationId ||
        validSelectedDonorDeclarations[0]?.id ||
        null;
      const res = await reconcileBankLineAsDonation({
        bankLineId: bankLine.id,
        donorId: donationForm.anonymous || donationForm.quickCreate ? null : donationForm.donorId,
        quickCreateDonor: !donationForm.anonymous && donationForm.quickCreate
          ? {
              fullName: donationForm.quickName,
              email: donationForm.quickEmail || null,
            }
          : null,
        anonymous: donationForm.anonymous,
        saveBankReferenceAsAlias: donationForm.saveBankReferenceAsAlias,
        fundId: donationForm.fundId,
        accountId: donationForm.accountId,
        incomeStreamId: donationForm.incomeStreamId || null,
        giftAidEligible: donationForm.anonymous ? false : donationForm.giftAidEligible,
        declarationId: donationForm.anonymous ? null : declarationId,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      if (res.warning) {
        toast.warning(res.warning);
      } else {
        toast.success('Bank line recorded as a donation.');
      }
      setDonationLineId(null);
      loadData(selectedBankId);
    },
    [
      donationForm,
      validSelectedDonorDeclarations,
      selectedBankId,
      loadData,
    ]
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ReconciliationCard title="Total Lines" value={String(stats.totalLines)} helper="In selected account" href="/reconciliation" />
          <ReconciliationCard title="Reconciled" value={String(stats.reconciledCount)} helper="Matched to journals" href="/reconciliation" />
          <ReconciliationCard title="Unreconciled" value={String(stats.unreconciledCount)} helper="Needs matching" href="/reconciliation" />
          <ReconciliationCard title="Unreconciled Total" value={`£${penceToPounds(stats.unreconciledAmountPence)}`} helper="Absolute value" href="/reconciliation" />
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
                          <div className="flex flex-wrap gap-2">
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
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              resetDonationFormForLine(
                                donationLineId === bl.id ? null : bl.id
                              )
                            }
                            disabled={bl.amount_pence <= 0}
                          >
                            Record donation
                          </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {donationLineId === bl.id && (
                        <TableRow key={`${bl.id}-donation`}>
                          <TableCell colSpan={5} className="bg-muted/20 px-6 py-4">
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                              <label className="space-y-1 text-sm">
                                <span className="font-medium">Donor</span>
                                <select
                                  value={donationForm.donorId}
                                  onChange={(event) =>
                                    setDonationForm((current) => ({
                                      ...current,
                                      donorId: event.target.value,
                                      quickCreate: false,
                                      declarationId: '',
                                    }))
                                  }
                                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                  disabled={donationForm.quickCreate || donationForm.anonymous}
                                >
                                  <option value="">Select donor</option>
                                  {donors.map((donor) => (
                                    <option key={donor.id} value={donor.id}>
                                      {donor.name}
                                      {donor.postcode ? ` (${donor.postcode})` : ''}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="space-y-1 text-sm">
                                <span className="font-medium">Fund</span>
                                <select
                                  value={donationForm.fundId}
                                  onChange={(event) =>
                                    setDonationForm((current) => ({
                                      ...current,
                                      fundId: event.target.value,
                                    }))
                                  }
                                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                >
                                  {funds.map((fund) => (
                                    <option key={fund.id} value={fund.id}>
                                      {fund.name}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="space-y-1 text-sm">
                                <span className="font-medium">Account</span>
                                <select
                                  value={donationForm.accountId}
                                  onChange={(event) =>
                                    setDonationForm((current) => ({
                                      ...current,
                                      accountId: event.target.value,
                                    }))
                                  }
                                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                >
                                  {accounts.map((account) => (
                                    <option key={account.id} value={account.id}>
                                      {account.name}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="space-y-1 text-sm">
                                <span className="font-medium">Income stream</span>
                                <select
                                  value={donationForm.incomeStreamId}
                                  onChange={(event) =>
                                    setDonationForm((current) => ({
                                      ...current,
                                      incomeStreamId: event.target.value,
                                    }))
                                  }
                                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                >
                                  <option value="">No income stream</option>
                                  {incomeStreams.map((stream) => (
                                    <option key={stream.id} value={stream.id}>
                                      {stream.name}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="space-y-1 text-sm">
                                <span className="font-medium">Declaration</span>
                                <select
                                  value={donationForm.declarationId}
                                  onChange={(event) =>
                                    setDonationForm((current) => ({
                                      ...current,
                                      declarationId: event.target.value,
                                    }))
                                  }
                                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                  disabled={
                                    donationForm.anonymous ||
                                    donationForm.quickCreate ||
                                    validSelectedDonorDeclarations.length === 0
                                  }
                                >
                                  <option value="">Use valid declaration if available</option>
                                  {validSelectedDonorDeclarations.map((declaration) => (
                                    <option key={declaration.id} value={declaration.id}>
                                      {formatDate(declaration.start_date)}
                                      {declaration.end_date
                                        ? ` to ${formatDate(declaration.end_date)}`
                                        : ' onwards'}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="flex items-center gap-2 pt-6 text-sm">
                                <input
                                  type="checkbox"
                                  checked={donationForm.giftAidEligible}
                                  onChange={(event) =>
                                    setDonationForm((current) => ({
                                      ...current,
                                      giftAidEligible: event.target.checked,
                                    }))
                                  }
                                  disabled={donationForm.anonymous}
                                />
                                Gift Aid eligible
                              </label>
                            </div>

                            <div className="mt-4 space-y-3">
                              <div className="rounded-lg border bg-background p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-medium">Suggested donors</p>
                                    <p className="text-xs text-muted-foreground">
                                      Review the reasons and confirm the donor. Nothing is auto-confirmed.
                                    </p>
                                  </div>
                                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <input
                                      type="checkbox"
                                      checked={includeArchivedDonors}
                                      onChange={(event) => {
                                        setIncludeArchivedDonors(event.target.checked);
                                        setDonorSuggestionsLoading(true);
                                        findDonorMatchesForBankTransaction(bl.id, {
                                          includeArchived: event.target.checked,
                                        }).then((result) => {
                                          if (result.error) toast.error(result.error);
                                          setDonorSuggestions(result.data);
                                          setDonorSuggestionWarning(result.warning);
                                          setDonorSuggestionsLoading(false);
                                        });
                                      }}
                                    />
                                    Include archived
                                  </label>
                                </div>
                                {donorSuggestionWarning ? (
                                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                                    {donorSuggestionWarning}
                                  </div>
                                ) : null}
                                {donorSuggestionsLoading ? (
                                  <p className="mt-3 text-sm text-muted-foreground">
                                    Finding donor suggestions...
                                  </p>
                                ) : donorSuggestions.length === 0 ? (
                                  <p className="mt-3 text-sm text-muted-foreground">
                                    No likely donor suggestions found.
                                  </p>
                                ) : (
                                  <div className="mt-3 grid gap-2">
                                    {donorSuggestions.map((suggestion) => (
                                      <div
                                        key={suggestion.donor_id}
                                        className="rounded-md border bg-muted/20 p-3"
                                      >
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                          <div>
                                            <p className="text-sm font-medium">
                                              {suggestion.donor_name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              {suggestion.confidence_label} confidence,{' '}
                                              {Math.round(suggestion.confidence_score * 100)}%
                                            </p>
                                          </div>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                              setDonationForm((current) => ({
                                                ...current,
                                                donorId: suggestion.donor_id,
                                                quickCreate: false,
                                                anonymous: false,
                                                declarationId: '',
                                              }))
                                            }
                                          >
                                            Use this donor
                                          </Button>
                                        </div>
                                        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                                          {suggestion.reasons.map((reason) => (
                                            <li key={reason}>{reason}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={donationForm.anonymous}
                                  onChange={(event) =>
                                    setDonationForm((current) => ({
                                      ...current,
                                      anonymous: event.target.checked,
                                      donorId: event.target.checked ? '' : current.donorId,
                                      quickCreate: false,
                                      declarationId: '',
                                      giftAidEligible: event.target.checked
                                        ? false
                                        : current.giftAidEligible,
                                      saveBankReferenceAsAlias: event.target.checked
                                        ? false
                                        : current.saveBankReferenceAsAlias,
                                    }))
                                  }
                                />
                                Mark as anonymous donation
                              </label>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={donationForm.quickCreate}
                                  onChange={(event) =>
                                    setDonationForm((current) => ({
                                      ...current,
                                      quickCreate: event.target.checked,
                                      donorId: event.target.checked ? '' : current.donorId,
                                      anonymous: false,
                                      declarationId: '',
                                    }))
                                  }
                                  disabled={donationForm.anonymous}
                                />
                                Donor does not exist: quick create donor
                              </label>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={donationForm.saveBankReferenceAsAlias}
                                  onChange={(event) =>
                                    setDonationForm((current) => ({
                                      ...current,
                                      saveBankReferenceAsAlias: event.target.checked,
                                    }))
                                  }
                                  disabled={
                                    donationForm.anonymous ||
                                    (!donationForm.donorId && !donationForm.quickCreate)
                                  }
                                />
                                Save bank reference as alias for this donor
                              </label>

                              {donationForm.quickCreate && (
                                <div className="grid gap-3 md:grid-cols-2">
                                  <input
                                    value={donationForm.quickName}
                                    onChange={(event) =>
                                      setDonationForm((current) => ({
                                        ...current,
                                        quickName: event.target.value,
                                      }))
                                    }
                                    placeholder="Donor name"
                                    className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
                                  />
                                  <input
                                    value={donationForm.quickEmail}
                                    onChange={(event) =>
                                      setDonationForm((current) => ({
                                        ...current,
                                        quickEmail: event.target.value,
                                      }))
                                    }
                                    placeholder="Email (optional)"
                                    className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
                                  />
                                </div>
                              )}

                              {declarationMissing && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                  Gift Aid declaration missing. Add declaration before this donation can be claimed.
                                </div>
                              )}

                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleReconcileAsDonation(bl)}
                                  disabled={
                                    isPending ||
                                    !donationForm.fundId ||
                                    !donationForm.accountId ||
                                    (!donationForm.anonymous &&
                                      !donationForm.donorId &&
                                      (!donationForm.quickCreate ||
                                        !donationForm.quickName.trim()))
                                  }
                                >
                                  Save donation
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDonationLineId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {/* Suggestions inline */}
                      {expandedLineId === bl.id && (
                        <TableRow key={`${bl.id}-suggestions`}>
                          <TableCell colSpan={5} className="bg-muted/30 px-6 py-4">
                            {suggestionsLoading ? (
                              <p className="text-sm text-muted-foreground">
                                Searching for matches...
                              </p>
                            ) : suggestions.length === 0 && transactionSuggestions.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                              No matching journals or manual transactions found within ±14 days.
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {transactionSuggestions.length > 0 && (
                                  <>
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                      Suggested Manual Transactions
                                    </p>
                                    {transactionSuggestions.map((cand) => (
                                      <div
                                        key={cand.manual_transaction_id}
                                        className="flex items-center justify-between rounded-lg border bg-background p-3 gap-4"
                                      >
                                        <div className="flex-1 min-w-0 space-y-1">
                                          <div className="flex items-center gap-2">
                                            {scoreBadge(Math.round(cand.confidence_score * 100))}
                                            <Badge variant="outline" className="text-xs">
                                              {cand.confidence_label}
                                            </Badge>
                                          </div>
                                          <p className="text-sm truncate">
                                            {cand.match_reason}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            {formatDate(cand.bank_txn_date)} · £
                                            {penceToPounds(cand.bank_amount_pence)}
                                          </p>
                                        </div>
                                        <Button
                                          size="sm"
                                          onClick={() => handleAcceptTransactionMatch(bl.id, cand)}
                                        >
                                          Accept
                                        </Button>
                                      </div>
                                    ))}
                                  </>
                                )}
                                {suggestions.length > 0 && (
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Suggested Posted Journals
                                  </p>
                                )}
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
