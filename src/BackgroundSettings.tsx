import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { t } from './i18n';
import { errorText, savePracticeBgFile } from './api';
import { backgroundImageUrl, loadPracticeBg, persistPracticeBg, type PracticeBg } from './practiceBg';

interface Props {
  onNotice: (message: string) => void;
}

const PRESETS = [
  '#F6F3EC',
  '#F3E7D3',
  '#EFE3C8',
  '#E9E4DC',
  '#D8D2C6',
  '#E8EDE4',
  '#DDE9E6',
  '#C9D6CF',
  '#E3E7F0',
  '#EDE4EE',
  '#F5E2DE',
  '#EAD9C0',
];

export function BackgroundSettings({ onNotice }: Props) {
  const [bg, setBg] = useState<PracticeBg>(loadPracticeBg);
  const [builtins, setBuiltins] = useState<string[]>([]);

  useEffect(() => {
    const wanted = /android/i.test(navigator.userAgent) ? /\.(jpe?g)$/i : /\.png$/i;
    fetch('/background/index.json')
      .then((response) => (response.ok ? response.json() : []))
      .then((value) => setBuiltins(Array.isArray(value) ? value.filter((name: string) => wanted.test(name)) : []))
      .catch(() => setBuiltins([]));
  }, []);

  const apply = (next: PracticeBg) => {
    setBg(next);
    persistPracticeBg(next);
  };

  const pick = async () => {
    try {
      let source: string | null = null;
      if (/android/i.test(navigator.userAgent)) {
        const uri = await invoke<string>('saf_pick', { kind: 'image' });
        source = await invoke<string>('saf_materialize', { uri, maxDepth: 1 });
      } else {
        const value = await open({
          multiple: false,
          directory: false,
          filters: [{ name: t("图片"), extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
        });
        if (!value || Array.isArray(value)) return;
        source = value;
      }
      if (!source) return;
      const saved = await savePracticeBgFile(source);
      apply({ ...bg, image: saved });
      onNotice(t("背景图片已更新"));
    } catch (error) {
      onNotice(t("设置背景失败：{p0}", { p0: errorText(error) }));
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-[var(--line)]">
      <div className="text-[11.5px] font-medium">{t("做题页背景")}</div>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {PRESETS.map((color) => {
          const active = (bg.color || '').toLowerCase() === color.toLowerCase();
          return (
            <button
              key={color}
              className={`w-7 h-7 rounded-full border transition ${active ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]' : 'border-[var(--line)]'}`}
              style={{ background: color }}
              onClick={() => apply({ ...bg, color })}
              aria-label={color}
            />
          );
        })}
        <label
          className="relative inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-[var(--line)] bg-[var(--card)] text-[11.5px] cursor-pointer hover:border-[var(--accent)] transition"
          title={t("自定义")}
        >
          <span
            className="w-3.5 h-3.5 rounded-full border border-[var(--line)]"
            style={{ background: bg.color || '#f6f3ec' }}
          />
          {t("自定义")}
          <input
            type="color"
            value={bg.color || '#f6f3ec'}
            onChange={(event) => apply({ ...bg, color: event.target.value })}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label={t("背景颜色")}
          />
        </label>
        <button className="btn btn-ghost btn-sm" onClick={() => apply({ ...bg, color: '' })} disabled={!bg.color}>
          {t("清除颜色")}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => void pick()}>
          {t("导入图片")}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => apply({ color: '', image: '' })} disabled={!bg.color && !bg.image}>
          {t("清除背景")}
        </button>
      </div>
      {builtins.length ? (
        <>
          <div className="text-[11px] text-[var(--muted)] mt-3">{t("内置图片")}</div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-1.5">
            {builtins.map((name) => {
              const value = `builtin:${name}`;
              const active = bg.image === value;
              return (
                <button
                  key={name}
                  className={`relative rounded-lg overflow-hidden border ${active ? 'border-[var(--accent)]' : 'border-[var(--line)]'}`}
                  onClick={() => apply({ ...bg, image: value })}
                  aria-label={name}
                >
                  <img src={backgroundImageUrl(value)} alt={name} className="w-full aspect-video object-cover" />
                  {active ? (
                    <span className="absolute inset-0 grid place-items-center bg-[rgba(0,0,0,.28)] text-white text-[11px]">
                      {t("使用中")}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
      <div className="text-[10px] text-[var(--muted)] mt-2">
        {t("纯色或图片会应用到做题页，图片自动压暗以保证文字可读。")}
      </div>
    </div>
  );
}
