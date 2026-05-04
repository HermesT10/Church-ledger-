export type UnreconcileBankTransactionResult =
  | { ok: true; correctionId: string; reversalJournalId: string | null }
  | { ok: false; error: string };
