import { useEffect, useState } from 'react';

export type Accent = 'blue' | 'orange' | 'teal' | 'pink' | 'purple';
export type QSize = 's' | 'm' | 'l';

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const value = localStorage.getItem(key) as T | null;
  return value && allowed.includes(value) ? value : fallback;
}

export function useAppearance() {
  const [accent, setAccent] = useState<Accent>(() => stored('accent', ['blue', 'orange', 'teal', 'pink', 'purple'], 'blue'));
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('theme') === 'dark');
  const [qsize, setQSize] = useState<QSize>(() => stored('qsize', ['s', 'm', 'l'], 'm'));

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    localStorage.setItem('accent', accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    document.documentElement.dataset.qsize = qsize;
    localStorage.setItem('qsize', qsize);
  }, [qsize]);

  return { accent, setAccent, dark, setDark, qsize, setQSize };
}

export type Appearance = ReturnType<typeof useAppearance>;
