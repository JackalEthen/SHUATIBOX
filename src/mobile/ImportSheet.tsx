import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { errorText, importBank, type ImportSummary } from '../api';
import { MobileSheet } from '../MobileSheet';

interface Props {
  open: boolean;
  onClose: () => void;
  onNotice: (message: string) => void;
  onDone: () => void;
}

interface Progress {
  phase: string;
  current: number;
  total: number;
  message: string;
}

const isAndroid = () => /android/i.test(navigator.userAgent);

export function ImportSheet({ open: isOpen, onClose, onNotice, onDone }: Props) {
  const [path, setPath] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const unlisten = listen<Progress>('import-progress', (event) => {
      setStep(event.payload.message);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [isOpen]);

  const pick = async (kind: 'folder' | 'zip') => {
    try {
      if (isAndroid()) {
        const uri = await invoke<string>('saf_pick', { kind });
        setPath(uri);
        setLabel(kind === 'folder' ? '已选择文件夹' : '已选择 zip');
        setSummary(null);
        setError('');
        return;
      }
      const value = await open(
        kind === 'folder'
          ? { directory: true, multiple: false }
          : { directory: false, multiple: false, filters: [{ name: '题库压缩包', extensions: ['zip'] }] },
      );
      if (!value || Array.isArray(value)) return;
      setPath(value);
      setLabel(value.split(/[\\/]/).pop() || value);
      setSummary(null);
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
    setStep(isAndroid() ? '复制文件到应用目录…' : '读取文件…');
    try {
      let target = path;
      if (isAndroid()) {
        target = await invoke<string>('saf_materialize', { uri: path, maxDepth: 6 });
        setStep('解析题库…');
      }
      const value = await importBank(target, true);
      setSummary(value);
      onNotice('题库导入完成');
      onDone();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    setPath('');
    setLabel('');
    setSummary(null);
    setError('');
    setStep('');
    onClose();
  };

  return (
    <MobileSheet open={isOpen} onClose={close}>
      <div className="grabber" />
      <h3 className="text-[14px] font-semibold">导入题库</h3>
      <p className="text-[10px] text-[var(--muted)] mt-1">选择题库文件夹或 zip，图片自动复制并去重。</p>

      {!summary ? (
        <>
          <div className="mt-4 rounded-2xl border border-dashed p-6 text-center" style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }}>
            <div className="text-[12px]">{label || '选择题库文件夹或 zip'}</div>
            <div className="flex gap-2 mt-3">
              <button className="btn btn-ghost btn-sm flex-1" disabled={busy} onClick={() => void pick('folder')}>文件夹</button>
              <button className="btn btn-ghost btn-sm flex-1" disabled={busy} onClick={() => void pick('zip')}>zip</button>
            </div>
            <div className="text-[9px] text-[var(--muted)] mt-3">
              {isAndroid() ? '通过系统文件选择器授权，复制到应用私有目录' : '选择本地 Markdown 题库根目录'}
            </div>
          </div>

          {busy ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-[10.5px]">
                <span>{step || '导入中…'}</span>
              </div>
              <div className="progress mt-2" style={{ height: 7 }}>
                <i style={{ width: '60%' }} />
              </div>
              <div className="text-[9.5px] text-[var(--muted)] mt-2">大题库可能需要几分钟，请勿关闭应用。</div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl p-4 text-[11.5px] leading-6" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>
              {error}
            </div>
          ) : null}

          <button className="btn btn-primary btn-block mt-3" disabled={!path || busy} onClick={() => void run()}>
            {busy ? '正在导入…' : '开始导入'}
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
          <button className="btn btn-primary btn-block mt-3" onClick={close}>完成</button>
        </>
      )}
      <div className="h-4" />
    </MobileSheet>
  );
}