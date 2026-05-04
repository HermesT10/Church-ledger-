/**
 * Applies the SQL from `supabase/migrations/00048_signup_fields.sql` to the
 * connected Supabase Postgres database. Use this when the remote project is
 * missing `organisations.city` / `organisations.country` (or related signup columns).
 *
 * Requires (pick one):
 * - `DATABASE_URL` — full Postgres URI from Supabase → Settings → Database, or
 * - `SUPABASE_DB_PASSWORD` — database password, together with
 *   `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` to derive the host.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withDatabaseClient } from './db-connection';

const __dir = dirname(fileURLToPath(import.meta.url));

const sql = readFileSync(
  join(__dir, '../supabase/migrations/00048_signup_fields.sql'),
  'utf-8',
);

async function main() {
  await withDatabaseClient(async (client) => {
    await client.query(sql);
  });
  console.log('Applied 00048_signup_fields: profiles.phone, organisations.city, organisations.country, handle_new_user update.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
