'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
import { Progress } from '@/components/ui/progress';
import type { OnboardingProgress } from './types';
import {
  updateOrgProfile,
  seedFundsForOnboarding,
  createFundForOnboarding,
  seedAccountsForOnboarding,
  saveOnboardingStep,
  skipOnboardingStep,
  completeOnboarding,
} from './actions';
import { createBankAccount } from '@/lib/banking/bankAccounts';
import { createBudget } from '@/lib/budgets/actions';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TOTAL_STEPS = 7;

const STEP_META = [
  { label: 'Organisation', description: 'Confirm your organisation details' },
  { label: 'Funds', description: 'Set up your fund structure' },
  { label: 'Accounts', description: 'Create your chart of accounts' },
  { label: 'Bank Accounts', description: 'Add your bank accounts' },
  { label: 'Import CSV', description: 'Import your first bank statement' },
  { label: 'Budget', description: 'Create your annual budget' },
  { label: 'Invite Team', description: 'Invite trustees and team members' },
];

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Fund {
  id: string;
  name: string;
  type: string;
}

interface BankAccount {
  id: string;
  name: string;
  account_number_last4: string | null;
  sort_code: string | null;
}

interface Budget {
  id: string;
  year: number;
  name: string;
}

interface SetupWizardProps {
  orgId: string;
  orgName: string;
  progress: OnboardingProgress;
  existingFunds: Fund[];
  accountCount: number;
  existingBankAccounts: BankAccount[];
  existingBudgets: Budget[];
  currentYear: number;
}

/* ------------------------------------------------------------------ */
/*  Main Wizard Component                                              */
/* ------------------------------------------------------------------ */

