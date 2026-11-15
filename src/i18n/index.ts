import { useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { translate, type Lang, type Vars } from './translate';

const STORAGE_KEY = 'lang';
const listeners = new Set<() => void>();

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {}
  const preferred = navigator.languages?.[0] || navigator.language || '';
  return preferred.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let current: Lang = detectLang();

function applyDocument() {
  document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
  const title = current === 'zh' ? '刷题盒子 SHUATIBOX' : 'SHUATIBOX';
  document.title = title;
  getCurrentWindow().setTitle(title).catch(() => undefined);
}

export function initLang(): Promise<unknown> {
  applyDocument();
  return invoke('set_language', { lang: current }).catch(() => undefined);
}

export function getLang(): Lang {
  return current;
}

export function setLang(next: Lang) {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {}
  applyDocument();
  invoke('set_language', { lang: next }).catch(() => undefined);
  listeners.forEach((listener) => listener());
}

export function subscribeLang(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, getLang);
}

export function t(key: string, vars?: Vars): string {
  return translate(current, key, vars);
}

export function fmtNumber(value: number): string {
  return value.toLocaleString(current === 'zh' ? 'zh-CN' : 'en-US');
}

export function fmtDate(value: Date | string, options: Intl.DateTimeFormatOptions): string {
  const date = typeof value === 'string' ? new Date(value.replace(' ', 'T')) : value;
  return new Intl.DateTimeFormat(current === 'zh' ? 'zh-CN' : 'en-US', options).format(date);
}

export function plural(count: number): string {
  return count === 1 ? '' : 's';
}

export type { Lang };
