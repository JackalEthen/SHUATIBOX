import { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

export type Accent = 'blue' | 'orange' | 'teal' | 'pink' | 'purple';
export type FontScale = 's' | 'm' | 'l' | 'xl';

const FONT_VARS: Record<string, string> = {
  system: 'var(--font-sans)',
  hei: 'var(--font-hei)',
  serif: 'var(--font-serif)',
};

function storedFont(key: string): string {
  const value = localStorage.getItem(key);
  return value && (FONT_VARS[value] || value.startsWith('custom:')) ? value : 'system';
}

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
  const [appFont, setAppFont] = useState<string>(() => storedFont('font-app'));
  const [practiceFont, setPracticeFont] = useState<string>(() => storedFont('font-practice'));

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

  useEffect(() => {
    const root = document.documentElement;
    localStorage.setItem('font-app', appFont);
    localStorage.setItem('font-practice', practiceFont);
    const id = 'shuatibox-custom-fonts';
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      document.head.appendChild(style);
    }
    const faces: string[] = [];
    const font = (value: string, role: 'App' | 'Practice', fallback: string) => {
      if (value.startsWith('custom:')) {
        const url = convertFileSrc(value.slice(7)).replace(/"/g, '%22');
        faces.push(`@font-face{font-family:"ShuatiCustom${role}";src:url("${url}");font-display:swap}`);
        return `"ShuatiCustom${role}", ${fallback}`;
      }
      return FONT_VARS[value] ?? fallback;
    };
    root.style.setProperty('--font-ui', font(appFont, 'App', 'var(--font-sans)'));
    root.style.setProperty('--font-question', font(practiceFont, 'Practice', 'var(--font-sans)'));
    style.textContent = faces.join('');
  }, [appFont, practiceFont]);

  return {
    accent,
    setAccent,
    dark,
    setDark,
    fontScale,
    setFontScale,
    appFont,
    setAppFont,
    practiceFont,
    setPracticeFont,
  };
}

export type Appearance = ReturnType<typeof useAppearance>;