export function SetupWizard({
  orgId,
  orgName,
  progress,
  existingFunds,
  accountCount: initialAccountCount,
  existingBankAccounts,
  existingBudgets,
  currentYear,
}: SetupWizardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const clampedStep = Math.min(progress.currentStep, TOTAL_STEPS);
  const [step, setStep] = useState(clampedStep);
  const [completed, setCompleted] = useState<number[]>(progress.completedSteps);
  const [showCompletion, setShowCompletion] = useState(
    progress.currentStep > TOTAL_STEPS,
  );
  const [error, setError] = useState<string | null>(null);

  // Local state for each step's data
  const [name, setName] = useState(orgName);
  const [funds, setFunds] = useState<Fund[]>(existingFunds);
  const [accountCount, setAccountCount] = useState(initialAccountCount);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(existingBankAccounts);
  const [budgets, setBudgets] = useState<Budget[]>(existingBudgets);

  // Inline form state
  const [newFundName, setNewFundName] = useState('');
  const [newFundType, setNewFundType] = useState<string>('unrestricted');
  const [newBankName, setNewBankName] = useState('');
  const [newBankLast4, setNewBankLast4] = useState('');
  const [newBankSortCode, setNewBankSortCode] = useState('');

  const progressPercent = showCompletion
    ? 100
    : Math.round(((step - 1) / TOTAL_STEPS) * 100);

  /* ---------------------------------------------------------------- */
  /*  Navigation helpers                                               */
  /* ---------------------------------------------------------------- */

  function markComplete(stepNum: number) {
    if (!completed.includes(stepNum)) {
      setCompleted((prev) => [...prev, stepNum]);
    }
  }

  function goNext() {
    setError(null);
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      setShowCompletion(true);
    }
  }

  function goBack() {
    setError(null);
    if (step > 1) {
      setStep(step - 1);
    }
  }

  function handleContinue(stepNum: number) {
    startTransition(async () => {
      markComplete(stepNum);
      await saveOnboardingStep(orgId, stepNum);
      goNext();
    });
  }

  function handleSkip(stepNum: number) {
    startTransition(async () => {
      await skipOnboardingStep(orgId, stepNum);
      goNext();
    });
  }

  function handleFinish() {
    startTransition(async () => {
      await completeOnboarding(orgId);
      router.push('/dashboard');
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Step 1: Organisation Profile                                     */
  /* ---------------------------------------------------------------- */

  function renderStep1() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Confirm or update your organisation name. This appears across the app.
        </p>
        <div className="space-y-2">
          <Label htmlFor="org-name">Organisation Name</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Church"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button
            disabled={isPending || !name.trim()}
            onClick={() => {
              startTransition(async () => {
                setError(null);
                const result = await updateOrgProfile(orgId, name);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                handleContinue(1);
              });
            }}
          >
            {isPending ? 'Saving...' : 'Save & Continue'}
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Step 2: Funds                                                    */
  /* ---------------------------------------------------------------- */

  function renderStep2() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Funds track how money is designated. You can seed the default church funds
          or add your own.
        </p>

        {funds.length > 0 && (
          <div className="rounded-lg border p-4">
            <p className="mb-2 text-sm font-medium">
              Existing funds ({funds.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {funds.map((f) => (
                <Badge key={f.id} variant="secondary" className="text-xs">
                  {f.name}
                  <span className="ml-1 text-muted-foreground">({f.type})</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                setError(null);
                const result = await seedFundsForOnboarding(orgId);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                // Refresh the page to get updated funds
                router.refresh();
              });
            }}
          >
            {isPending ? 'Seeding...' : 'Seed Default Funds'}
          </Button>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">Add a custom fund</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="fund-name" className="text-xs">
                Name
              </Label>
              <Input
                id="fund-name"
                placeholder="e.g. Mission Fund"
                value={newFundName}
                onChange={(e) => setNewFundName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fund-type" className="text-xs">
                Type
              </Label>
              <select
                id="fund-type"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                value={newFundType}
                onChange={(e) => setNewFundType(e.target.value)}
              >
                <option value="unrestricted">Unrestricted</option>
                <option value="restricted">Restricted</option>
                <option value="designated">Designated</option>
              </select>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || !newFundName.trim()}
            onClick={() => {
              startTransition(async () => {
                setError(null);
                const result = await createFundForOnboarding(
                  orgId,
                  newFundName,
                  newFundType,
                );
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setNewFundName('');
                router.refresh();
              });
            }}
          >
            Add Fund
          </Button>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={() => handleContinue(2)} disabled={isPending}>
            Continue
          </Button>
          <Button
            variant="ghost"
            onClick={() => handleSkip(2)}
            disabled={isPending}
          >
            Skip for now
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Step 3: Chart of Accounts                                        */
  /* ---------------------------------------------------------------- */

  function renderStep3() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Your chart of accounts defines the categories for tracking income,
          expenses, assets, and liabilities. Seed the default accounts or add your
          own later.
        </p>

        {accountCount > 0 && (
          <div className="rounded-lg border p-4">
            <p className="text-sm">
              <span className="font-medium">{accountCount}</span> accounts already
              created.{' '}
              <Link
                href="/accounts"
                className="text-primary underline-offset-4 hover:underline"
                target="_blank"
              >
                View accounts
              </Link>
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                setError(null);
                const result = await seedAccountsForOnboarding(orgId);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setAccountCount((prev) => Math.max(prev, result.count));
                router.refresh();
              });
            }}
          >
            {isPending ? 'Seeding...' : 'Seed Chart of Accounts'}
          </Button>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={() => handleContinue(3)} disabled={isPending}>
            Continue
          </Button>
          <Button
            variant="ghost"
            onClick={() => handleSkip(3)}
            disabled={isPending}
          >
            Skip for now
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Step 4: Bank Accounts                                            */
  /* ---------------------------------------------------------------- */

  function renderStep4() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add the bank accounts your church uses. You can import bank statements
          after this step.
        </p>

        {bankAccounts.length > 0 && (
          <div className="rounded-lg border p-4">
            <p className="mb-2 text-sm font-medium">
              Bank accounts ({bankAccounts.length})
            </p>
            <div className="space-y-1">
              {bankAccounts.map((ba) => (
                <div
                  key={ba.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="font-medium">{ba.name}</span>
                  {ba.sort_code && (
                    <span className="text-muted-foreground">
                      {ba.sort_code}
                    </span>
                  )}
                  {ba.account_number_last4 && (
                    <span className="text-muted-foreground">
                      ****{ba.account_number_last4}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">Add a bank account</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="bank-name" className="text-xs">
                Name
              </Label>
              <Input
                id="bank-name"
                placeholder="e.g. Current Account"
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bank-sort" className="text-xs">
                Sort Code
              </Label>
              <Input
                id="bank-sort"
                placeholder="12-34-56"
                value={newBankSortCode}
                onChange={(e) => setNewBankSortCode(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bank-last4" className="text-xs">
                Last 4 digits
              </Label>
              <Input
                id="bank-last4"
                placeholder="1234"
                maxLength={4}
                value={newBankLast4}
                onChange={(e) => setNewBankLast4(e.target.value)}
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || !newBankName.trim()}
            onClick={() => {
              startTransition(async () => {
                setError(null);
                const result = await createBankAccount(orgId, {
                  name: newBankName,
                  sort_code: newBankSortCode || undefined,
                  account_number_last4: newBankLast4 || undefined,
                });
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setNewBankName('');
                setNewBankSortCode('');
                setNewBankLast4('');
                router.refresh();
              });
            }}
          >
            Add Bank Account
          </Button>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={() => handleContinue(4)} disabled={isPending}>
            Continue
          </Button>
          <Button
            variant="ghost"
            onClick={() => handleSkip(4)}
            disabled={isPending}
          >
            Skip for now
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Step 5: Import CSV (optional)                                    */
  /* ---------------------------------------------------------------- */

  function renderStep5() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Import your first bank statement to get started with reconciliation.
          This step is optional -- you can always import later from the Banking page.
        </p>

        {bankAccounts.length > 0 ? (
          <div className="rounded-lg border p-4">
            <p className="text-sm">
              You have {bankAccounts.length} bank account
              {bankAccounts.length !== 1 ? 's' : ''} set up.{' '}
              <Link
                href="/banking"
                className="text-primary underline-offset-4 hover:underline"
                target="_blank"
              >
                Go to Banking to import a CSV
              </Link>
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4">
            <p className="text-sm text-muted-foreground">
              No bank accounts set up yet. Go back to Step 4 to add one first, or
              skip this step.
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button onClick={() => handleContinue(5)} disabled={isPending}>
            Continue
          </Button>
          <Button
            variant="ghost"
            onClick={() => handleSkip(5)}
            disabled={isPending}
          >
            Skip for now
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Step 6: Create Budget (optional)                                 */
  /* ---------------------------------------------------------------- */

  function renderStep6() {
    const hasBudget = budgets.length > 0;

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Create an annual budget to track income and expenses against your plan.
          This step is optional.
        </p>

        {hasBudget ? (
          <div className="rounded-lg border p-4">
            <p className="text-sm">
              <span className="font-medium">Budget already exists</span> for{' '}
              {currentYear}: {budgets[0].name}.{' '}
              <Link
                href="/budgets"
                className="text-primary underline-offset-4 hover:underline"
                target="_blank"
              >
                View budgets
              </Link>
            </p>
          </div>
        ) : (
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                setError(null);
                const result = await createBudget(orgId, currentYear);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                if (result.data) {
                  setBudgets([result.data]);
                }
              });
            }}
          >
            {isPending ? 'Creating...' : `Create ${currentYear} Budget`}
          </Button>
        )}

        <div className="flex gap-3 pt-2">
          <Button onClick={() => handleContinue(6)} disabled={isPending}>
            Continue
          </Button>
          <Button
            variant="ghost"
            onClick={() => handleSkip(6)}
            disabled={isPending}
          >
            Skip for now
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Step 7: Invite Users (optional)                                  */
  /* ---------------------------------------------------------------- */

  function renderStep7() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Invite trustees and other team members to view reports and collaborate.
        </p>

        <div className="rounded-lg border border-dashed p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <svg
              className="h-6 w-6 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium">Coming Soon</p>
          <p className="mt-1 text-xs text-muted-foreground">
            User invitations will be available in a future update. You can manage
            members in{' '}
            <Link
              href="/settings"
              className="text-primary underline-offset-4 hover:underline"
            >
              Settings
            </Link>{' '}
            once they sign up.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            onClick={() => {
              startTransition(async () => {
                markComplete(7);
                await saveOnboardingStep(orgId, 7);
                setShowCompletion(true);
              });
            }}
            disabled={isPending}
          >
            Finish Setup
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              startTransition(async () => {
                await skipOnboardingStep(orgId, 7);
                setShowCompletion(true);
              });
            }}
            disabled={isPending}
          >
            Skip & Finish
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Completion Screen                                                */
  /* ---------------------------------------------------------------- */

  function renderCompletion() {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-label="Setup complete"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>

        <div>
          <h2 className="text-xl font-bold">Setup Complete</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your organisation is ready to go. Here are some quick actions to get
            started.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link href="/journals/new">
            <Button variant="outline" className="w-full justify-start gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
              Add Journal
            </Button>
          </Link>
          <Link href="/banking">
            <Button variant="outline" className="w-full justify-start gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Import Bank CSV
            </Button>
          </Link>
          <Link href="/budgets">
            <Button variant="outline" className="w-full justify-start gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
              Create Budget
            </Button>
          </Link>
          <Link href="/reports">
            <Button variant="outline" className="w-full justify-start gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              View Reports
            </Button>
          </Link>
        </div>

        <Button className="w-full" onClick={handleFinish} disabled={isPending}>
          {isPending ? 'Finishing...' : 'Go to Dashboard'}
        </Button>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Step Router                                                      */
  /* ---------------------------------------------------------------- */

  function renderStep() {
    switch (step) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      case 4:
        return renderStep4();
      case 5:
        return renderStep5();
      case 6:
        return renderStep6();
      case 7:
        return renderStep7();
      default:
        return renderStep1();
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Card className="w-full max-w-2xl border shadow-sm">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl">
          {showCompletion ? 'All Done!' : 'Set Up ChurchLedger'}
        </CardTitle>
        <CardDescription>
          {showCompletion
            ? 'Your organisation is ready.'
            : `Step ${step} of ${TOTAL_STEPS}: ${STEP_META[step - 1].label}`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Progress bar */}
        <div className="space-y-2">
          <Progress value={progressPercent} />
          {!showCompletion && (
            <div className="flex justify-between">
              {STEP_META.map((meta, i) => {
                const stepNum = i + 1;
                const isActive = step === stepNum;
                const isDone = completed.includes(stepNum);
                return (
                  <button
                    key={stepNum}
                    onClick={() => {
                      setError(null);
                      setStep(stepNum);
                    }}
                    className={`text-[10px] transition-colors ${
                      isActive
                        ? 'font-bold text-primary'
                        : isDone
                          ? 'text-primary/70'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Step content */}
        {showCompletion ? renderCompletion() : renderStep()}

        {/* Back button (not shown on step 1 or completion) */}
        {!showCompletion && step > 1 && (
          <div className="border-t pt-4">
            <Button variant="ghost" size="sm" onClick={goBack} disabled={isPending}>
              Back to {STEP_META[step - 2].label}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
