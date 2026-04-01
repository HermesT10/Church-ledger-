import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function isDemoRequest(request: NextRequest): boolean {
  if (process.env.DEMO_MODE !== 'true') {
    return false;
  }

  const demoKey = process.env.DEMO_MODE_KEY;
  const demoFlag = request.nextUrl.searchParams.get('demo');
  const providedKey = request.nextUrl.searchParams.get('key');

  return Boolean(demoKey) && demoFlag === '1' && providedKey === demoKey;
}

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  requestHeaders.set('x-demo-mode', isDemoRequest(request) ? 'true' : 'false');

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
