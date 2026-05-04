/**
 * Persisted preference for SSR (no `<script>` in layout — avoids React 19 dev warnings).
 * Client sets `document.cookie`; root layout reads `cookies()` to set `.dark` on `<html>` when applicable.
 */
export const THEME_COOKIE_NAME = 'churchledger.theme';
export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type ThemePreference = 'light' | 'dark' | 'system';

export function parseThemeCookie(
  value: string | undefined | null
): ThemePreference | undefined {
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  return undefined;
}

/** Only explicit `dark` can be inferred on the server (`system`/missing need client resolution). */
export function htmlClassForThemeCookie(theme: ThemePreference | undefined): string {
  return theme === 'dark' ? 'dark' : '';
}
