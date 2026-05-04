import { describe, expect, it, vi, afterEach } from 'vitest';
import { getPlatformAdminEmails, isPlatformAdminEmail } from '@/lib/platform-admin';

describe('platform admin allowlist', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses comma-separated allowlisted emails', () => {
    vi.stubEnv('PLATFORM_ADMIN_EMAILS', 'ops@example.com, finance@example.com ');
    expect(getPlatformAdminEmails()).toEqual(['ops@example.com', 'finance@example.com']);
  });

  it('matches emails case-insensitively', () => {
    vi.stubEnv('PLATFORM_ADMIN_EMAILS', 'ops@example.com');
    expect(isPlatformAdminEmail('OPS@example.com')).toBe(true);
    expect(isPlatformAdminEmail('user@example.com')).toBe(false);
  });
});
