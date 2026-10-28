import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  aiImport,
  errorText,
  importBank,
  type AiImportSummary,
  type BankDto,
  type ImportProgress,
  type ImportSummary,
} from '../api';
import { ImportFormatHelp } from '../ImportFormatHelp';
import { MobileSheet } from '../MobileSheet';

interface Props {
  open: boolean;
  onClose: () => void;
  onNotice: (message: string) => void;
  onDone: () => void;
  bank?: BankDto;
  banks?: BankDto[];
}

const PHASE_LABEL: Record<string, string> = {
  prepare: '准备文件',
  scan: '扫描文件',
  convert: 'AI 转换',
  parse: '解析题库',
  import: '写入题库',
  done: '完成',
};

const isAndroid = () => /android/i.test(navigator.userAgent);

export function ImportSheet({ open: isOpen, onClose, onNotice, onDone, bank, banks }: Props) {
  const [path, setPath] = useState('');
  const [label, setLabel] = useState('');
  const [targetId, setTargetId] = useState('current');
  const [newTitle, setNewTitle] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [aiResult, setAiResult] = useState<AiImportSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const unlistenAi = listen<ImportProgress>('ai-import-progress', (event) => {
      setProgress(event.payload);
    });
    const unlistenImport = listen<ImportProgress>('import-progress', (event) => {
      setProgress(event.payload);
    });
    return () => {
      void unlistenAi.then((fn) => fn());
      void unlistenImport.then((fn) => fn());
    };
  }, [isOpen]);

  const pick = async (kind: 'folder' | 'zip') => {
    try {
      if (isAndroid()) {
        const uri = await invoke<string>('saf_pick', { kind });
        setPath(uri);
        setLabel(kind === 'folder' ? '已选择文件夹' : '已选择 zip');
        setSummary(null);
        setAiResult(null);
        setError('');
        return;
      }
      const value = await open(
        kind === 'folder'
          ? { directory: true, multiple: false }
          : { directory: false, multiple: false, filters: [{ name: '题库压缩包', extensions: ['zip', 'md'] }] },
      );
      if (!value || Array.isArray(value)) return;
      setPath(value);
      setLabel(value.split(/[\\/]/).pop() || value);
      setSummary(null);
      setAiResult(null);
      setError('');
    } catch (reason) {
      onNotice(`选择失败：${errorText(reason)}`);
    }
  };

  const run = async () => {
    if (!path) return;
    setBusy(true);
    setError('');
    setSummary(null);
    setAiResult(null);
    setProgress(null);
    const target =
      !bank || targetId === 'new'
        ? { bankId: null, title: newTitle.trim() || null }
        : { bankId: targetId === 'current' ? bank.id : targetId, title: null };
    try {
      let target_path = path;
      if (isAndroid()) {
        target_path = await invoke<string>('saf_materialize', { uri: path, maxDepth: 6 });
      }
      if (useAi) {
        const result = await aiImport(target_path, true, target);
        setAiResult(result);
        setSummary(result.summary);
        onNotice(result.failed > 0 ? `导入完成，${result.failed} 个文件转换失败` : 'AI 转换导入完成');
      } else {
        const value = await importBank(target_path, true, target);
        setSummary(value);
        onNotice('题库导入完成');
      }
      onDone();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const close = () => {
    if (busy) return;
    setPath('');
    setLabel('');
    setTargetId('current');
    setNewTitle('');
    setSummary(null);
    setAiResult(null);
    setError('');
    setProgress(null);
    onClose();
  };

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current * 100) / progress.total))
      : 12;

  return (
    <MobileSheet open={isOpen} onClose={close} closable={!busy}>
      <div className="grabber" />
      <h3 className="text-[14px] font-semibold">导入题库</h3>
      <p className="text-[10px] text-[var(--muted)] mt-1">选择题库文件夹或 zip，图片自动复制并去重。</p>

      {!summary ? (
        <>
          <div className="mt-4 rounded-2xl border border-dashed p-6 text-center" style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }}>
            <div className="text-[12px]">{label || '选择题库文件夹或 zip'}</div>
            <div className="flex gap-2 mt-3">
              <button className="btn btn-ghost btn-sm flex-1" disabled={busy} onClick={() => void pick('folder')}>文件夹</button>
              <button className="btn btn-ghost btn-sm flex-1" disabled={busy} onClick={() => void pick('zip')}>zip / md</button>
            </div>
            <div className="text-[9px] text-[var(--muted)] mt-3">
              {isAndroid() ? '通过系统文件选择器授权，复制到应用私有目录' : '选择本地 Markdown 题库根目录'}
            </div>
          </div>

          {bank ? (
            <div className="mt-3 rounded-xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }}>
              <div className="text-[9.5px] text-[var(--muted)] mb-1">导入到</div>
              <select
                className="w-full rounded-lg border px-2 py-2 text-[11px] outline-none"
                style={{ borderColor: 'var(--line)', background: 'var(--card)', color: 'var(--ink)' }}
                value={targetId}
                disabled={busy}
                onChange={(event) => setTargetId(event.target.value)}
              >
                <option value="current">当前题库 · {bank.title}</option>
                {(banks ?? [])
                  .filter((item) => item.id !== bank.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                <option value="new">新建题库…</option>
              </select>
              {targetId === 'new' ? (
                <input
                  className="mt-2 w-full rounded-lg border px-3 py-2 text-[11px] outline-none"
                  style={{ borderColor: 'var(--line)', background: 'var(--card)', color: 'var(--ink)' }}
                  placeholder="题库名称（留空自动命名）"
                  value={newTitle}
                  maxLength={40}
                  disabled={busy}
                  onChange={(event) => setNewTitle(event.target.value)}
                />
              ) : null}
              <div className="text-[9px] text-[var(--muted)] mt-1.5">已存在的试卷会跳过，不会覆盖</div>
            </div>
          ) : null}

          <label className="flex items-center gap-2 mt-3 text-[11px] text-[var(--ink-2)]">
            <input type="checkbox" checked={useAi} disabled={busy} onChange={(event) => setUseAi(event.target.checked)} />
            AI 智能转换（需先在设置中配置接口）
          </label>

          {busy ? (
            <div className="mt-4">
              <div className="flex items-center gap-2 text-[10.5px]">
                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                <span className="truncate">{progress?.message || '准备中…'}</span>
              </div>
              <div className="progress mt-2" style={{ height: 7 }}>
                <i style={{ width: `${percent}%` }} />
              </div>
              <div className="text-[9.5px] text-[var(--muted)] mt-2">
                {PHASE_LABEL[progress?.phase ?? ''] ?? '处理中'}
                {progress && progress.total > 0 ? ` · ${progress.current}/${progress.total}` : ''}
                {' · '}导入完成前不可关闭
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl p-4 text-[11.5px] leading-6" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>
              {error}
            </div>
          ) : null}

          <ImportFormatHelp />

          <button className="btn btn-primary btn-block mt-3" disabled={!path || busy} onClick={() => void run()}>
            {busy ? '正在导入…' : useAi ? 'AI 转换并导入' : '开始导入'}
          </button>
        </>
      ) : (
        <>
          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="chip-accent">导入完成</span>
              <span className="text-[10px] text-[var(--muted)]">{summary.title}</span>
              {summary.review > 0 ? <span className="chip" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>{summary.review} 题待校对</span> : null}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
              <div><div className="text-[9px] text-[var(--muted)]">题目</div><div className="text-[14px] font-semibold">{summary.questions.toLocaleString('zh-CN')}</div></div>
              <div><div className="text-[9px] text-[var(--muted)]">试卷</div><div className="text-[14px] font-semibold">{summary.papers.toLocaleString('zh-CN')}</div></div>
              <div><div className="text-[9px] text-[var(--muted)]">图片</div><div className="text-[14px] font-semibold">{summary.images.toLocaleString('zh-CN')}</div></div>
              <div><div className="text-[9px] text-[var(--muted)]">含图题</div><div className="text-[14px] font-semibold">{summary.imageQuestions.toLocaleString('zh-CN')}</div></div>
            </div>
          </div>

          {aiResult ? (
            <div className="mt-3 rounded-xl border border-[var(--line)] p-3.5">
              <div className="flex items-center gap-2 flex-wrap text-[10.5px]">
                <span className="font-semibold text-[11px]">AI 转换报告</span>
                <span className="chip">转换 {aiResult.converted}</span>
                <span className="chip">已合规 {aiResult.valid}</span>
                {aiResult.failed > 0 ? (
                  <span className="chip" style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}>失败 {aiResult.failed}</span>
                ) : null}
              </div>
              <div className="max-h-52 overflow-y-auto scroll mt-2 space-y-2 text-[10px] leading-5">
                {aiResult.files
                  .filter((item) => item.status !== 'skipped')
                  .map((item, index) => (
                    <div key={`${item.file}-${index}`} className="border-b border-[var(--line)] pb-1.5 last:border-0">
                      <div className="break-all">
                        <span style={{ color: item.status === 'failed' ? 'var(--bad)' : 'var(--accent-ink)' }}>
                          [{item.status === 'failed' ? '失败' : item.status === 'valid' ? '已合规' : 'AI 转换'}]
                        </span>{' '}
                        {item.file} · {item.questions} 题
                        {item.expected > 0 ? ` / 原文约 ${item.expected} 题` : ''}
                      </div>
                      {item.error ? <div style={{ color: 'var(--bad)' }}>{item.error}</div> : null}
                      {(item.flags ?? []).map((flag, flagIndex) => (
                        <div key={flagIndex} style={{ color: 'var(--warn)' }}>{flag}</div>
                      ))}
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          <button className="btn btn-primary btn-block mt-3" onClick={close}>完成</button>
        </>
      )}
      <div className="h-4" />
    </MobileSheet>
  );
}
