import { useEffect, useState } from 'react';

export type Accent = 'blue' | 'orange' | 'teal' | 'pink' | 'purple';
export type FontScale = 's' | 'm' | 'l' | 'xl';

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const value = localStorage.getItem(key) as T | null;
  return value && allowed.includes(value) ? value : fallback;
}

export function useAppearance() {
  const [accent, setAccent] = useState<Accent>(() => stored('accent', ['blue', 'orange', 'teal', 'pink', 'purple'], 'blue'));
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');
  const [fontScale, setFontScale] = useState<FontScale>(() => {
    const legacy = localStorage.getItem('qsize');
    const mapped = legacy === 's' ? 's' : legacy === 'l' ? 'l' : 'm';
    return stored('fontscale', ['s', 'm', 'l', 'xl'], mapped);
  });

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    localStorage.setItem('accent', accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    document.documentElement.dataset.fontscale = fontScale;
    localStorage.setItem('fontscale', fontScale);
  }, [fontScale]);

  return { accent, setAccent, dark, setDark, fontScale, setFontScale };
}

export type Appearance = ReturnType<typeof useAppearance>;
