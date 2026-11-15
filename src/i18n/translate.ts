import { en } from './en.ts';

export type Lang = 'zh' | 'en';
export type Vars = Record<string, string | number | undefined>;

export function translate(lang: Lang, key: string, vars?: Vars): string {
  const template = lang === 'en' ? (en[key] ?? key) : key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] === undefined ? match : String(vars[name]),
  );
}
