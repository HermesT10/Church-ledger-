import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getAppEnv, getSupabaseBrowserEnv, isProduction } from '@/lib/env';
import {
  DEMO_MODE_HEADER,
  PATHNAME_HEADER,
  REQUEST_ID_HEADER,
} from '@/lib/request-context';

/* ------------------------------------------------------------------ */
/*  Demo mode detection (env + query params)                           */
/* ------------------------------------------------------------------ */

function isDemoRequest(request: NextRequest): boolean {
  if (process.env.DEMO_MODE !== 'true') return false;
  const demo = request.nextUrl.searchParams.get('demo');
  const key = request.nextUrl.searchParams.get('key');
  if (demo !== '1' || !key) return false;
  return key === process.env.DEMO_MODE_KEY;
}

/* ------------------------------------------------------------------ */
/*  Proxy (formerly Middleware — renamed for Next.js 16)                */
/* ------------------------------------------------------------------ */

export async function proxy(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
  const demoMode = isDemoRequest(request);
  const supabaseEnv = getSupabaseBrowserEnv();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname);
  requestHeaders.set('x-app-env', getAppEnv());
  if (demoMode) {
    requestHeaders.set(DEMO_MODE_HEADER, 'true');
  }

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set(REQUEST_ID_HEADER, requestId);

  const supabase = createServerClient(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the auth token — this keeps the session alive
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/auth/callback',
    '/api/health',
  ];
  const isPublic = publicRoutes.some(
    (route) =>
      request.nextUrl.pathname === route ||
      request.nextUrl.pathname.startsWith('/auth/')
  );

  // Protect all non-public routes — redirect to login if no session.
  // Demo mode bypasses the auth redirect.
  if (!isPublic && !user && !demoMode) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
    const redirectResponse = NextResponse.redirect(loginUrl);
    applyOperationalHeaders(redirectResponse, requestId);
    return redirectResponse;
  }

  // Forward the pathname and request ID so server components can read them via headers()
  response.headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  response.headers.set('x-app-env', getAppEnv());

  // Signal demo mode to downstream server components and actions
  if (demoMode) {
    response.headers.set(DEMO_MODE_HEADER, 'true');
  }

  applyOperationalHeaders(response, requestId);

  return response;
}

function applyOperationalHeaders(response: NextResponse, requestId: string) {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), geolocation=(), microphone=()',
  );

  if (isProduction()) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
