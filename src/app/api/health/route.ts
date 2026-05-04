import { NextResponse } from 'next/server';
import { getCacheStats } from '@/lib/cache';
import { getRuntimeMetadata, getServerEnv } from '@/lib/env.server';
import { logServerFailure } from '@/lib/monitoring';
import { REQUEST_ID_HEADER } from '@/lib/request-context';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const runtime = getRuntimeMetadata();
  const requestId = request.headers.get(REQUEST_ID_HEADER);
  try {
    getServerEnv();
    const supabase = await createClient();
    const admin = createAdminClient();

    // Simple connectivity check — queries the built-in now() function
    const { data, error } = await supabase.rpc('now' as never);
    const { data: buckets, error: storageError } = await admin.storage.listBuckets();

    if (error) {
      return NextResponse.json(
        {
          status: 'error',
          appEnv: runtime.appEnv,
          release: runtime.release,
          checks: {
            env: 'ok',
            database: 'error',
            storage: storageError ? 'error' : 'unknown',
          },
          cache: getCacheStats(),
          requestId,
          message: error.message,
        },
        { status: 503 }
      );
    }

    const hasEvidenceBucket = (buckets ?? []).some((bucket) => bucket.id === 'financial-evidence');

    return NextResponse.json({
      status: 'ok',
      appEnv: runtime.appEnv,
      release: runtime.release,
      siteUrl: runtime.siteUrl,
      checks: {
        env: 'ok',
        database: 'ok',
        storage: storageError ? 'error' : hasEvidenceBucket ? 'ok' : 'missing_financial_evidence_bucket',
      },
      cache: getCacheStats(),
      timestamp: data,
      requestId,
    });
  } catch (err) {
    await logServerFailure({
      area: 'api',
      event: 'health_check_failed',
      error: err,
      capture: false,
    });

    return NextResponse.json(
      {
        status: 'error',
        appEnv: runtime.appEnv,
        release: runtime.release,
        checks: {
          env: 'error',
          database: 'unknown',
          storage: 'unknown',
        },
        cache: getCacheStats(),
        requestId,
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
