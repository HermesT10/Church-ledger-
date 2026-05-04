'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DonationReconcileForm,
  ExcludeReconcileForm,
  ExpenseReconcileForm,
  IncomeReconcileForm,
  ReconciliationSummaryPreview,
  ReconciliationTypeSelector,
  TransferReconcileForm,
} from './components/reconciliation-smart-forms';
import { LettingsReconcilePanel, type LettingsSubmode } from './components/lettings-reconcile-panel';
import {
  reconciliationSummary,
  resetDraftForType,
  toManualTransactionType,
  giftAidFollowUpState,
  type DonorOption,
  type ReconciliationType,
} from './reconciliation-form-model';
import {
  confirmBankTransactionMatch,
  createAndReconcileBankTransaction,
  excludeBankTransaction,
  getReconciliationWorkspaceData,
  getSuggestionsForBankTransaction,
  skipBankTransaction,
  splitBankTransaction,
} from '@/lib/banking/reconciliation-workspace-actions';
import type {
  CreateAndReconcileInput,
  ReconciliationQueueFilter,
  ReconciliationWorkspaceBankLine,
  ReconciliationWorkspaceData,
} from '@/lib/banking/reconciliation-workspace-actions.types';
import { unreconcileBankTransaction } from '@/lib/banking/unreconcile-bank-transaction';
import { repairBankAccountLedgerLink } from '@/lib/banking/actions';
import { applyBankRuleSuggestion } from '@/lib/banking/bank-rules-actions';
import type { BankReconciliationMatchSuggestion } from '@/lib/banking/reconciliation-matching';
import type { ManualTransactionLineInput } from '@/lib/transactions/types';

type Option = { id: string; name: string };

interface Props {
  initialData: ReconciliationWorkspaceData;
  accounts: Option[];
  funds: Option[];
  incomeStreams: Option[];
  /** Income-type accounts for lettings create/reconcile (subset of chart). */
  lettingsIncomeAccounts: Option[];
  /** Preferred lettings GL account when switching to Lettings Income (e.g. INC-004). */
  defaultLettingsIncomeAccountId: string | null;
  donors: DonorOption[];
  suppliers: Option[];
}

type DraftLine = {
  accountId: string;
  fundId: string;
  incomeStreamId: string;
  amount: string;
  description: string;
};

