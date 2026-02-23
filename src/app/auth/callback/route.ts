import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // If a `next` param was supplied (e.g. /accept-invite?token=xyz), honour it
      const redirectPath = next && next.startsWith('/') ? next : '/dashboard';
      return NextResponse.redirect(`${origin}${redirectPath}`);
    }
  }

  // Something went wrong — redirect back to login with an error
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent('Could not authenticate. Please try again.')}`
  );
}
