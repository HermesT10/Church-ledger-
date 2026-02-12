import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // Simple connectivity check — queries the built-in now() function
    const { data, error } = await supabase.rpc('now' as never);

    if (error) {
      return NextResponse.json(
        { status: 'error', message: error.message },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      timestamp: data,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
