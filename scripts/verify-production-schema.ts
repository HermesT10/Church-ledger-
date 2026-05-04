import { withDatabaseClient } from './db-connection';

const requiredColumns = [
  ['public', 'profiles', 'active_organisation_id'],
  ['public', 'profiles', 'phone'],
  ['public', 'organisations', 'city'],
  ['public', 'organisations', 'country'],
  ['public', 'organisations', 'legal_name'],
  ['public', 'organisation_settings', 'base_currency'],
  ['public', 'journals', 'source_type'],
  ['public', 'journals', 'source_id'],
  ['public', 'journal_lines', 'supplier_id'],
  ['public', 'financial_periods', 'status'],
] as const;

const requiredTables = [
  ['public', 'journals'],
  ['public', 'journal_lines'],
  ['public', 'memberships'],
  ['public', 'organisation_settings'],
  ['public', 'audit_log'],
  ['public', 'approval_events'],
  ['public', 'financial_periods'],
  ['public', 'evidence_files'],
  ['public', 'product_events'],
  ['public', 'month_end_reviews'],
] as const;

async function main() {
  await withDatabaseClient(async (client) => {
    const missingTables: string[] = [];
    const missingColumns: string[] = [];

    for (const [schema, table] of requiredTables) {
      const { rowCount } = await client.query(
        `
          select 1
          from information_schema.tables
          where table_schema = $1 and table_name = $2
        `,
        [schema, table],
      );

      if (rowCount === 0) {
        missingTables.push(`${schema}.${table}`);
      }
    }

    for (const [schema, table, column] of requiredColumns) {
      const { rowCount } = await client.query(
        `
          select 1
          from information_schema.columns
          where table_schema = $1 and table_name = $2 and column_name = $3
        `,
        [schema, table, column],
      );

      if (rowCount === 0) {
        missingColumns.push(`${schema}.${table}.${column}`);
      }
    }

    if (missingTables.length > 0 || missingColumns.length > 0) {
      if (missingTables.length > 0) {
        console.error('Missing required tables:');
        for (const table of missingTables) console.error(`  - ${table}`);
      }

      if (missingColumns.length > 0) {
        console.error('Missing required columns:');
        for (const column of missingColumns) console.error(`  - ${column}`);
      }

      process.exit(1);
    }

    console.log('Production schema verification passed.');
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
