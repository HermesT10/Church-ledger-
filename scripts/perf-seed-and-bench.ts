/**
 * Performance Seed & Benchmark Script
 *
 * Seeds 10,000 journal lines (across ~500 journals) and 1,000 bank lines,
 * then measures the execution time of key report queries.
 *
 * Run with:
 *   npx tsx scripts/perf-seed-and-bench.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 * (reads from .env.local automatically via dotenv).
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const JOURNAL_COUNT = 500;
const LINES_PER_JOURNAL = 20; // ~10,000 total lines
const BANK_LINE_COUNT = 1000;
const DASHBOARD_THRESHOLD_MS = 300;
const REPORT_THRESHOLD_MS = 500;

/* ------------------------------------------------------------------ */
/*  Load env                                                           */
/* ------------------------------------------------------------------ */

// Try to load .env.local for local dev
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: '.env.local' });
} catch {
  // dotenv not available, env vars must be set externally
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function randomDate(year: number): string {
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMs(ms: number): string {
  return `${ms.toFixed(0)}ms`;
}

async function measureQuery<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ result: T; elapsedMs: number }> {
  const start = performance.now();
  const result = await fn();
  const elapsedMs = performance.now() - start;
  return { result, elapsedMs };
}

/* ------------------------------------------------------------------ */
/*  Seed data                                                          */
/* ------------------------------------------------------------------ */

async function seedData(orgId: string) {
  console.log('\n--- Seeding performance test data ---');

  // Fetch existing accounts for the org (need at least 2 for balanced journals)
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, type')
    .eq('organisation_id', orgId)
    .limit(10);

  if (!accounts || accounts.length < 2) {
    console.error(
      'Need at least 2 accounts in the org to seed journals. Please seed accounts first.',
    );
    process.exit(1);
  }

  // Pick two accounts for balanced journal entries
  const accountA = accounts[0].id;
  const accountB = accounts[1].id;

  const year = new Date().getFullYear();

  // Seed journals + lines in batches
  console.log(`Seeding ${JOURNAL_COUNT} journals with ${LINES_PER_JOURNAL} lines each...`);

  const BATCH_SIZE = 50;
  let totalLines = 0;

  for (let batch = 0; batch < JOURNAL_COUNT; batch += BATCH_SIZE) {
    const batchEnd = Math.min(batch + BATCH_SIZE, JOURNAL_COUNT);
    const journalRows = [];

    for (let i = batch; i < batchEnd; i++) {
      journalRows.push({
        id: randomUUID(),
        organisation_id: orgId,
        journal_date: randomDate(year),
        memo: `Perf test journal ${i + 1}`,
        status: 'posted',
        posted_at: new Date().toISOString(),
      });
    }

    const { error: jErr } = await supabase.from('journals').insert(journalRows);
    if (jErr) {
      console.error(`Error seeding journals batch ${batch}:`, jErr.message);
      process.exit(1);
    }

    // Create lines for each journal in this batch
    const lineRows = [];
    for (const j of journalRows) {
      const halfLines = Math.floor(LINES_PER_JOURNAL / 2);
      for (let li = 0; li < halfLines; li++) {
        const amount = Math.floor(Math.random() * 100000) + 100; // 1.00 to 1000.00
        lineRows.push({
          journal_id: j.id,
          organisation_id: orgId,
          account_id: accountA,
          fund_id: null,
          description: `Perf debit line ${li + 1}`,
          debit_pence: amount,
          credit_pence: 0,
        });
        lineRows.push({
          journal_id: j.id,
          organisation_id: orgId,
          account_id: accountB,
          fund_id: null,
          description: `Perf credit line ${li + 1}`,
          debit_pence: 0,
          credit_pence: amount,
        });
      }
    }

    const { error: lErr } = await supabase.from('journal_lines').insert(lineRows);
    if (lErr) {
      console.error(`Error seeding journal lines batch ${batch}:`, lErr.message);
      process.exit(1);
    }

    totalLines += lineRows.length;
    process.stdout.write(`  Journals: ${batchEnd}/${JOURNAL_COUNT}  Lines: ${totalLines}\r`);
  }

  console.log(`\n  ✓ Seeded ${JOURNAL_COUNT} journals with ${totalLines} lines`);

  // Seed bank lines
  console.log(`Seeding ${BANK_LINE_COUNT} bank lines...`);

  const { data: bankAccounts } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('organisation_id', orgId)
    .limit(1);

  if (!bankAccounts || bankAccounts.length === 0) {
    console.warn('No bank accounts found; skipping bank line seeding.');
  } else {
    const bankAccountId = bankAccounts[0].id;
    const bankLineRows = [];

    for (let i = 0; i < BANK_LINE_COUNT; i++) {
      const amount = Math.floor(Math.random() * 500000) + 100;
      const isDebit = Math.random() > 0.5;
      bankLineRows.push({
        organisation_id: orgId,
        bank_account_id: bankAccountId,
        txn_date: randomDate(year),
        description: `Perf bank line ${i + 1}`,
        amount_pence: isDebit ? -amount : amount,
        reference: `PERF-${i + 1}`,
      });
    }

    // Insert in batches
    for (let i = 0; i < bankLineRows.length; i += 200) {
      const batch = bankLineRows.slice(i, i + 200);
      const { error: blErr } = await supabase.from('bank_lines').insert(batch);
      if (blErr) {
        console.error(`Error seeding bank lines batch ${i}:`, blErr.message);
        process.exit(1);
      }
    }

    console.log(`  ✓ Seeded ${BANK_LINE_COUNT} bank lines`);
  }
}

/* ------------------------------------------------------------------ */
/*  Benchmark queries                                                  */
/* ------------------------------------------------------------------ */

async function runBenchmarks(orgId: string) {
  console.log('\n--- Running benchmarks ---\n');
  const year = new Date().getFullYear();
  const results: { label: string; elapsedMs: number; pass: boolean }[] = [];

  // 1. Simulate getActualsByMonth: fetch posted journals then their lines
  {
    const { elapsedMs } = await measureQuery('getActualsByMonth', async () => {
      const { data: journals } = await supabase
        .from('journals')
        .select('id, journal_date')
        .eq('organisation_id', orgId)
        .eq('status', 'posted')
        .gte('journal_date', `${year}-01-01`)
        .lte('journal_date', `${year}-12-31`);

      if (!journals || journals.length === 0) return [];

      const journalIds = journals.map((j) => j.id);
      const { data: lines } = await supabase
        .from('journal_lines')
        .select('account_id, fund_id, debit_pence, credit_pence, journal_id')
        .eq('organisation_id', orgId)
        .in('journal_id', journalIds);

      return lines ?? [];
    });

    const pass = elapsedMs < REPORT_THRESHOLD_MS;
    results.push({ label: 'getActualsByMonth', elapsedMs, pass });
  }

  // 2. Simulate dashboard count queries
  {
    const { elapsedMs } = await measureQuery('getDashboardData', async () => {
      const [accountsRes, billsRes, donationsRes] = await Promise.all([
        supabase
          .from('accounts')
          .select('*', { count: 'exact', head: true })
          .eq('organisation_id', orgId)
          .eq('is_active', true),
        supabase
          .from('bills')
          .select('*', { count: 'exact', head: true })
          .eq('organisation_id', orgId)
          .in('status', ['approved', 'posted']),
        supabase
          .from('donations')
          .select('amount_pence')
          .eq('organisation_id', orgId)
          .eq('status', 'posted')
          .is('gift_aid_claim_id', null),
      ]);

      return {
        accounts: accountsRes.count,
        bills: billsRes.count,
        donations: donationsRes.data?.length ?? 0,
      };
    });

    const pass = elapsedMs < DASHBOARD_THRESHOLD_MS;
    results.push({ label: 'getDashboardData (counts)', elapsedMs, pass });
  }

  // 3. Bank lines reconciliation query
  {
    const { data: bankAccounts } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('organisation_id', orgId)
      .limit(1);

    if (bankAccounts && bankAccounts.length > 0) {
      const bankAccountId = bankAccounts[0].id;
      const { elapsedMs } = await measureQuery('bankLinesQuery', async () => {
        const { data } = await supabase
          .from('bank_lines')
          .select('*')
          .eq('organisation_id', orgId)
          .eq('bank_account_id', bankAccountId)
          .order('txn_date', { ascending: false })
          .limit(100);
        return data;
      });

      const pass = elapsedMs < DASHBOARD_THRESHOLD_MS;
      results.push({ label: 'bankLinesQuery (top 100)', elapsedMs, pass });
    }
  }

  // Print results
  console.log('Results:');
  console.log('─'.repeat(60));
  for (const r of results) {
    const status = r.pass ? '✓ PASS' : '✗ FAIL';
    console.log(
      `  ${status}  ${r.label.padEnd(30)} ${formatMs(r.elapsedMs).padStart(8)}`,
    );
  }
  console.log('─'.repeat(60));

  const allPassed = results.every((r) => r.pass);
  if (allPassed) {
    console.log('\n✓ All benchmarks passed!\n');
  } else {
    console.log('\n✗ Some benchmarks failed. Review slow queries above.\n');
    process.exit(1);
  }
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  console.log('Performance Seed & Benchmark');
  console.log('============================');

  // Find the first org in the system
  const { data: orgs, error: orgErr } = await supabase
    .from('organisations')
    .select('id, name')
    .limit(1);

  if (orgErr || !orgs || orgs.length === 0) {
    console.error('No organisations found. Please set up the app first.');
    process.exit(1);
  }

  const orgId = orgs[0].id;
  console.log(`Using org: ${orgs[0].name} (${orgId})`);

  await seedData(orgId);
  await runBenchmarks(orgId);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
