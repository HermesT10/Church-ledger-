/**
 * Return the current server-time year and 1-based month index.
 *
 * monthIndex: 1 = January, 12 = December.
 */
export function getAsOfPeriod(): { year: number; monthIndex: number } {
  const now = new Date();
  return { year: now.getFullYear(), monthIndex: now.getMonth() + 1 };
}
