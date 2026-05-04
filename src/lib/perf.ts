/**
 * Lightweight performance monitoring utilities.
 *
 * Wraps async operations with timing and logs slow queries.
 */

import { logger, serializeError } from '@/lib/logger';

const SLOW_QUERY_THRESHOLD_MS = 300;

/**
 * Execute an async function and log a warning if it exceeds the threshold.
 *
 * @param label  A descriptive label for the operation (shown in logs).
 * @param fn     The async function to execute.
 * @returns      The result of the async function.
 */
export async function timedQuery<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const elapsed = performance.now() - start;

    if (elapsed > SLOW_QUERY_THRESHOLD_MS) {
      logger.warn(
        {
          label,
          elapsedMs: Number(elapsed.toFixed(0)),
          thresholdMs: SLOW_QUERY_THRESHOLD_MS,
        },
        'Slow query detected',
      );
    }

    return result;
  } catch (error) {
    const elapsed = performance.now() - start;
    logger.error(
      {
        label,
        elapsedMs: Number(elapsed.toFixed(0)),
        error: serializeError(error),
      },
      'Query failed',
    );
    throw error;
  }
}

/**
 * Measure the execution time of an async function and return both the result
 * and the elapsed time. Useful for benchmarks.
 */
export async function measureTime<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; elapsedMs: number }> {
  const start = performance.now();
  const result = await fn();
  const elapsedMs = performance.now() - start;
  return { result, elapsedMs };
}
