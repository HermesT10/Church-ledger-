import { headers } from 'next/headers';
import { getAppEnv, type AppEnv } from '@/lib/env';

export const REQUEST_ID_HEADER = 'x-request-id';
export const PATHNAME_HEADER = 'x-pathname';
export const DEMO_MODE_HEADER = 'x-demo-mode';

export interface RequestContext {
  requestId: string | null;
  pathname: string | null;
  demoMode: boolean;
  appEnv: AppEnv;
}

export async function getRequestContext(): Promise<RequestContext> {
  try {
    const headerStore = await headers();
    return {
      requestId: headerStore.get(REQUEST_ID_HEADER),
      pathname: headerStore.get(PATHNAME_HEADER),
      demoMode: headerStore.get(DEMO_MODE_HEADER) === 'true',
      appEnv: getAppEnv(),
    };
  } catch {
    return {
      requestId: null,
      pathname: null,
      demoMode: false,
      appEnv: getAppEnv(),
    };
  }
}
