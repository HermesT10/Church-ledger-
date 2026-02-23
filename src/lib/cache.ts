/**
 * Lightweight in-memory TTL cache for report data.
 *
 * This avoids adding Redis or external dependencies for V1.
 * The cache lives in the Node.js process and is cleared on restart.
 *
 * For production at scale, consider replacing with Redis or
 * Next.js unstable_cache / data cache.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

const store = new Map<string, CacheEntry>();

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Get a cached value by key. Returns undefined if not found or expired.
 */
export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;

  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    return undefined;
  }

  return entry.data as T;
}

/**
 * Set a cached value with a TTL in milliseconds.
 */
export function setCached<T>(key: string, data: T, ttlMs: number): void {
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
    }
  }
}

/**
 * Invalidate all report caches for a given organisation.
 * Call this after any mutation that affects financial data.
 */
export function invalidateOrgReportCache(orgId: string): void {
  invalidatePrefix(`dashboard:${orgId}`);
  invalidatePrefix(`actuals:${orgId}`);
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
