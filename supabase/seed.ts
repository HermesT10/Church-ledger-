/**
 * Seed script — run with: npx tsx supabase/seed.ts
 *
 * Creates a default organisation ("My Church").
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * to be set in .env.local (loaded automatically by dotenv).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  const { data, error } = await supabase
    .from('organisations')
    .insert({ name: 'My Church' })
    .select()
    .single();

  if (error) {
    console.error('Failed to create organisation:', error.message);
    process.exit(1);
  }

  console.log('Organisation created:', data);
  console.log('ID:', data.id);
}

main();
