/** Pure formatting helpers — keep out of `'use server'` modules. */

export function formatLettingsPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
