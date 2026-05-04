import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

export type PayrollLiabilityType = 'net_wages' | 'paye_nic' | 'pension';

export interface PayrollBankMatchSuggestion {
  liabilityPaymentId: string;
  payrollRunId: string | null;
  liabilityType: PayrollLiabilityType;
  amountPence: number;
  paymentDate: string | null;
  paymentReference: string | null;
  bankLineId: string;
  bankDescription: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

type LooseDbResult<T = unknown> = { data: T | null; error: { message: string } | null };
type LooseDbQuery<T = unknown> = PromiseLike<LooseDbResult<T>> & {
  select(columns?: string): LooseDbQuery<T>;
  eq(column: string, value: unknown): LooseDbQuery<T>;
  in(column: string, values: unknown[]): LooseDbQuery<T>;
};
type LooseDbClient = {
  from(table: string): LooseDbQuery;
};

function sameAmount(liabilityAmount: number, bankAmount: number) {
  return Math.abs(liabilityAmount) === Math.abs(bankAmount);
}

function nearDate(liabilityDate: string | null, bankDate: string | null) {
  if (!liabilityDate || !bankDate) return false;
  const a = new Date(`${liabilityDate}T00:00:00`).getTime();
  const b = new Date(`${bankDate}T00:00:00`).getTime();
  return Math.abs(a - b) <= 7 * 24 * 60 * 60 * 1000;
}

export async function suggestPayrollBankMatches(
  workspaceId: string,
): Promise<PayrollBankMatchSuggestion[]> {
  const admin = createAdminClient() as unknown as LooseDbClient;
  const [{ data: liabilities }, { data: bankLines }] = await Promise.all([
    admin
      .from('payroll_liability_payments')
      .select('id, payroll_run_id, liability_type, amount_pence, payment_date, payment_reference, status')
      .eq('workspace_id', workspaceId)
      .in('status', ['pending', 'paid']),
    admin
      .from('bank_lines')
      .select('id, description, amount_pence, transaction_date, reconciled')
      .eq('workspace_id', workspaceId)
      .eq('reconciled', false),
  ]);

  const suggestions: PayrollBankMatchSuggestion[] = [];

  for (const liability of (liabilities ?? []) as Array<Record<string, unknown>>) {
    for (const bankLine of (bankLines ?? []) as Array<Record<string, unknown>>) {
      const amountMatches = sameAmount(Number(liability.amount_pence ?? 0), Number(bankLine.amount_pence ?? 0));
      if (!amountMatches) continue;

      const description = String(bankLine.description ?? '').toLowerCase();
      const reference = String(liability.payment_reference ?? '').toLowerCase();
      const referenceMatches = Boolean(reference && description.includes(reference));
      const dateMatches = nearDate(
        (liability.payment_date as string | null) ?? null,
        (bankLine.transaction_date as string | null) ?? null,
      );

      const confidence: PayrollBankMatchSuggestion['confidence'] = referenceMatches
        ? 'high'
        : dateMatches
          ? 'medium'
          : 'low';

      suggestions.push({
        liabilityPaymentId: String(liability.id),
        payrollRunId: (liability.payroll_run_id as string | null) ?? null,
        liabilityType: liability.liability_type as PayrollLiabilityType,
        amountPence: Number(liability.amount_pence ?? 0),
        paymentDate: (liability.payment_date as string | null) ?? null,
        paymentReference: (liability.payment_reference as string | null) ?? null,
        bankLineId: String(bankLine.id),
        bankDescription: (bankLine.description as string | null) ?? null,
        confidence,
        reason: referenceMatches
          ? 'Amount and payment reference match.'
          : dateMatches
            ? 'Amount matches and bank date is within seven days.'
            : 'Amount matches; review before reconciling.',
      });
    }
  }

  return suggestions;
}
