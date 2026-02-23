'use server';

import { randomUUID } from 'crypto';
import { getActiveOrg } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { logAuditEvent } from '@/lib/audit';
import { assertWriteAllowed } from '@/lib/demo';
import type { DemoBatchInfo } from './types';

interface GenerateResult {
  success: boolean;
  error: string | null;
  batchId: string | null;
}

interface ClearResult {
  success: boolean;
  error: string | null;
  deletedCounts: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/*  Seed data definitions                                              */
/* ------------------------------------------------------------------ */

const SEED_ACCOUNTS: { code: string; name: string; type: string }[] = [
  { code: 'INC-001', name: 'Donations-General', type: 'income' },
  { code: 'INC-002', name: 'Donations-Restricted', type: 'income' },
  { code: 'EXP-001', name: 'Salaries', type: 'expense' },
  { code: 'EXP-004', name: 'Utilities', type: 'expense' },
  { code: 'EXP-005', name: 'Insurance', type: 'expense' },
  { code: 'AST-001', name: 'Bank Account 1', type: 'asset' },
  { code: 'LIA-001', name: 'Creditors/Accounts Payable', type: 'liability' },
  { code: 'LIA-002', name: 'PAYE/NIC Liability', type: 'liability' },
  { code: 'LIA-003', name: 'Pension Liability', type: 'liability' },
  { code: 'LIA-004', name: 'Net Pay Liability', type: 'liability' },
  { code: 'EQU-001', name: 'General Reserves', type: 'equity' },
  { code: 'CLR-GC', name: 'GoCardless Clearing', type: 'asset' },
  { code: 'EXP-FEE', name: 'Platform Fees', type: 'expense' },
  { code: 'INC-DON', name: 'Donations Income', type: 'income' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function firstOfMonth(monthsAgo: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/*  generateDemoData                                                   */
/* ------------------------------------------------------------------ */

export async function generateDemoData(
  orgId: string,
): Promise<GenerateResult> {
  await assertWriteAllowed();
  const { role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'seed', 'settings');
  } catch (e) {
    return {
      success: false,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
      batchId: null,
    };
  }

  const admin = createAdminClient();
  const batchId = randomUUID();

  try {
    // ============================================================
    // 1. Funds (2)
    // ============================================================
    const fundRows = [
      { organisation_id: orgId, name: 'General Fund', type: 'unrestricted', demo_batch_id: batchId },
      { organisation_id: orgId, name: 'Youth Fund', type: 'restricted', demo_batch_id: batchId },
    ];
    await admin
      .from('funds')
      .upsert(fundRows, { onConflict: 'organisation_id,name', ignoreDuplicates: true });

    // Fetch fund IDs
    const { data: funds } = await admin
      .from('funds')
      .select('id, name')
      .eq('organisation_id', orgId)
      .in('name', ['General Fund', 'Youth Fund']);

    const generalFundId = funds?.find((f) => f.name === 'General Fund')?.id;

    // ============================================================
    // 2. Accounts (seed if sparse)
    // ============================================================
    const accountRows = SEED_ACCOUNTS.map((a) => ({
      organisation_id: orgId,
      code: a.code,
      name: a.name,
      type: a.type,
      demo_batch_id: batchId,
    }));
    await admin
      .from('accounts')
      .upsert(accountRows, { onConflict: 'organisation_id,code', ignoreDuplicates: true });

    // Fetch all accounts for this org
    const { data: accounts } = await admin
      .from('accounts')
      .select('id, code, type')
      .eq('organisation_id', orgId);

    if (!accounts || accounts.length === 0) {
      return { success: false, error: 'No accounts found after seeding.', batchId: null };
    }

    const acctByCode = new Map(accounts.map((a) => [a.code, a]));
    const incomeAcct = acctByCode.get('INC-001');
    const incomeAcct2 = acctByCode.get('INC-002');
    const expenseAcct = acctByCode.get('EXP-004');
    const expenseAcct2 = acctByCode.get('EXP-005');
    const bankAcct = acctByCode.get('AST-001');
    const creditorsAcct = acctByCode.get('LIA-001');
    const salariesAcct = acctByCode.get('EXP-001');
    const payeAcct = acctByCode.get('LIA-002');
    const pensionLiaAcct = acctByCode.get('LIA-003');
    const netPayAcct = acctByCode.get('LIA-004');
    const clearingAcct = acctByCode.get('CLR-GC');
    const feeAcct = acctByCode.get('EXP-FEE');
    const donIncomeAcct = acctByCode.get('INC-DON');

    if (!incomeAcct || !bankAcct || !expenseAcct || !creditorsAcct || !salariesAcct) {
      return { success: false, error: 'Required accounts missing after seeding.', batchId: null };
    }

    // ============================================================
    // 3. Bank Account (1)
    // ============================================================
    const { data: bankAcctRow } = await admin
      .from('bank_accounts')
      .upsert(
        {
          organisation_id: orgId,
          name: 'Demo Main Bank',
          sort_code: '12-34-56',
          account_number_last4: '7890',
          demo_batch_id: batchId,
        },
        { onConflict: 'organisation_id,name', ignoreDuplicates: false },
      )
      .select('id')
      .single();

    const bankAccountId = bankAcctRow?.id;
    if (!bankAccountId) {
      return { success: false, error: 'Failed to create demo bank account.', batchId: null };
    }

    // ============================================================
    // 4. Bank Lines (10)
    // ============================================================
    const bankLineRows = [];
    for (let i = 0; i < 5; i++) {
      const amount = (i + 1) * 50000; // 500 to 2500 pounds
      bankLineRows.push({
        organisation_id: orgId,
        bank_account_id: bankAccountId,
        txn_date: daysAgo(60 - i * 10),
        description: `Demo deposit ${i + 1}`,
        reference: `DEP-DEMO-${i + 1}`,
        amount_pence: amount,
        fingerprint: `demo-dep-${batchId}-${i}`,
        demo_batch_id: batchId,
      });
    }
    for (let i = 0; i < 5; i++) {
      const amount = (i + 1) * -30000; // -300 to -1500 pounds
      bankLineRows.push({
        organisation_id: orgId,
        bank_account_id: bankAccountId,
        txn_date: daysAgo(55 - i * 10),
        description: `Demo payment ${i + 1}`,
        reference: `PAY-DEMO-${i + 1}`,
        amount_pence: amount,
        fingerprint: `demo-pay-${batchId}-${i}`,
        demo_batch_id: batchId,
      });
    }
    await admin.from('bank_lines').insert(bankLineRows);

    // ============================================================
    // 5. Journals (6): 3 income + 3 expense, all posted
    // ============================================================
    const journalIds: string[] = [];

    for (let i = 0; i < 3; i++) {
      const amount = (i + 1) * 75000; // 750 to 2250
      const targetIncome = i === 0 ? incomeAcct : (incomeAcct2 ?? incomeAcct);
      const { data: jnl } = await admin
        .from('journals')
        .insert({
          organisation_id: orgId,
          journal_date: daysAgo(50 - i * 15),
          memo: `[DEMO] Income journal ${i + 1}`,
          status: 'posted',
          posted_at: new Date().toISOString(),
          created_by: user.id,
          demo_batch_id: batchId,
        })
        .select('id')
        .single();

      if (jnl) {
        journalIds.push(jnl.id);
        await admin.from('journal_lines').insert([
          {
            journal_id: jnl.id,
            organisation_id: orgId,
            account_id: bankAcct.id,
            fund_id: generalFundId ?? null,
            description: `Demo income Dr bank ${i + 1}`,
            debit_pence: amount,
            credit_pence: 0,
            demo_batch_id: batchId,
          },
          {
            journal_id: jnl.id,
            organisation_id: orgId,
            account_id: targetIncome.id,
            fund_id: generalFundId ?? null,
            description: `Demo income Cr income ${i + 1}`,
            debit_pence: 0,
            credit_pence: amount,
            demo_batch_id: batchId,
          },
        ]);
      }
    }

    for (let i = 0; i < 3; i++) {
      const amount = (i + 1) * 40000; // 400 to 1200
      const targetExpense = i === 0 ? expenseAcct : (expenseAcct2 ?? expenseAcct);
      const { data: jnl } = await admin
        .from('journals')
        .insert({
          organisation_id: orgId,
          journal_date: daysAgo(45 - i * 12),
          memo: `[DEMO] Expense journal ${i + 1}`,
          status: 'posted',
          posted_at: new Date().toISOString(),
          created_by: user.id,
          demo_batch_id: batchId,
        })
        .select('id')
        .single();

      if (jnl) {
        journalIds.push(jnl.id);
        await admin.from('journal_lines').insert([
          {
            journal_id: jnl.id,
            organisation_id: orgId,
            account_id: targetExpense.id,
            fund_id: generalFundId ?? null,
            description: `Demo expense Dr expense ${i + 1}`,
            debit_pence: amount,
            credit_pence: 0,
            demo_batch_id: batchId,
          },
          {
            journal_id: jnl.id,
            organisation_id: orgId,
            account_id: bankAcct.id,
            fund_id: generalFundId ?? null,
            description: `Demo expense Cr bank ${i + 1}`,
            debit_pence: 0,
            credit_pence: amount,
            demo_batch_id: batchId,
          },
        ]);
      }
    }

    // ============================================================
    // 6. Supplier + Bill (posted) + Payment Run (posted)
    // ============================================================
    const { data: supplier } = await admin
      .from('suppliers')
      .upsert(
        {
          organisation_id: orgId,
          name: 'Demo Supplies Ltd',
          email: 'demo@supplies.example',
          demo_batch_id: batchId,
        },
        { onConflict: 'organisation_id,name', ignoreDuplicates: false },
      )
      .select('id')
      .single();

    if (supplier) {
      // Create bill
      const billAmount = 150000; // £1500
      const { data: bill } = await admin
        .from('bills')
        .insert({
          organisation_id: orgId,
          supplier_id: supplier.id,
          bill_number: 'DEMO-BILL-001',
          bill_date: daysAgo(30),
          due_date: daysAgo(0),
          status: 'approved',
          total_pence: billAmount,
          created_by: user.id,
          demo_batch_id: batchId,
        })
        .select('id')
        .single();

      if (bill) {
        await admin.from('bill_lines').insert({
          bill_id: bill.id,
          account_id: expenseAcct.id,
          fund_id: generalFundId ?? null,
          description: 'Demo office supplies',
          amount_pence: billAmount,
          demo_batch_id: batchId,
        });

        // Post the bill: create journal
        const { data: billJnl } = await admin
          .from('journals')
          .insert({
            organisation_id: orgId,
            journal_date: daysAgo(30),
            memo: '[DEMO] Bill posting - Demo Supplies Ltd',
            status: 'posted',
            posted_at: new Date().toISOString(),
            created_by: user.id,
            demo_batch_id: batchId,
          })
          .select('id')
          .single();

        if (billJnl) {
          await admin.from('journal_lines').insert([
            {
              journal_id: billJnl.id,
              organisation_id: orgId,
              account_id: expenseAcct.id,
              description: 'Demo bill expense',
              debit_pence: billAmount,
              credit_pence: 0,
              demo_batch_id: batchId,
            },
            {
              journal_id: billJnl.id,
              organisation_id: orgId,
              account_id: creditorsAcct.id,
              description: 'Demo bill creditor',
              debit_pence: 0,
              credit_pence: billAmount,
              demo_batch_id: batchId,
            },
          ]);

          // Update bill to posted
          await admin
            .from('bills')
            .update({ status: 'posted', journal_id: billJnl.id })
            .eq('id', bill.id);
        }

        // Create payment run
        const { data: payRun } = await admin
          .from('payment_runs')
          .insert({
            organisation_id: orgId,
            run_date: daysAgo(15),
            status: 'draft',
            total_pence: billAmount,
            created_by: user.id,
            demo_batch_id: batchId,
          })
          .select('id')
          .single();

        if (payRun) {
          await admin.from('payment_run_items').insert({
            payment_run_id: payRun.id,
            bill_id: bill.id,
            amount_pence: billAmount,
            demo_batch_id: batchId,
          });

          // Post payment run: create journal
          const { data: payJnl } = await admin
            .from('journals')
            .insert({
              organisation_id: orgId,
              journal_date: daysAgo(15),
              memo: '[DEMO] Payment run posting',
              status: 'posted',
              posted_at: new Date().toISOString(),
              created_by: user.id,
              demo_batch_id: batchId,
            })
            .select('id')
            .single();

          if (payJnl) {
            await admin.from('journal_lines').insert([
              {
                journal_id: payJnl.id,
                organisation_id: orgId,
                account_id: creditorsAcct.id,
                description: 'Demo payment Dr creditors',
                debit_pence: billAmount,
                credit_pence: 0,
                demo_batch_id: batchId,
              },
              {
                journal_id: payJnl.id,
                organisation_id: orgId,
                account_id: bankAcct.id,
                description: 'Demo payment Cr bank',
                debit_pence: 0,
                credit_pence: billAmount,
                demo_batch_id: batchId,
              },
            ]);

            await admin
              .from('payment_runs')
              .update({ status: 'posted', journal_id: payJnl.id })
              .eq('id', payRun.id);

            await admin
              .from('bills')
              .update({ status: 'paid' })
              .eq('id', bill.id);
          }
        }
      }
    }

    // ============================================================
    // 7. Donors + Donations + Gift Aid
    // ============================================================
    const donorRows = [
      {
        organisation_id: orgId,
        full_name: 'Demo Donor Alice',
        email: 'alice@demo.example',
        address: '1 Demo Street, London',
        postcode: 'SW1A 1AA',
        demo_batch_id: batchId,
      },
      {
        organisation_id: orgId,
        full_name: 'Demo Donor Bob',
        email: 'bob@demo.example',
        address: '2 Demo Road, Manchester',
        postcode: 'M1 1AA',
        demo_batch_id: batchId,
      },
    ];
    const { data: donors } = await admin
      .from('donors')
      .upsert(donorRows, { onConflict: 'organisation_id,full_name', ignoreDuplicates: false })
      .select('id, full_name');

    if (donors && donors.length >= 2) {
      // Gift Aid Declarations
      for (const donor of donors) {
        await admin.from('gift_aid_declarations').insert({
          donor_id: donor.id,
          start_date: '2024-01-01',
          end_date: null,
          is_active: true,
        });
      }

      // Donations
      const donationRows = [
        { donor_id: donors[0].id, amount: 50000, date: daysAgo(40) },
        { donor_id: donors[0].id, amount: 75000, date: daysAgo(25) },
        { donor_id: donors[1].id, amount: 30000, date: daysAgo(35) },
        { donor_id: donors[1].id, amount: 100000, date: daysAgo(10) },
      ];

      const { data: insertedDonations } = await admin
        .from('donations')
        .insert(
          donationRows.map((d) => ({
            organisation_id: orgId,
            donor_id: d.donor_id,
            donation_date: d.date,
            amount_pence: d.amount,
            fund_id: generalFundId ?? null,
            source: 'manual',
            status: 'posted',
            created_by: user.id,
            demo_batch_id: batchId,
          })),
        )
        .select('id');

      // Gift Aid Claim (first 3 donations)
      if (insertedDonations && insertedDonations.length >= 3) {
        const claimDonationIds = insertedDonations.slice(0, 3).map((d) => d.id);

        const { data: claim } = await admin
          .from('gift_aid_claims')
          .insert({
            organisation_id: orgId,
            claim_start: daysAgo(45),
            claim_end: daysAgo(20),
            created_by: user.id,
            demo_batch_id: batchId,
          })
          .select('id')
          .single();

        if (claim) {
          await admin
            .from('donations')
            .update({
              gift_aid_claim_id: claim.id,
              gift_aid_claimed_at: new Date().toISOString(),
            })
            .in('id', claimDonationIds);
        }
      }
    }

    // ============================================================
    // 8. Giving Import (GoCardless) with 3 rows + journal
    // ============================================================
    if (clearingAcct && donIncomeAcct) {
      const importHash = `demo-import-${batchId}`;
      const { data: givingImport } = await admin
        .from('giving_imports')
        .insert({
          organisation_id: orgId,
          provider: 'gocardless',
          import_start: daysAgo(30),
          import_end: daysAgo(20),
          file_name: 'demo-gocardless.csv',
          import_hash: importHash,
          status: 'completed',
          inserted_count: 3,
          skipped_count: 0,
          error_count: 0,
          journals_created: 1,
          created_by: user.id,
          demo_batch_id: batchId,
        })
        .select('id')
        .single();

      if (givingImport) {
        const importRows = [
          { gross: 25000, fee: 500, net: 24500, donor: 'GC Donor 1', date: daysAgo(28) },
          { gross: 50000, fee: 1000, net: 49000, donor: 'GC Donor 2', date: daysAgo(25) },
          { gross: 15000, fee: 300, net: 14700, donor: 'GC Donor 3', date: daysAgo(22) },
        ];

        await admin.from('giving_import_rows').insert(
          importRows.map((r, i) => ({
            giving_import_id: givingImport.id,
            organisation_id: orgId,
            provider: 'gocardless',
            txn_date: r.date,
            gross_amount_pence: r.gross,
            fee_amount_pence: r.fee,
            net_amount_pence: r.net,
            donor_name: r.donor,
            reference: `GC-DEMO-${i + 1}`,
            payout_reference: 'PO-DEMO-001',
            fingerprint: `demo-gc-${batchId}-${i}`,
            demo_batch_id: batchId,
          })),
        );

        // Create giving journal
        const totalGross = importRows.reduce((s, r) => s + r.gross, 0);
        const totalFee = importRows.reduce((s, r) => s + r.fee, 0);

        const { data: gcJnl } = await admin
          .from('journals')
          .insert({
            organisation_id: orgId,
            journal_date: daysAgo(25),
            memo: `[DEMO] GoCardless donations (Import ${givingImport.id})`,
            status: 'posted',
            posted_at: new Date().toISOString(),
            created_by: user.id,
            demo_batch_id: batchId,
          })
          .select('id')
          .single();

        if (gcJnl) {
          const gcLines = [
            {
              journal_id: gcJnl.id,
              organisation_id: orgId,
              account_id: clearingAcct.id,
              description: 'Demo GoCardless clearing Dr',
              debit_pence: totalGross,
              credit_pence: 0,
              demo_batch_id: batchId,
            },
            {
              journal_id: gcJnl.id,
              organisation_id: orgId,
              account_id: donIncomeAcct.id,
              description: 'Demo GoCardless income Cr',
              debit_pence: 0,
              credit_pence: totalGross,
              demo_batch_id: batchId,
            },
          ];
          if (totalFee > 0 && feeAcct) {
            gcLines.push(
              {
                journal_id: gcJnl.id,
                organisation_id: orgId,
                account_id: feeAcct.id,
                description: 'Demo platform fees Dr',
                debit_pence: totalFee,
                credit_pence: 0,
                demo_batch_id: batchId,
              },
              {
                journal_id: gcJnl.id,
                organisation_id: orgId,
                account_id: clearingAcct.id,
                description: 'Demo platform fees Cr clearing',
                debit_pence: 0,
                credit_pence: totalFee,
                demo_batch_id: batchId,
              },
            );
          }
          await admin.from('journal_lines').insert(gcLines);
          journalIds.push(gcJnl.id);
        }
      }
    }

    // ============================================================
    // 9. Payroll Run (posted)
    // ============================================================
    if (salariesAcct && payeAcct && pensionLiaAcct && netPayAcct) {
      const grossPence = 350000;
      const payePence = 60000;
      const nicPence = 30000;
      const pensionPence = 20000;
      const netPence = grossPence - payePence - nicPence - pensionPence;

      const { data: payrollJnl } = await admin
        .from('journals')
        .insert({
          organisation_id: orgId,
          journal_date: firstOfMonth(0),
          memo: '[DEMO] Payroll journal',
          status: 'posted',
          posted_at: new Date().toISOString(),
          created_by: user.id,
          demo_batch_id: batchId,
        })
        .select('id')
        .single();

      if (payrollJnl) {
        await admin.from('journal_lines').insert([
          {
            journal_id: payrollJnl.id,
            organisation_id: orgId,
            account_id: salariesAcct.id,
            description: 'Demo payroll gross salary',
            debit_pence: grossPence,
            credit_pence: 0,
            demo_batch_id: batchId,
          },
          {
            journal_id: payrollJnl.id,
            organisation_id: orgId,
            account_id: payeAcct.id,
            description: 'Demo PAYE/NIC',
            debit_pence: 0,
            credit_pence: payePence + nicPence,
            demo_batch_id: batchId,
          },
          {
            journal_id: payrollJnl.id,
            organisation_id: orgId,
            account_id: pensionLiaAcct.id,
            description: 'Demo pension',
            debit_pence: 0,
            credit_pence: pensionPence,
            demo_batch_id: batchId,
          },
          {
            journal_id: payrollJnl.id,
            organisation_id: orgId,
            account_id: netPayAcct.id,
            description: 'Demo net pay',
            debit_pence: 0,
            credit_pence: netPence,
            demo_batch_id: batchId,
          },
        ]);

        journalIds.push(payrollJnl.id);

        const { data: payrollRun } = await admin
          .from('payroll_runs')
          .insert({
            organisation_id: orgId,
            payroll_month: firstOfMonth(0),
            status: 'posted',
            total_gross_pence: grossPence,
            total_net_pence: netPence,
            total_paye_pence: payePence,
            total_nic_pence: nicPence,
            total_pension_pence: pensionPence,
            journal_id: payrollJnl.id,
            created_by: user.id,
            demo_batch_id: batchId,
          })
          .select('id')
          .single();

        if (payrollRun && generalFundId) {
          await admin.from('payroll_run_splits').insert({
            payroll_run_id: payrollRun.id,
            fund_id: generalFundId,
            amount_pence: grossPence,
            demo_batch_id: batchId,
          });
        }
      }
    }

    // ============================================================
    // 10. Reconciliation Match (1 bank line -> 1 journal)
    // ============================================================
    if (journalIds.length > 0) {
      // Fetch the first demo bank line
      const { data: demoLines } = await admin
        .from('bank_lines')
        .select('id')
        .eq('demo_batch_id', batchId)
        .limit(1);

      if (demoLines && demoLines.length > 0) {
        await admin.from('bank_reconciliation_matches').insert({
          organisation_id: orgId,
          bank_line_id: demoLines[0].id,
          journal_id: journalIds[0],
          match_type: 'manual',
          matched_by: user.id,
          demo_batch_id: batchId,
        });
      }
    }

    return { success: true, error: null, batchId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during demo generation.',
      batchId: null,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  clearDemoData                                                      */
/* ------------------------------------------------------------------ */

// Tables that have organisation_id column (can filter by org)
// vs child tables that don't (delete by demo_batch_id only)
const TABLES_WITHOUT_ORG_ID = new Set([
  'payment_run_items',
  'payroll_run_splits',
  'bill_lines',
]);

const DELETE_ORDER = [
  'bank_reconciliation_matches',
  'payment_run_items',
  'payroll_run_splits',
  'bill_lines',
  'journal_lines',
  'giving_import_rows',
  'payment_runs',
  'payroll_runs',
  'bills',
  'gift_aid_claims',
  'donations',
  'donors',
  'suppliers',
  'giving_imports',
  'journals',
  'bank_lines',
  'bank_accounts',
  'funds',
] as const;

export async function clearDemoData(
  orgId: string,
): Promise<ClearResult> {
  await assertWriteAllowed();
  const { role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'seed', 'settings');
  } catch (e) {
    return {
      success: false,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
      deletedCounts: {},
    };
  }

  const admin = createAdminClient();
  const deletedCounts: Record<string, number> = {};

  try {
    for (const table of DELETE_ORDER) {
      // Tables without organisation_id: filter only by demo_batch_id
      // Tables with organisation_id: also filter by org for safety
      const hasOrgId = !TABLES_WITHOUT_ORG_ID.has(table);

      let countQuery = admin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .not('demo_batch_id', 'is', null);
      if (hasOrgId) countQuery = countQuery.eq('organisation_id', orgId);
      const { count } = await countQuery;

      let deleteQuery = admin
        .from(table)
        .delete()
        .not('demo_batch_id', 'is', null);
      if (hasOrgId) deleteQuery = deleteQuery.eq('organisation_id', orgId);
      const { error } = await deleteQuery;

      if (error) {
        return {
          success: false,
          error: `Failed to clear ${table}: ${error.message}`,
          deletedCounts,
        };
      }

      deletedCounts[table] = count ?? 0;
    }

    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'clear_demo_data',
      entityType: 'demo_data',
      metadata: { deletedCounts },
    });

    return { success: true, error: null, deletedCounts };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during demo cleanup.',
      deletedCounts,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  getDemoBatchInfo                                                   */
/* ------------------------------------------------------------------ */

const DEMO_TABLES = [
  'journals',
  'journal_lines',
  'bank_accounts',
  'bank_lines',
  'suppliers',
  'bills',
  'donors',
  'donations',
  'gift_aid_claims',
  'giving_imports',
  'payroll_runs',
  'payment_runs',
  'bank_reconciliation_matches',
  'funds',
] as const;

export async function getDemoBatchInfo(
  orgId: string,
): Promise<DemoBatchInfo> {
  const admin = createAdminClient();
  const counts: Record<string, number> = {};
  let total = 0;

  for (const table of DEMO_TABLES) {
    const { count } = await admin
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .not('demo_batch_id', 'is', null);

    const c = count ?? 0;
    counts[table] = c;
    total += c;
  }

  return { totalDemoRecords: total, counts };
}
