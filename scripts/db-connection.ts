import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { Client } from 'pg';

const __dir = dirname(fileURLToPath(import.meta.url));

config({ path: join(__dir, '../.env.local') });
config({ path: join(__dir, '../.env') });

export function getConnectionString(): string {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();

  if (!url || !password) {
    throw new Error(
      [
        'Missing database credentials. Add one of:',
        '  - DATABASE_URL (Supabase -> Settings -> Database -> Connection string, URI), or',
        '  - SUPABASE_DB_PASSWORD and NEXT_PUBLIC_SUPABASE_URL in .env.local',
        '    (the password is the Postgres password for the project, not the anon key).',
      ].join('\n'),
    );
  }

  const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/);
  if (!match) {
    throw new Error('Could not parse project ref from NEXT_PUBLIC_SUPABASE_URL.');
  }

  const projectRef = match[1];
  const user = encodeURIComponent('postgres');
  const pass = encodeURIComponent(password);

  return `postgresql://${user}:${pass}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`;
}

export async function withDatabaseClient<T>(
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: getConnectionString() });
  try {
    await client.connect();
    return await callback(client);
  } finally {
    await client.end();
  }
}