function formatPounds(pence: number | null | undefined): string {
  if (pence == null) return '—';
  const sign = pence < 0 ? '-' : '';
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(time: string | null | undefined): string | null {
  if (!time) return null;
  return time.slice(0, 5);
}

function transactionTitle(line: ReconciliationWorkspaceBankLine): string {
  return line.display_description?.trim() || line.description?.trim() || line.reference?.trim() || 'Imported bank transaction';
}

function movementLabel(line: ReconciliationWorkspaceBankLine): string {
  return line.amount_pence < 0
    ? `Money out ${formatPounds(Math.abs(line.amount_pence))}`
    : `Money in ${formatPounds(line.amount_pence)}`;
}

function penceFromAmount(value: string): number {
  return Math.round((Number.parseFloat(value.replace(/[£,]/g, '') || '0') || 0) * 100);
}

function confidenceBadge(suggestion: BankReconciliationMatchSuggestion) {
  if (suggestion.confidence_label === 'high') return <Badge className="bg-success-soft text-success border-success/20">High</Badge>;
  if (suggestion.confidence_label === 'medium') return <Badge className="bg-warning-soft text-warning border-warning/20">Medium</Badge>;
  return <Badge variant="outline">Low</Badge>;
}

const QUEUE_FILTERS: { value: ReconciliationQueueFilter; label: string }[] = [
  { value: 'needs_reconciliation', label: 'Needs reconciliation' },
  { value: 'reconciled', label: 'Reconciled' },
  { value: 'excluded', label: 'Excluded' },
  { value: 'all', label: 'All' },
];

export function ReconciliationWorkspaceClient({
  initialData,
  accounts,
  funds,
  incomeStreams,
  lettingsIncomeAccounts,
  defaultLettingsIncomeAccountId,
  donors,
  suppliers,
}: Props) {
  const [data, setData] = useState(initialData);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState(initialData.selectedBankAccountId ?? '');
  const [queueFilter, setQueueFilter] = useState<ReconciliationQueueFilter>(initialData.filter ?? 'needs_reconciliation');
  const [selectedLineId, setSelectedLineId] = useState(initialData.transactions[0]?.id ?? '');
  const [suggestions, setSuggestions] = useState<BankReconciliationMatchSuggestion[]>([]);
  const [isPending, startTransition] = useTransition();
  const [actionType, setActionType] = useState<ReconciliationType>('income');
  const [description, setDescription] = useState(initialData.transactions[0] ? transactionTitle(initialData.transactions[0]) : '');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [fundId, setFundId] = useState(funds[0]?.id ?? '');
  const [incomeStreamId, setIncomeStreamId] = useState('');
  const [donorId, setDonorId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [quickCreateDonor, setQuickCreateDonor] = useState(false);
  const [quickDonorName, setQuickDonorName] = useState('');
  const [quickDonorEmail, setQuickDonorEmail] = useState('');
  const [quickDonorPostcode, setQuickDonorPostcode] = useState('');
  const [quickCreateSupplier, setQuickCreateSupplier] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState('');
  const [quickSupplierEmail, setQuickSupplierEmail] = useState('');
  const [bankAlias, setBankAlias] = useState(initialData.transactions[0]?.reference ?? initialData.transactions[0]?.description ?? '');
  const [supplierAlias, setSupplierAlias] = useState(initialData.transactions[0]?.reference ?? initialData.transactions[0]?.description ?? '');
  const [giftAidEligible, setGiftAidEligible] = useState(false);
  const [addGiftAidFollowUp, setAddGiftAidFollowUp] = useState(false);
  const [generateGiftAidDeclarationLink, setGenerateGiftAidDeclarationLink] = useState(false);
  const [rememberBankReference, setRememberBankReference] = useState(false);
  const [transferFromAccountId, setTransferFromAccountId] = useState('');
  const [transferToAccountId, setTransferToAccountId] = useState('');
  const [excludeReason, setExcludeReason] = useState('duplicate');
  const [excludeNotes, setExcludeNotes] = useState('');
  const [splitLines, setSplitLines] = useState<DraftLine[]>([
    { accountId: accounts[0]?.id ?? '', fundId: funds[0]?.id ?? '', incomeStreamId: '', amount: '', description: '' },
    { accountId: accounts[0]?.id ?? '', fundId: funds[0]?.id ?? '', incomeStreamId: '', amount: '', description: '' },
  ]);
  const [unreconcileOpen, setUnreconcileOpen] = useState(false);
  const [unreconcileReason, setUnreconcileReason] = useState('');
  const [unreconcileConfirm, setUnreconcileConfirm] = useState('');
  const [unreconcileReversalDate, setUnreconcileReversalDate] = useState('');
  const [giftAidUnreconcileOverride, setGiftAidUnreconcileOverride] = useState(false);
  const [lettingsSubmode, setLettingsSubmode] = useState<LettingsSubmode>('overview');
  const [lettingName, setLettingName] = useState('');
  const [lettingChargeNotes, setLettingChargeNotes] = useState('');
  const [lettingPeriodDate, setLettingPeriodDate] = useState('');
  const [lettingsPickedChargeId, setLettingsPickedChargeId] = useState('');
  const [lettingsOverrideFundId, setLettingsOverrideFundId] = useState('');
  const [lettingsOverrideAccountId, setLettingsOverrideAccountId] = useState('');
  const [lettingsOverrideIncomeStreamId, setLettingsOverrideIncomeStreamId] = useState('');
  const [extraLettingsIncomeAccounts, setExtraLettingsIncomeAccounts] = useState<Option[]>([]);

  const mergedLettingsIncomeAccounts = useMemo(
    () => [...lettingsIncomeAccounts, ...extraLettingsIncomeAccounts],
    [lettingsIncomeAccounts, extraLettingsIncomeAccounts],
  );

  const selectedLine = useMemo(
    () => data.transactions.find((line) => line.id === selectedLineId) ?? data.transactions[0] ?? null,
    [data.transactions, selectedLineId],
  );

  const lettingsSuggestionCount = useMemo(
    () => suggestions.filter((s) => s.source_type === 'lettings_charge').length,
    [suggestions],
  );

  const selectedDonor = useMemo(
    () => donors.find((donor) => donor.id === donorId) ?? null,
    [donors, donorId],
  );

  const donorFollowUpKey = useMemo(() => {
    if (actionType !== 'donation') return '';
    if (quickCreateDonor) return quickDonorName.trim() ? 'quick-donor' : '';
    return donorId;
  }, [actionType, donorId, quickCreateDonor, quickDonorName]);

  const showGiftAidFollowUp = actionType === 'donation' && Boolean(donorFollowUpKey);
  const donorHasActiveDeclaration = quickCreateDonor ? false : Boolean(selectedDonor?.hasActiveGiftAidDeclaration);
  const giftAidDeclarationEmail = quickCreateDonor ? quickDonorEmail.trim() : selectedDonor?.email?.trim() ?? '';
  const giftAidFollowUp = giftAidFollowUpState({
    isDonation: actionType === 'donation',
    hasDonor: Boolean(donorFollowUpKey),
    donorHasActiveGiftAidDeclaration: donorHasActiveDeclaration,
    donorEmail: giftAidDeclarationEmail,
    addGiftAidFollowUp,
  });
  const canGenerateGiftAidDeclarationLink = giftAidFollowUp.canGenerateDeclarationLink;

  useEffect(() => {
    if (actionType !== 'donation' || !donorFollowUpKey || donorHasActiveDeclaration) {
      setAddGiftAidFollowUp(false);
      setGenerateGiftAidDeclarationLink(false);
      return;
    }

    setAddGiftAidFollowUp(giftAidFollowUp.defaultAddGiftAidFollowUp);
  }, [actionType, donorFollowUpKey, donorHasActiveDeclaration, giftAidFollowUp.defaultAddGiftAidFollowUp]);

  useEffect(() => {
    if (!addGiftAidFollowUp || !canGenerateGiftAidDeclarationLink) {
      setGenerateGiftAidDeclarationLink(false);
    }
  }, [addGiftAidFollowUp, canGenerateGiftAidDeclarationLink]);

  useEffect(() => {
    if (!selectedLine) return;
    const alias = selectedLine.reference ?? selectedLine.description ?? '';
    setBankAlias(alias);
    setSupplierAlias(alias);
    if (selectedLine.amount_pence < 0) {
      setTransferFromAccountId('');
      setTransferToAccountId('');
    } else {
      setTransferFromAccountId('');
      setTransferToAccountId('');
    }
    startTransition(async () => {
      const result = await getSuggestionsForBankTransaction(selectedLine.id);
      if (result.error) toast.error(result.error);
      setSuggestions(result.data);
    });
  }, [selectedLine]);

  useEffect(() => {
    if (!selectedLine || actionType !== 'lettings_income') return;
    setLettingName(transactionTitle(selectedLine));
    setLettingChargeNotes('');
    setLettingPeriodDate(selectedLine.txn_date);
    setLettingsSubmode('overview');
    setLettingsPickedChargeId('');
    setLettingsOverrideFundId('');
    setLettingsOverrideAccountId('');
    setLettingsOverrideIncomeStreamId('');
  }, [selectedLine?.id, actionType]);

  function handleTypeChange(nextType: ReconciliationType) {
    setActionType(nextType);
    const reset = resetDraftForType(nextType);
    setDonorId(reset.donorId);
    setSupplierId(reset.supplierId);
    setIncomeStreamId(reset.incomeStreamId);
    setQuickCreateDonor(reset.quickCreateDonor);
    setQuickCreateSupplier(reset.quickCreateSupplier);
    setGiftAidEligible(reset.giftAidEligible);
    setAddGiftAidFollowUp(reset.addGiftAidFollowUp);
    setGenerateGiftAidDeclarationLink(reset.generateGiftAidDeclarationLink);
    setRememberBankReference(reset.rememberBankReference);
    if (nextType === 'lettings_income') {
      const line = data.transactions.find((l) => l.id === selectedLineId) ?? data.transactions[0] ?? null;
      setIncomeStreamId('');
      setLettingsSubmode('overview');
      setLettingsPickedChargeId('');
      setLettingChargeNotes('');
      setLettingsOverrideFundId('');
      setLettingsOverrideAccountId('');
      setLettingsOverrideIncomeStreamId('');
      const preferredAccount = defaultLettingsIncomeAccountId ?? mergedLettingsIncomeAccounts[0]?.id ?? '';
      setAccountId(preferredAccount);
      if (line) {
        setLettingName(transactionTitle(line));
        setLettingPeriodDate(line.txn_date);
      }
    }
  }

  function reload(bankAccountId = selectedBankAccountId, filter = queueFilter) {
    startTransition(async () => {
      const result = await getReconciliationWorkspaceData(bankAccountId, filter);
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Could not reload reconciliation workspace.');
        return;
      }
      setData(result.data);
      setSelectedBankAccountId(result.data.selectedBankAccountId ?? '');
      setQueueFilter(result.data.filter);
      const nextLine = result.data.transactions[0] ?? null;
      setSelectedLineId(nextLine?.id ?? '');
      setDescription(nextLine ? transactionTitle(nextLine) : '');
    });
  }

  function handleFilterChange(filter: ReconciliationQueueFilter) {
    setQueueFilter(filter);
    reload(selectedBankAccountId, filter);
  }

  function openUnreconcileDialog() {
    if (!selectedLine) return;
    setUnreconcileReason('');
    setUnreconcileConfirm('');
    setUnreconcileReversalDate(selectedLine.txn_date);
    setGiftAidUnreconcileOverride(false);
    setUnreconcileOpen(true);
  }

  function handleUnreconcileSubmit() {
    if (!selectedLine) return;
    if (unreconcileConfirm.trim() !== 'UNRECONCILE') {
      toast.error('Type UNRECONCILE to confirm.');
      return;
    }
    if (unreconcileReason.trim().length < 3) {
      toast.error('Please enter a reason (at least 3 characters).');
      return;
    }
    startTransition(async () => {
      const result = await unreconcileBankTransaction({
        bankTransactionId: selectedLine.id,
        reason: unreconcileReason.trim(),
        reversalDate: unreconcileReversalDate.trim() || undefined,
        giftAidUnreconcileOverride: giftAidUnreconcileOverride || undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Bank line unreconciled. You can match it again when ready.');
      setUnreconcileOpen(false);
      reload(selectedBankAccountId, queueFilter);
    });
  }

  function handleRepairLedgerLink() {
    if (!selectedBankAccountId) return;
    startTransition(async () => {
      const result = await repairBankAccountLedgerLink(selectedBankAccountId);
      if (!result.success) {
        toast.error(result.error ?? 'Could not repair accounting link.');
        return;
      }
      toast.success('Accounting link repaired.');
      reload(selectedBankAccountId, queueFilter);
    });
  }

  function handleConfirm(suggestion: BankReconciliationMatchSuggestion) {
    if (!selectedLine) return;
    startTransition(async () => {
      const result = await confirmBankTransactionMatch({
        bankTransactionId: selectedLine.id,
        sourceType: suggestion.source_type,
        sourceId: suggestion.source_id,
        confidenceScore: suggestion.confidence_score,
        matchReason: suggestion.match_reason,
      });
      if (result.error) toast.error(result.error);
      else {
        toast.success('Match confirmed.');
        reload();
      }
    });
  }

  function buildCreateInput(lines?: ManualTransactionLineInput[]): CreateAndReconcileInput | null {
    if (!selectedLine) return null;
    if (actionType === 'lettings_income') {
      if (lettingsSubmode === 'overview') return null;
      if (lettingsSubmode === 'pick_charge' && !lettingsPickedChargeId) return null;
      if (lettingsSubmode === 'create') {
        if (!lettingName.trim()) return null;
        if (!fundId) return null;
        if (!accountId) return null;
      }
    }
    const lettingsPickOverrides =
      actionType === 'lettings_income' && lettingsSubmode === 'pick_charge';

    const manualType = toManualTransactionType(actionType);
    const input: CreateAndReconcileInput = {
      bankTransactionId: selectedLine.id,
      type: manualType ?? actionType,
      description: description || transactionTitle(selectedLine),
      accountId: lettingsPickOverrides ? (lettingsOverrideAccountId.trim() || null) : accountId,
      fundId: lettingsPickOverrides ? (lettingsOverrideFundId.trim() || null) : fundId,
      incomeStreamId: lettingsPickOverrides
        ? (lettingsOverrideIncomeStreamId.trim() || null)
        : (incomeStreamId || null),
      donorId: actionType === 'donation' && !quickCreateDonor ? donorId || null : null,
      supplierId: supplierId || null,
      quickCreateDonor: actionType === 'donation' && quickCreateDonor && quickDonorName
        ? {
            fullName: quickDonorName,
            email: quickDonorEmail || null,
            postcode: quickDonorPostcode || null,
            addressLine1: quickDonorPostcode || null,
          }
        : null,
      quickCreateSupplier: quickCreateSupplier && quickSupplierName
        ? {
            name: quickSupplierName,
            email: quickSupplierEmail || null,
            bankAlias: supplierAlias || null,
          }
        : null,
      giftAidEligible: actionType === 'donation' ? giftAidEligible : false,
      addGiftAidFollowUp: actionType === 'donation' && giftAidFollowUp.show ? addGiftAidFollowUp : false,
      generateGiftAidDeclarationLink: actionType === 'donation' && canGenerateGiftAidDeclarationLink
        ? generateGiftAidDeclarationLink
        : false,
      rememberBankReference,
      transferFromAccountId: transferFromAccountId || null,
      transferToAccountId: transferToAccountId || null,
      lines,
    };

    if (actionType === 'lettings_income') {
      if (lettingsSubmode === 'pick_charge') {
        input.lettingsChargeId = lettingsPickedChargeId;
        input.createNewLetting = false;
      } else {
        input.createNewLetting = true;
        input.lettingName = lettingName.trim();
        input.lettingChargeNotes = lettingChargeNotes.trim() || null;
        input.lettingPeriodDate = lettingPeriodDate.trim() || null;
      }
    }

    return input;
  }

  function handleApplyRule(suggestion: BankReconciliationMatchSuggestion) {
    if (!selectedLine || suggestion.source_type !== 'bank_rule') return;
    startTransition(async () => {
      const result = await applyBankRuleSuggestion({
        ruleId: suggestion.source_id,
        bankTransactionId: selectedLine.id,
      });
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Could not apply rule.');
        return;
      }
      const rule = result.data;
      if (['income', 'expense', 'transfer', 'donation', 'adjustment'].includes(rule.transaction_type)) {
        handleTypeChange(rule.transaction_type as ReconciliationType);
      }
      if (rule.account_id) setAccountId(rule.account_id);
      if (rule.fund_id) setFundId(rule.fund_id);
      if (rule.income_stream_id) setIncomeStreamId(rule.income_stream_id);
      if (rule.donor_id) setDonorId(rule.donor_id);
      if (rule.supplier_id) setSupplierId(rule.supplier_id);
      if (rule.description) setDescription(rule.description);
      toast.success(`Applied rule "${rule.rule_name}" to the form.`);
    });
  }

  function handleCreateAndReconcile() {
    if (actionType === 'exclude') {
      handleExclude();
      return;
    }
    const input = buildCreateInput();
    if (!input) {
      if (actionType === 'lettings_income') {
        toast.error('Choose match existing or create new letting, then complete the required fields.');
      }
      return;
    }
    startTransition(async () => {
      const result = await createAndReconcileBankTransaction(input);
      if (result.error) toast.error(result.error);
      else {
        toast.success('Transaction created and reconciled.');
        reload();
      }
    });
  }

  function handleSplit() {
    if (!selectedLine) return;
    const direction: 'in' | 'out' = selectedLine.amount_pence >= 0 ? 'in' : 'out';
    const lines = splitLines.map((line) => ({
      account_id: line.accountId,
      fund_id: line.fundId || null,
      income_stream_id: line.incomeStreamId || null,
      amount_pence: penceFromAmount(line.amount),
      description: line.description || transactionTitle(selectedLine),
      direction,
    }));
    const input = buildCreateInput(lines);
    if (!input) return;
    startTransition(async () => {
      const result = await splitBankTransaction(input);
      if (result.error) toast.error(result.error);
      else {
        toast.success('Split transaction reconciled.');
        reload();
      }
    });
  }

  function handleExclude() {
    if (!selectedLine) return;
    startTransition(async () => {
      const result = await excludeBankTransaction({
        bankTransactionId: selectedLine.id,
        reason: excludeReason as 'duplicate' | 'opening_balance' | 'informational_line' | 'bank_metadata' | 'other',
        notes: excludeNotes,
      });
      if (result.error) toast.error(result.error);
      else {
        toast.success('Bank transaction excluded.');
        reload();
      }
    });
  }

  function handleSkip() {
    if (!selectedLine) return;
    startTransition(async () => {
      await skipBankTransaction({ bankTransactionId: selectedLine.id });
      const currentIndex = data.transactions.findIndex((line) => line.id === selectedLine.id);
      const next = data.transactions[currentIndex + 1] ?? data.transactions[0];
      if (next) {
        setSelectedLineId(next.id);
        setDescription(transactionTitle(next));
      }
    });
  }

  const summary = selectedLine
    ? reconciliationSummary({
        type: actionType,
        amountLabel: formatPounds(Math.abs(selectedLine.amount_pence)),
        donorName: donorId ? donors.find((donor) => donor.id === donorId)?.name : quickDonorName || 'anonymous giving',
        supplierName: supplierId ? suppliers.find((supplier) => supplier.id === supplierId)?.name : quickSupplierName || null,
        accountName:
          accounts.find((account) => account.id === accountId)?.name ??
          extraLettingsIncomeAccounts.find((a) => a.id === accountId)?.name,
        fundName: funds.find((fund) => fund.id === fundId)?.name,
        fromAccountName: accounts.find((account) => account.id === transferFromAccountId)?.name,
        toAccountName: accounts.find((account) => account.id === transferToAccountId)?.name,
        lettingsSubmode: actionType === 'lettings_income' ? lettingsSubmode : undefined,
        lettingHirerName: actionType === 'lettings_income' ? lettingName : undefined,
      })
    : 'Select a bank line to reconcile.';
  const ledgerLink = data.selectedBankAccountLedgerLink;
  const ledgerLinkInvalid = Boolean(selectedBankAccountId && ledgerLink?.status !== 'linked');

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(440px,1.1fr)]">
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/70">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Bank transactions</CardTitle>
              <CardDescription>Select an imported bank line to match or categorise.</CardDescription>
            </div>
            <Select value={selectedBankAccountId} onValueChange={(value) => { setSelectedBankAccountId(value); reload(value); }}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Bank account" />
              </SelectTrigger>
              <SelectContent>
                {data.bankAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {QUEUE_FILTERS.map((filter) => (
              <Button
                key={filter.value}
                type="button"
                variant={queueFilter === filter.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFilterChange(filter.value)}
                disabled={isPending}
              >
                {filter.label} ({data.counts[filter.value] ?? 0})
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ledgerLinkInvalid ? (
            <div className="m-4 rounded-2xl border border-warning/30 bg-warning-soft p-5">
              <h3 className="font-semibold text-warning">Bank account needs an accounting link</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                This bank account must be linked to a Chart of Accounts bank account before transactions can be reconciled and posted.
              </p>
              {ledgerLink?.message && <p className="mt-2 text-xs text-muted-foreground">{ledgerLink.message}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={handleRepairLedgerLink} disabled={isPending}>
                  Create ledger account automatically
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/banking/${selectedBankAccountId}`}>Go to Bank Account Settings</Link>
                </Button>
              </div>
            </div>
          ) : data.transactions.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">
              {queueFilter === 'needs_reconciliation'
                ? 'All imported transactions for this account are reconciled.'
                : 'No transactions match this filter.'}
              {queueFilter === 'needs_reconciliation' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => handleFilterChange('reconciled')}>
                    View reconciled transactions
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={selectedBankAccountId ? `/banking/${selectedBankAccountId}/import` : '/banking'}>Upload new statement</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/reports">Go to reports</Link>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="max-h-[720px] overflow-y-auto">
              {data.transactions.map((line) => (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => {
                    setSelectedLineId(line.id);
                    setDescription(transactionTitle(line));
                  }}
                  className={`grid w-full grid-cols-[112px_minmax(0,1fr)_140px] gap-3 border-b border-border/60 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40 ${
                    selectedLine?.id === line.id ? 'bg-primary/5' : ''
                  }`}
                >
                  <span className="text-muted-foreground">
                    {formatDate(line.txn_date)}
                    {formatTime(line.transaction_time) && <span className="block text-xs">{formatTime(line.transaction_time)}</span>}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{transactionTitle(line)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {line.reference || 'No reference'} · {line.status || 'unmatched'}
                      {!transactionTitle(line).trim() ? ' · Missing description' : ''}
                    </span>
                  </span>
                  <span className={`text-right font-mono ${line.amount_pence >= 0 ? 'text-success' : 'text-foreground'}`}>
                    {movementLabel(line)}
                    <span className="block text-xs text-muted-foreground">Balance {formatPounds(line.balance_pence)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Selected transaction</CardTitle>
            <CardDescription>
              {selectedLine
                ? `${formatDate(selectedLine.txn_date)}${formatTime(selectedLine.transaction_time) ? ` · ${formatTime(selectedLine.transaction_time)}` : ''} · ${movementLabel(selectedLine)}`
                : 'Select a bank transaction to begin.'}
            </CardDescription>
          </CardHeader>
          {selectedLine && (
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{transactionTitle(selectedLine)}</p>
              <p className="text-muted-foreground">
                {[selectedLine.reference || 'No reference', selectedLine.status || 'unmatched'].join(' · ')} · Balance {formatPounds(selectedLine.balance_pence)}
              </p>
              {!transactionTitle(selectedLine).trim() && (
                <Badge variant="outline" className="border-warning/20 bg-warning-soft text-warning">Missing description</Badge>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={handleSkip} disabled={isPending}>Skip</Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={selectedLine ? `/banking/rules?bankTransactionId=${selectedLine.id}` : '/banking/rules'}>Add Rule</Link>
                </Button>
                {selectedLine.reconciled || selectedLine.posted_journal_id || selectedLine.status === 'reconciled' || selectedLine.status === 'excluded' ? (
                  <Button type="button" variant="secondary" size="sm" onClick={openUnreconcileDialog} disabled={isPending}>
                    Unreconcile
                  </Button>
                ) : null}
              </div>
            </CardContent>
          )}
        </Card>

        <Dialog open={unreconcileOpen} onOpenChange={setUnreconcileOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Unreconcile bank line</DialogTitle>
              <DialogDescription>
                This removes the reconciliation link and, when a posted journal exists, creates a reversing journal. Excluded lines return to the match queue.
                Donations with advanced Gift Aid claim states require treasurer/admin approval via the override below.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="unreconcile-reason">Reason</Label>
                <Textarea
                  id="unreconcile-reason"
                  value={unreconcileReason}
                  onChange={(e) => setUnreconcileReason(e.target.value)}
                  placeholder="Why is this being unreconciled?"
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unreconcile-reversal-date">Reversal date (posted journals)</Label>
                <Input
                  id="unreconcile-reversal-date"
                  type="date"
                  value={unreconcileReversalDate}
                  onChange={(e) => setUnreconcileReversalDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unreconcile-confirm">Type UNRECONCILE to confirm</Label>
                <Input
                  id="unreconcile-confirm"
                  value={unreconcileConfirm}
                  onChange={(e) => setUnreconcileConfirm(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={giftAidUnreconcileOverride}
                  onChange={(e) => setGiftAidUnreconcileOverride(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Gift Aid claim override (treasurer/admin — only if the server rejected for claim lock)
              </label>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setUnreconcileOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={handleUnreconcileSubmit} disabled={isPending}>
                Unreconcile
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle>Suggested matches</CardTitle>
            <CardDescription>Matches are ranked by amount, date, reference, names, rules, and module-specific hooks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isPending && suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Looking for matches...</p>
            ) : suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No strong suggestions yet. Create a new transaction or exclude this line.</p>
            ) : (
              suggestions.map((suggestion) => (
                <div key={`${suggestion.source_type}-${suggestion.source_id}`} className="rounded-xl border border-border/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{suggestion.source_label}</p>
                      <p className="text-xs text-muted-foreground">
                        {suggestion.source_type.replaceAll('_', ' ')}
                        {suggestion.source_date ? ` · ${formatDate(suggestion.source_date)}` : ''}
                        {suggestion.source_amount_pence != null ? ` · ${formatPounds(suggestion.source_amount_pence)}` : ''}
                      </p>
                    </div>
                    {confidenceBadge(suggestion)}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{suggestion.match_reason.join(', ')}</p>
                  <div className="mt-3 flex justify-end">
                    {suggestion.source_type === 'bank_rule' ? (
                      <div className="flex gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href="/banking/rules">Edit Rule</Link>
                        </Button>
                        <Button size="sm" onClick={() => handleApplyRule(suggestion)} disabled={isPending}>
                          Apply Rule
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" onClick={() => handleConfirm(suggestion)} disabled={isPending || ledgerLinkInvalid}>
                        Confirm Match
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create & Reconcile</CardTitle>
            <CardDescription>Select what the bank line represents, then complete only the fields needed for that record.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ReconciliationTypeSelector value={actionType} onChange={handleTypeChange} />
            <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description / reference" />
            {actionType === 'donation' ? (
              <DonationReconcileForm
                donors={donors}
                funds={funds}
                accounts={accounts}
                incomeStreams={incomeStreams}
                donorId={donorId}
                setDonorId={setDonorId}
                quickCreateDonor={quickCreateDonor}
                setQuickCreateDonor={setQuickCreateDonor}
                quickDonorName={quickDonorName}
                setQuickDonorName={setQuickDonorName}
                quickDonorEmail={quickDonorEmail}
                setQuickDonorEmail={setQuickDonorEmail}
                quickDonorPostcode={quickDonorPostcode}
                setQuickDonorPostcode={setQuickDonorPostcode}
                bankAlias={bankAlias}
                setBankAlias={setBankAlias}
                fundId={fundId}
                setFundId={setFundId}
                accountId={accountId}
                setAccountId={setAccountId}
                incomeStreamId={incomeStreamId}
                setIncomeStreamId={setIncomeStreamId}
                giftAidEligible={giftAidEligible}
                setGiftAidEligible={setGiftAidEligible}
                addGiftAidFollowUp={addGiftAidFollowUp}
                setAddGiftAidFollowUp={setAddGiftAidFollowUp}
                generateGiftAidDeclarationLink={generateGiftAidDeclarationLink}
                setGenerateGiftAidDeclarationLink={setGenerateGiftAidDeclarationLink}
                showGiftAidFollowUp={giftAidFollowUp.show}
                donorHasActiveGiftAidDeclaration={donorHasActiveDeclaration}
                canGenerateGiftAidDeclarationLink={canGenerateGiftAidDeclarationLink}
                giftAidFollowUpHelperText={giftAidFollowUp.helperText}
                rememberBankReference={rememberBankReference}
                setRememberBankReference={setRememberBankReference}
              />
            ) : actionType === 'income' || actionType === 'adjustment' ? (
              <IncomeReconcileForm
                accounts={accounts}
                funds={funds}
                incomeStreams={incomeStreams}
                accountId={accountId}
                setAccountId={setAccountId}
                fundId={fundId}
                setFundId={setFundId}
                incomeStreamId={incomeStreamId}
                setIncomeStreamId={setIncomeStreamId}
                rememberBankReference={rememberBankReference}
                setRememberBankReference={setRememberBankReference}
              />
            ) : actionType === 'expense' ? (
              <ExpenseReconcileForm
                suppliers={suppliers}
                accounts={accounts}
                funds={funds}
                supplierId={supplierId}
                setSupplierId={setSupplierId}
                quickCreateSupplier={quickCreateSupplier}
                setQuickCreateSupplier={setQuickCreateSupplier}
                quickSupplierName={quickSupplierName}
                setQuickSupplierName={setQuickSupplierName}
                quickSupplierEmail={quickSupplierEmail}
                setQuickSupplierEmail={setQuickSupplierEmail}
                supplierAlias={supplierAlias}
                setSupplierAlias={setSupplierAlias}
                accountId={accountId}
                setAccountId={setAccountId}
                fundId={fundId}
                setFundId={setFundId}
                rememberBankReference={rememberBankReference}
                setRememberBankReference={setRememberBankReference}
              />
            ) : actionType === 'transfer' ? (
              <TransferReconcileForm
                accounts={accounts}
                fromAccountId={transferFromAccountId}
                setFromAccountId={setTransferFromAccountId}
                toAccountId={transferToAccountId}
                setToAccountId={setTransferToAccountId}
                directionLabel={selectedLine && selectedLine.amount_pence < 0 ? 'Money out from this bank account' : 'Money in to this bank account'}
              />
            ) : actionType === 'exclude' ? (
              <ExcludeReconcileForm
                excludeReason={excludeReason}
                setExcludeReason={setExcludeReason}
                excludeNotes={excludeNotes}
                setExcludeNotes={setExcludeNotes}
              />
            ) : actionType === 'lettings_income' && selectedLine ? (
              <LettingsReconcilePanel
                selectedLine={selectedLine}
                funds={funds}
                accounts={mergedLettingsIncomeAccounts}
                incomeStreams={incomeStreams}
                lettingsSubmode={lettingsSubmode}
                setLettingsSubmode={setLettingsSubmode}
                lettingName={lettingName}
                setLettingName={setLettingName}
                lettingChargeNotes={lettingChargeNotes}
                setLettingChargeNotes={setLettingChargeNotes}
                lettingPeriodDate={lettingPeriodDate}
                setLettingPeriodDate={setLettingPeriodDate}
                fundId={fundId}
                setFundId={setFundId}
                accountId={accountId}
                setAccountId={setAccountId}
                incomeStreamId={incomeStreamId}
                setIncomeStreamId={setIncomeStreamId}
                overrideFundId={lettingsOverrideFundId}
                setOverrideFundId={setLettingsOverrideFundId}
                overrideAccountId={lettingsOverrideAccountId}
                setOverrideAccountId={setLettingsOverrideAccountId}
                overrideIncomeStreamId={lettingsOverrideIncomeStreamId}
                setOverrideIncomeStreamId={setLettingsOverrideIncomeStreamId}
                onIncomeAccountCreated={(created) => setExtraLettingsIncomeAccounts((prev) => [...prev, created])}
                lettingsSuggestionCount={lettingsSuggestionCount}
                lettingsPickedChargeId={lettingsPickedChargeId}
                setLettingsPickedChargeId={setLettingsPickedChargeId}
                formatPounds={formatPounds}
              />
            ) : actionType === 'gift_aid_hmrc_payment' || actionType === 'payroll_payment' ? (
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                Use a suggested match when one is available for this type.
              </div>
            ) : (
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                Select a supported transaction type or use suggested matches.
              </div>
            )}
            <ReconciliationSummaryPreview summary={summary} />
            <Button
              onClick={handleCreateAndReconcile}
              disabled={
                !selectedLine ||
                isPending ||
                ledgerLinkInvalid ||
                (actionType === 'lettings_income' &&
                  (lettingsSubmode === 'overview' ||
                    (lettingsSubmode === 'pick_charge' && !lettingsPickedChargeId) ||
                    (lettingsSubmode === 'create' &&
                      (!lettingName.trim() || !fundId || !accountId || mergedLettingsIncomeAccounts.length === 0))))
              }
            >
              {actionType === 'exclude'
                ? 'Exclude'
                : actionType === 'lettings_income' && lettingsSubmode === 'pick_charge'
                  ? 'Reconcile to charge'
                  : 'Create & Reconcile'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Split</CardTitle>
            <CardDescription>Split one bank line across multiple accounts and funds. Totals must equal the bank amount.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {splitLines.map((line, index) => (
              <div key={index} className="grid gap-2 rounded-xl border border-border/70 p-3 sm:grid-cols-[1fr_1fr_110px]">
                <Select value={line.accountId} onValueChange={(value) => setSplitLines((rows) => rows.map((row, i) => i === index ? { ...row, accountId: value } : row))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Account" /></SelectTrigger>
                  <SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={line.fundId} onValueChange={(value) => setSplitLines((rows) => rows.map((row, i) => i === index ? { ...row, fundId: value } : row))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Fund" /></SelectTrigger>
                  <SelectContent>{funds.map((fund) => <SelectItem key={fund.id} value={fund.id}>{fund.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={line.amount} onChange={(event) => setSplitLines((rows) => rows.map((row, i) => i === index ? { ...row, amount: event.target.value } : row))} placeholder="Amount" />
                <Input className="sm:col-span-3" value={line.description} onChange={(event) => setSplitLines((rows) => rows.map((row, i) => i === index ? { ...row, description: event.target.value } : row))} placeholder="Line description" />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setSplitLines((rows) => [...rows, { accountId, fundId, incomeStreamId: '', amount: '', description: '' }])}>
                Add Split Line
              </Button>
              <Button onClick={handleSplit} disabled={!selectedLine || isPending || ledgerLinkInvalid}>Split</Button>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
