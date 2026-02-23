/* Demo data types (shared, not a server action file) */

export interface DemoBatchInfo {
  totalDemoRecords: number;
  counts: Record<string, number>;
}
