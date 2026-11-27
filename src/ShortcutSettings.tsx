import { useEffect, useState } from 'react';
import { t } from './i18n';
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  SHORTCUT_ORDER,
  eventKeySpec,
  keyLabel,
  loadShortcuts,
  persistShortcuts,
  type ShortcutAction,
} from './shortcuts';

export function ShortcutSettings() {
  const [map, setMap] = useState(loadShortcuts);
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setCapturing(null);
        return;
      }
      const spec = eventKeySpec(event);
      if (!spec) return;
      const next = { ...map, [capturing]: spec };
      setMap(next);
      persistShortcuts(next);
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, map]);

  const reset = () => {
    const next = { ...DEFAULT_SHORTCUTS };
    setMap(next);
    persistShortcuts(next);
  };

  return (
    <div className="card mt-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[13.5px] font-semibold">{t("快捷键")}</h2>
        <button className="btn btn-ghost btn-sm" onClick={reset}>
          {t("恢复默认")}
        </button>
      </div>
      <div className="text-[10.5px] text-[var(--muted)] mt-1">{t("做题页快捷键，点击右侧按键后按下新键；Esc 取消。")}</div>
      <div className="mt-3 divide-y divide-[var(--line)]">
        {SHORTCUT_ORDER.map((action) => {
          const conflict = SHORTCUT_ORDER.some((other) => other !== action && map[other] === map[action]);
          return (
            <div key={action} className="flex items-center gap-3 py-2">
              <span className="text-[12px] flex-1">{t(SHORTCUT_LABELS[action])}</span>
              {conflict ? (
                <span className="text-[10px] text-[var(--bad)]">{t("重复")}</span>
              ) : null}
              <button
                className={`chip font-mono ${capturing === action ? 'active' : ''}`}
                onClick={() => setCapturing(capturing === action ? null : action)}
                style={conflict ? { color: 'var(--bad)', borderColor: 'var(--bad)' } : undefined}
              >
                {capturing === action ? t("按下新键…") : keyLabel(map[action])}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
