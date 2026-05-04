'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deactivateBankRule, testBankRuleAgainstRecentTransactions } from '@/lib/banking/bank-rules-actions';
import type { BankRuleTestMatch } from '@/lib/banking/bank-rules-actions.types';
import type { BankRuleRow } from '@/lib/banking/types';
import { BankRuleForm } from '../bank-rule-form';

type Option = { id: string; name: string };

interface Props {
  rules: BankRuleRow[];
  bankAccounts: Option[];
  ledgerAccounts: Option[];
  funds: Option[];
  incomeStreams: Option[];
  donors: Option[];
  suppliers: Option[];
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatPounds(pence: number) {
  const sign = pence < 0 ? '-' : '';
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

function conditionLabel(rule: BankRuleRow) {
  if (rule.condition_type === 'amount_equals') return `Amount equals £${Number(rule.amount_min ?? 0).toFixed(2)}`;
  if (rule.condition_type === 'amount_range') {
    return `Amount ${rule.amount_min == null ? 'any' : `£${Number(rule.amount_min).toFixed(2)}`} to ${rule.amount_max == null ? 'any' : `£${Number(rule.amount_max).toFixed(2)}`}`;
  }
  return `${rule.condition_type.replaceAll('_', ' ')} "${rule.condition_value ?? ''}"`;
}

function actionLabel(rule: BankRuleRow) {
  return [
    rule.transaction_type,
    rule.account_id ? 'account' : null,
    rule.fund_id ? 'fund' : null,
    rule.income_stream_id ? 'income stream' : null,
    rule.donor_id ? 'donor' : null,
    rule.supplier_id ? 'supplier' : null,
  ].filter(Boolean).join(' · ');
}

export function BankRulesClient({
  rules,
  bankAccounts,
  ledgerAccounts,
  funds,
  incomeStreams,
  donors,
  suppliers,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [testResults, setTestResults] = useState<Record<string, BankRuleTestMatch[]>>({});

  function handleDeactivate(ruleId: string) {
    startTransition(async () => {
      const result = await deactivateBankRule(ruleId);
      if (result.error) toast.error(result.error);
      else {
        toast.success('Bank rule deactivated.');
        router.refresh();
      }
    });
  }

  function handleTest(ruleId: string) {
    startTransition(async () => {
      const result = await testBankRuleAgainstRecentTransactions(ruleId);
      if (result.error || !result.data) toast.error(result.error ?? 'Could not test rule.');
      else {
        setTestResults((current) => ({ ...current, [ruleId]: result.data ?? [] }));
        toast.success(`Found ${result.data.length} recent matching transaction${result.data.length === 1 ? '' : 's'}.`);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-4">
        <div>
          <h2 className="font-semibold">Bank rules</h2>
          <p className="text-sm text-muted-foreground">Rules suggest categorisation and matching during reconciliation. Auto-apply is opt-in.</p>
        </div>
        <BankRuleForm
          accounts={bankAccounts}
          ledgerAccounts={ledgerAccounts}
          funds={funds}
          incomeStreams={incomeStreams}
          donors={donors}
          suppliers={suppliers}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last applied</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No bank rules yet.
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div className="font-medium">{rule.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {rule.bank_account_id ? bankAccounts.find((account) => account.id === rule.bank_account_id)?.name ?? 'Specific account' : 'All accounts'}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {conditionLabel(rule)}
                    {rule.direction && <span className="block text-xs text-muted-foreground">Money {rule.direction}</span>}
                  </TableCell>
                  <TableCell className="text-sm">{actionLabel(rule)}</TableCell>
                  <TableCell>{rule.priority}</TableCell>
                  <TableCell>
                    <Badge variant={rule.status === 'active' ? 'default' : 'secondary'}>
                      {rule.status}
                    </Badge>
                    {rule.auto_apply && <Badge variant="outline" className="ml-1">Auto apply</Badge>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(rule.last_applied_at)}
                    {rule.applied_count > 0 && <span className="block text-xs text-muted-foreground">{rule.applied_count} applications</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <BankRuleForm
                        accounts={bankAccounts}
                        ledgerAccounts={ledgerAccounts}
                        funds={funds}
                        incomeStreams={incomeStreams}
                        donors={donors}
                        suppliers={suppliers}
                        rule={rule}
                        triggerLabel="Edit"
                      />
                      <Button variant="outline" size="sm" onClick={() => handleTest(rule.id)} disabled={isPending}>Test</Button>
                      {rule.status === 'active' && (
                        <Button variant="ghost" size="sm" onClick={() => handleDeactivate(rule.id)} disabled={isPending}>
                          Deactivate
                        </Button>
                      )}
                    </div>
                    {testResults[rule.id] && (
                      <div className="mt-2 rounded-xl bg-muted/50 p-2 text-xs">
                        {testResults[rule.id].length === 0 ? (
                          <p className="text-muted-foreground">No recent transactions matched.</p>
                        ) : (
                          testResults[rule.id].slice(0, 3).map((match) => (
                            <p key={match.bank_transaction_id} className="truncate">
                              {match.date}: {match.description || 'No description'} · {formatPounds(match.amount_pence)}
                            </p>
                          ))
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
