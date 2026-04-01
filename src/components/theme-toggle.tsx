'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const options = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ] as const;

  if (collapsed) {
    const next =
      theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
    return (
      <button
        onClick={() => setTheme(next)}
        title={`Theme: ${theme}`}
        className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sidebar-border bg-white/80 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        <Icon size={16} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-2xl border border-sidebar-border bg-white/76 p-1 shadow-sm">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={label}
          className={`rounded-xl p-1.5 transition-colors ${
            theme === value
              ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
              : 'text-sidebar-foreground/50 hover:bg-sidebar-accent/65 hover:text-sidebar-foreground'
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
