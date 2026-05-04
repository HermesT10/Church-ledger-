import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withDatabaseClient } from './db-connection';

const __dir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dir, '../supabase/migrations');

type LocalMigration = {
  file: string;
  version: string;
  name: string;
};

function getLocalMigrations(): LocalMigration[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => {
      const match = file.match(/^([0-9]+)_(.+)\.sql$/);
      if (!match) {
        throw new Error(`Migration file does not follow <version>_<name>.sql: ${file}`);
      }

      return {
        file,
        version: match[1],
        name: match[2],
      };
    });
}

async function main() {
  const local = getLocalMigrations();

  await withDatabaseClient(async (client) => {
    const { rows } = await client.query<{ version: string; name: string | null }>(`
      select version::text, coalesce(name, '') as name
      from supabase_migrations.schema_migrations
      order by version
    `);

    const remoteVersions = new Set(rows.map((row) => row.version));
    const remoteNames = new Set(rows.map((row) => row.name).filter(Boolean));
    const missing = local.filter(
      (migration) =>
        !remoteVersions.has(migration.version) &&
        !remoteNames.has(migration.name) &&
        !remoteNames.has(migration.file.replace(/\.sql$/, '')),
    );

    if (missing.length > 0) {
      console.error('Remote database is missing local migrations:');
      for (const migration of missing) {
        console.error(`  - ${migration.file}`);
      }
      process.exit(1);
    }

    console.log(`Remote migration history includes all ${local.length} local migration files.`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
