import { headers } from 'next/headers';

/**
 * Demo mode helpers.
 *
 * Demo mode is a dev-only, read-only bypass of Supabase auth so that
 * external reviewers can browse the app without credentials.
 *
 * Triple-gated:
 *   1. env DEMO_MODE="true"
 *   2. query param ?demo=1
 *   3. query param ?key=<DEMO_MODE_KEY>
 *
 * The middleware validates conditions 1-3 and sets an `x-demo-mode`
 * header that downstream helpers read.
 */

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const DEMO_FAKE_USER_ID = '00000000-0000-0000-0000-000000000000';

export interface DemoOrgConfig {
  orgId: string;
  role: string;
  fakeUserId: string;
}

/**
 * Returns the demo org configuration from environment variables.
 * Falls back to empty strings if not set.
 */
export function getDemoOrgConfig(): DemoOrgConfig {
  return {
    orgId: process.env.DEMO_ORG_ID ?? '',
    role: 'treasurer',
    fakeUserId: DEMO_FAKE_USER_ID,
  };
}

/* ------------------------------------------------------------------ */
/*  Detection                                                          */
/* ------------------------------------------------------------------ */

/**
 * Returns true if the current request is in demo mode.
 * Reads the `x-demo-mode` header set by the middleware.
 */
export async function isDemoMode(): Promise<boolean> {
  const headersList = await headers();
  return headersList.get('x-demo-mode') === 'true';
}

/* ------------------------------------------------------------------ */
/*  Mutation guard                                                     */
/* ------------------------------------------------------------------ */

export class DemoModeError extends Error {
  constructor() {
    super('Demo mode is read-only');
    this.name = 'DemoModeError';
  }
}

/**
 * Call at the top of every mutation server action.
 * Throws DemoModeError if demo mode is active, preventing any writes.
 */
export async function assertWriteAllowed(): Promise<void> {
  if (await isDemoMode()) {
    throw new DemoModeError();
  }
}
