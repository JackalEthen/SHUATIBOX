import { useEffect, useRef, useState } from 'react';
import Viewer from '@toast-ui/editor/viewer';
import '@toast-ui/editor/dist/toastui-editor.css';
import '@toast-ui/editor/dist/toastui-editor-viewer.css';
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { t } from './i18n';
import { errorText, readTextFile, writeTextFile } from './api';
import { Icon } from './icons';

interface Props {
  onNotice: (message: string) => void;
  mobile?: boolean;
}

const isAndroid = () => /android/i.test(navigator.userAgent);

export function MdReader({ onNotice, mobile = false }: Props) {
  const viewerBoxRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [path, setPath] = useState('');
  const [doc, setDoc] = useState('');
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<'read' | 'code'>('read');
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  const [busy, setBusy] = useState(false);
  const readOnly = isAndroid() || mobile;

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (mode !== 'read' || !viewerBoxRef.current) return;
    const viewer = new Viewer({
      el: viewerBoxRef.current,
      initialValue: doc,
      usageStatistics: false,
    });
    return () => viewer.destroy();
  }, [mode, doc, dark]);

  const confirmDiscard = () => !dirty || window.confirm(t("当前文件有未保存修改，继续将丢失修改。"));

  const pick = async () => {
    if (!confirmDiscard()) return;
    try {
      let file: string | null = null;
      if (readOnly) {
        const uri = await invoke<string>('saf_pick', { kind: 'md' });
        file = await invoke<string>('saf_materialize', { uri, maxDepth: 1, ext: 'md' });
      } else {
        const value = await open({
          multiple: false,
          directory: false,
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
        });
        if (!value || Array.isArray(value)) return;
        file = value;
      }
      if (!file) return;
      const text = await readTextFile(file);
      setDoc(text);
      setPath(file);
      setDirty(false);
    } catch (error) {
      onNotice(t("打开失败：{p0}", { p0: errorText(error) }));
    }
  };

  const save = async () => {
    if (!path || readOnly) return;
    setBusy(true);
    try {
      await writeTextFile(path, doc);
      setDirty(false);
      onNotice(t("已保存"));
    } catch (error) {
      onNotice(t("保存失败：{p0}", { p0: errorText(error) }));
    } finally {
      setBusy(false);
    }
  };

  const insert = (before: string, after = '') => {
    const area = areaRef.current;
    if (!area) return;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const next = doc.slice(0, start) + before + doc.slice(start, end) + after + doc.slice(end);
    setDoc(next);
    setDirty(true);
    requestAnimationFrame(() => {
      area.focus();
      area.selectionStart = start + before.length;
      area.selectionEnd = end + before.length;
    });
  };

  const name = path ? path.split(/[\\/]/).pop() : '';
  const lineCount = doc.split('\n').length;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-2 pb-3">
        <button className="btn btn-ghost btn-sm" onClick={() => void pick()}>
          <Icon name="library" className="w-4 h-4" />
          {t("打开")}
        </button>
        {readOnly ? null : (
          <button className="btn btn-primary btn-sm" onClick={() => void save()} disabled={!path || !dirty || busy}>
            {t("保存")}
          </button>
        )}
        <div className="min-w-0 flex-1 truncate text-[11px] text-[var(--muted)]">
          {name ? (
            <span title={path}>
              {name}
              {dirty ? ' •' : ''}
            </span>
          ) : (
            t("选择一个 Markdown 文件开始阅读或编辑")
          )}
        </div>
        {readOnly ? (
          <span className="chip">{t("只读")}</span>
        ) : (
          <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] p-0.5">
            <button
              className={`btn btn-sm ${mode === 'read' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode('read')}
            >
              {t("阅读视图")}
            </button>
            <button
              className={`btn btn-sm ${mode === 'code' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode('code')}
            >
              {t("代码视图")}
            </button>
          </div>
        )}
      </div>
      {readOnly ? (
        <div className="text-[10.5px] text-[var(--muted)] pb-2">
          {t("Android 暂不支持写回原文件，可预览 Markdown 内容；图片等外部资源不会加载。")}
        </div>
      ) : null}
      {mode === 'read' || readOnly ? (
        <div className="reader-scroll flex-1 min-h-0 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--card)] px-6 py-5">
          <div className={`${dark ? 'toastui-editor-dark' : ''}`}>
            <div ref={viewerBoxRef} />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card)]">
          <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-[var(--line)]">
            {[
              ['H', t("标题"), '## ', ''],
              ['B', t("粗体"), '**', '**'],
              ['I', t("斜体"), '*', '*'],
              ['•', t("列表"), '- ', ''],
              ['❝', t("引用"), '> ', ''],
              ['</>', t("代码"), '`', '`'],
              ['🔗', t("链接"), '[', '](url)'],
            ].map(([symbol, label, before, after]) => (
              <button
                key={label}
                className="min-w-8 h-7 px-1.5 rounded-md text-[12px] font-medium text-[var(--ink-2)] hover:bg-[var(--accent-soft)] transition"
                onClick={() => insert(before, after)}
                title={label}
                aria-label={label}
              >
                {symbol}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 flex overflow-hidden">
            <div
              ref={gutterRef}
              className="shrink-0 overflow-hidden select-none py-3 pl-3 pr-2 text-right font-mono text-[12.5px] leading-[21px] text-[var(--muted)]"
              aria-hidden="true"
            >
              {Array.from({ length: lineCount }, (_, line) => (
                <div key={line}>{line + 1}</div>
              ))}
            </div>
            <textarea
              ref={areaRef}
              className="code-area flex-1 h-full resize-none bg-transparent py-3 pr-4 text-[12.5px] leading-[21px] font-mono outline-none"
              value={doc}
              spellCheck={false}
              onChange={(event) => {
                setDoc(event.target.value);
                setDirty(true);
              }}
              onScroll={(event) => {
                if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
              }}
              placeholder={t("选择一个 Markdown 文件开始阅读或编辑")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
