'use client';

import { useTheme } from '@/components/theme-provider';
import { Sun, Moon, Monitor } from 'lucide-react';

export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const activeTheme = theme ?? resolvedTheme;

  if (!activeTheme) return null;

  const options = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ] as const;

  if (collapsed) {
    const next =
      activeTheme === 'light' ? 'dark' : activeTheme === 'dark' ? 'system' : 'light';
    const Icon =
      activeTheme === 'dark' ? Moon : activeTheme === 'light' ? Sun : Monitor;
    return (
      <button
        onClick={() => setTheme(next)}
        title={`Theme: ${activeTheme}`}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
      >
        <Icon size={16} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-lg bg-sidebar-accent/30 p-1">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={label}
          className={`rounded-md p-1.5 transition-colors ${
            activeTheme === value
              ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
              : 'text-sidebar-foreground/50 hover:text-sidebar-foreground'
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
