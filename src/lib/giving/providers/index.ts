/* ------------------------------------------------------------------ */
/*  Provider registry                                                  */
/* ------------------------------------------------------------------ */

import type { DetectedColumns, NormalizedRow, GivingProvider } from '../types';
import * as gocardless from './gocardless';
import * as sumup from './sumup';
import * as izettle from './izettle';

export interface ProviderMapper {
  detectColumns: (headers: string[]) => DetectedColumns | null;
  mapRow: (raw: Record<string, string>, cols: DetectedColumns) => NormalizedRow | null;
}

const PROVIDERS: Record<GivingProvider, ProviderMapper> = {
  gocardless,
  sumup,
  izettle,
};

export function getProviderMapper(provider: GivingProvider): ProviderMapper {
  return PROVIDERS[provider];
}
