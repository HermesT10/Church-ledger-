/** UUID v4 / nil UUID pattern (Postgres accepts lowercase hex). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function emptyStringToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const t = String(value).trim();
  return t.length > 0 ? t : null;
}

/**
 * Optional FK: blank, undefined → null; non-blank must be a valid UUID or returns error message.
 */
export function normaliseOptionalUuid(
  value: string | null | undefined,
  fieldLabel: string,
): { ok: true; uuid: string | null } | { ok: false; error: string } {
  const raw = emptyStringToNull(value);
  if (raw === null) return { ok: true, uuid: null };
  if (!UUID_RE.test(raw)) {
    return { ok: false, error: `${fieldLabel} is not a valid id.` };
  }
  return { ok: true, uuid: raw.toLowerCase() };
}

/**
 * Required FK: must be present and a valid UUID.
 */
export function parseRequiredUuid(
  value: string | null | undefined,
  fieldLabel: string,
): { ok: true; uuid: string } | { ok: false; error: string } {
  const raw = emptyStringToNull(value);
  if (raw === null) {
    return { ok: false, error: `${fieldLabel} is required.` };
  }
  if (!UUID_RE.test(raw)) {
    return { ok: false, error: `${fieldLabel} is not a valid id.` };
  }
  return { ok: true, uuid: raw.toLowerCase() };
}
