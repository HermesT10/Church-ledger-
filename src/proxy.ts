import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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
  const demoMode = isDemoRequest(request);

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
              headers: request.headers,
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
  const publicRoutes = ['/', '/login', '/signup', '/auth/callback', '/api/health'];
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
    return NextResponse.redirect(loginUrl);
  }

  // Forward the pathname so server components can read it via headers()
  response.headers.set('x-pathname', request.nextUrl.pathname);

  // Signal demo mode to downstream server components and actions
  if (demoMode) {
    response.headers.set('x-demo-mode', 'true');
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
