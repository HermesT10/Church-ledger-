'use client';

import type { ReactNode } from 'react';
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  THEME_COOKIE_MAX_AGE_SECONDS,
  THEME_COOKIE_NAME,
  type ThemePreference,
} from '@/lib/theme-cookie';

type Theme = ThemePreference;
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

interface ThemeProviderProps {
  children: ReactNode;
  /** From `cookies()` in root layout; `undefined` if missing or legacy visit. */
  initialTheme?: Theme;
}

const STORAGE_KEY = 'theme';
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${encodeURIComponent(name)}=([^;]*)`)
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function setThemeCookieClient(theme: Theme) {
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:';
  document.cookie = [
    `${encodeURIComponent(THEME_COOKIE_NAME)}=${encodeURIComponent(theme)}`,
    `Path=/`,
    `Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}`,
    `SameSite=Lax`,
    secure ? `Secure` : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme;
}

function tryReadStoredPreference(): Theme | null {
  const storedTheme = window.localStorage.getItem(STORAGE_KEY);
  if (
    storedTheme === 'light' ||
    storedTheme === 'dark' ||
    storedTheme === 'system'
  ) {
    return storedTheme;
  }
  return null;
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') {
    return;
  }

  const resolvedTheme = resolveTheme(theme);
  const root = document.documentElement;
  root.classList.toggle('dark', resolvedTheme === 'dark');
  root.style.colorScheme = resolvedTheme;
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  const router = useRouter();
  const [theme, setThemeState] = useState<Theme>(() => initialTheme ?? 'system');

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(initialTheme ?? 'system'),
  );

  /** Sync DOM before paint whenever theme preference changes (covers `system` + migration). */
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        const nextResolved = resolveTheme('system');
        setResolvedTheme(nextResolved);
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  /** Migrate legacy visits: explicit localStorage value but no cookie yet → persist cookie + DOM (avoid router.refresh here: it can destabilise App Router hook order during hydration). */
  useEffect(() => {
    if (getCookieValue(THEME_COOKIE_NAME)) return;
    const stored = tryReadStoredPreference();
    if (stored == null) return;
    setThemeCookieClient(stored);
    setThemeState(stored);
    setResolvedTheme(resolveTheme(stored));
    applyTheme(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot migration
  }, []);

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
    const nextResolved = resolveTheme(nextTheme);
    setResolvedTheme(nextResolved);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    setThemeCookieClient(nextTheme);
    applyTheme(nextTheme);
    startTransition(() => {
      router.refresh();
    });
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider.');
  }

  return context;
}
