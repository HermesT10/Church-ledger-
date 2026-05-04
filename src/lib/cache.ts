import { revalidateTag, unstable_cache } from 'next/cache';

/**
 * Legacy in-memory TTL cache retained for tests and lightweight diagnostics.
 *
 * Production report reads now use Next.js data cache helpers exported from this
 * module so cache invalidation works across instances. The in-memory store
 * remains useful for unit tests that exercise cache semantics directly.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  expired: number;
  sets: number;
  invalidations: number;
  size?: number;
}

interface CachedQueryOptions<T> {
  keyParts: string[];
  tags: string[];
  revalidateSeconds: number;
  loader: () => Promise<T>;
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

const store = new Map<string, CacheEntry>();
const stats: CacheStats = {
  hits: 0,
  misses: 0,
  expired: 0,
  sets: 0,
  invalidations: 0,
};

const ORG_REPORT_TAG_PREFIX = 'reports:org';

export function getOrgReportCacheTag(orgId: string): string {
  return `${ORG_REPORT_TAG_PREFIX}:${orgId}`;
}

export function getReportScopeCacheTag(
  orgId: string,
  scope: 'dashboard' | 'dashboard-overview' | 'actuals',
): string {
  return `${getOrgReportCacheTag(orgId)}:${scope}`;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Get a cached value by key. Returns undefined if not found or expired.
 */
export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) {
    stats.misses += 1;
    return undefined;
  }

  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    stats.expired += 1;
    stats.misses += 1;
    return undefined;
  }

  stats.hits += 1;
  return entry.data as T;
}

/**
 * Set a cached value with a TTL in milliseconds.
 */
export function setCached<T>(key: string, data: T, ttlMs: number): void {
  stats.sets += 1;
  store.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Invalidate all cache entries whose keys start with the given prefix.
 */
export function invalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      stats.invalidations += 1;
    }
  }
}

/**
 * Invalidate all report caches for a given organisation.
 * Call this after any mutation that affects financial data.
 */
export function invalidateOrgReportCache(orgId: string): void {
  invalidatePrefix(`dashboard:${orgId}`);
  invalidatePrefix(`dashboard-overview:${orgId}`);
  invalidatePrefix(`actuals:${orgId}`);

  try {
    revalidateTag(getOrgReportCacheTag(orgId), 'max');
    revalidateTag(getReportScopeCacheTag(orgId, 'dashboard'), 'max');
    revalidateTag(getReportScopeCacheTag(orgId, 'dashboard-overview'), 'max');
    revalidateTag(getReportScopeCacheTag(orgId, 'actuals'), 'max');
  } catch {
    // Ignore when no Next.js revalidation context is active (e.g. unit tests).
  }
}

/**
 * Clear the entire cache. Useful for testing.
 */
export function clearCache(): void {
  store.clear();
}

/**
 * Get the current cache size. Useful for monitoring.
 */
export function cacheSize(): number {
  return store.size;
}

export function getCacheStats(): CacheStats {
  return { ...stats, size: store.size };
}

export function resetCacheStats(): void {
  stats.hits = 0;
  stats.misses = 0;
  stats.expired = 0;
  stats.sets = 0;
  stats.invalidations = 0;
}

export async function runCachedQuery<T>(options: CachedQueryOptions<T>): Promise<T> {
  try {
    return await unstable_cache(options.loader, options.keyParts, {
      revalidate: options.revalidateSeconds,
      tags: options.tags,
    })();
  } catch {
    return options.loader();
  }
}
