export type ShortcutAction =
  | 'prev'
  | 'next'
  | 'submit'
  | 'finish'
  | 'favorite'
  | 'flag'
  | 'card'
  | 'note'
  | 'ai'
  | 'edit';

export const SHORTCUT_ORDER: ShortcutAction[] = [
  'prev',
  'next',
  'submit',
  'finish',
  'favorite',
  'flag',
  'card',
  'note',
  'ai',
  'edit',
];

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  prev: '上一题',
  next: '下一题',
  submit: '提交本题',
  finish: '交卷',
  favorite: '收藏',
  flag: '标注',
  card: '答题卡',
  note: '笔记',
  ai: 'AI 讲解',
  edit: '编辑本题',
};

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  prev: 'arrowleft',
  next: 'arrowright',
  submit: 'enter',
  finish: 'ctrl+enter',
  favorite: 'q',
  flag: 'w',
  card: 'r',
  note: 't',
  ai: 'y',
  edit: 'u',
};

const STORAGE_KEY = 'shortcuts';

export function loadShortcuts(): Record<ShortcutAction, string> {
  const fallback = { ...DEFAULT_SHORTCUTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Record<ShortcutAction, string>>;
    for (const action of SHORTCUT_ORDER) {
      if (typeof parsed[action] === 'string' && parsed[action]) fallback[action] = parsed[action] as string;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function persistShortcuts(map: Record<ShortcutAction, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

const NAMED: Record<string, string> = {
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Win',
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  enter: 'Enter',
  escape: 'Esc',
  ' ': 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
};

export function keyLabel(spec: string): string {
  return spec
    .split('+')
    .map((part) => NAMED[part] ?? (part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(' + ');
}

export function eventKeySpec(event: KeyboardEvent): string {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return '';
  const key = event.key.toLowerCase();
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  if (event.metaKey) parts.push('meta');
  if (event.shiftKey && key.length > 1) parts.push('shift');
  parts.push(key);
  return parts.join('+');
}

export function actionForEvent(
  event: KeyboardEvent,
  map: Record<ShortcutAction, string>,
): ShortcutAction | null {
  const spec = eventKeySpec(event);
  if (!spec) return null;
  for (const action of SHORTCUT_ORDER) {
    if (map[action] === spec) return action;
  }
  return null;
}
