import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppEnv, getSupabaseBrowserEnv } from '@/lib/env';

describe('environment helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers NEXT_PUBLIC_APP_ENV over NODE_ENV', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
    vi.stubEnv('NODE_ENV', 'production');

    expect(getAppEnv()).toBe('staging');
  });

  it('defaults to development for unknown values', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'qa');
    vi.stubEnv('NODE_ENV', '');

    expect(getAppEnv()).toBe('development');
  });

  it('returns the browser Supabase config when present', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');

    expect(getSupabaseBrowserEnv()).toEqual({
      url: 'https://example.supabase.co',
      anonKey: 'anon-key',
    });
  });

  it('falls back to publishable key when anon JWT is absent', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');

    expect(getSupabaseBrowserEnv()).toEqual({
      url: 'https://example.supabase.co',
      anonKey: 'sb_publishable_test',
    });
  });

  it('throws a clear error when browser Supabase env is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    expect(() => getSupabaseBrowserEnv()).toThrow(
      /Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });
});
