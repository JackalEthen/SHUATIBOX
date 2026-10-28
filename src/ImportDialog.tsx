import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import {
  aiImport,
  errorText,
  importBank,
  type AiImportSummary,
  type ImportProgress,
  type ImportSummary,
} from './api';
import { ImportFormatHelp } from './ImportFormatHelp';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  onNotice: (message: string) => void;
}

const PHASE_LABEL: Record<string, string> = {
  prepare: '准备文件',
  scan: '扫描文件',
  convert: 'AI 转换',
  parse: '解析题库',
  import: '写入题库',
  done: '完成',
};

const STATUS_LABEL: Record<string, string> = {
  converted: 'AI 转换',
  valid: '已合规',
  skipped: '跳过',
  failed: '失败',
};

function statusColor(status: string) {
  if (status === 'failed') return 'var(--bad)';
  if (status === 'skipped') return 'var(--muted)';
  if (status === 'valid') return 'var(--muted)';
  return 'var(--accent-ink)';
}

export function ImportDialog({ open: isOpen, onClose, onDone, onNotice }: Props) {
  const [path, setPath] = useState('');
  const [setActive, setSetActive] = useState(true);
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

  const chooseFolder = async () => {
    const value = await open({ directory: true, multiple: false });
    if (value && !Array.isArray(value)) {
      setPath(value);
      setSummary(null);
      setAiResult(null);
      setError('');
    }
  };

  const chooseZip = async () => {
    const value = await open({
      directory: false,
      multiple: false,
      filters: [{ name: '题库压缩包', extensions: ['zip', 'md'] }],
    });
    if (value && !Array.isArray(value)) {
      setPath(value);
      setSummary(null);
      setAiResult(null);
      setError('');
    }
  };

  const run = async () => {
    if (!path) return;
    setBusy(true);
    setError('');
    setSummary(null);
    setAiResult(null);
    setProgress(null);
    try {
      if (useAi) {
        const result = await aiImport(path, setActive);
        setAiResult(result);
        setSummary(result.summary);
        onNotice(result.failed > 0 ? `导入完成，${result.failed} 个文件转换失败` : 'AI 转换导入完成');
      } else {
        const value = await importBank(path, setActive);
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
    setSummary(null);
    setAiResult(null);
    setError('');
    setPath('');
    setProgress(null);
    onClose();
  };

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current * 100) / progress.total))
      : 12;

  return (
    <Modal
      open={isOpen}
      title="导入题库"
      onClose={close}
      wide
      closable={!busy}
      footer={
        <>
          <button className="btn btn-ghost" onClick={close} disabled={busy}>
            关闭
          </button>
          <button className="btn btn-primary" onClick={() => void run()} disabled={!path || busy}>
            {busy ? '导入中…' : useAi ? 'AI 转换并导入' : '开始解析导入'}
          </button>
        </>
      }
    >
      <div className="text-[10.5px] text-[var(--muted)] leading-5">
        支持 Markdown 文件、文件夹或 zip。图片自动复制并按 SHA-256 去重；缺图保留占位并写入报告。
      </div>

      <div className="mt-3 rounded-xl border border-dashed border-[var(--line)] bg-[var(--paper-2)] p-5 text-center">
        <div className="text-[12px] text-[var(--ink-2)]">把题库文件夹或 zip 选进来</div>
        <div className="text-[10.5px] text-[var(--muted)] mt-1">结构：模块目录 / 试卷.md / 90-图片</div>
        <div className="flex justify-center gap-2 mt-3">
          <button className="btn btn-ghost" onClick={() => void chooseFolder()} disabled={busy}>
            选择文件夹
          </button>
          <button className="btn btn-ghost" onClick={() => void chooseZip()} disabled={busy}>
            选择 zip / md
          </button>
        </div>
        {path ? <div className="text-[10.5px] text-[var(--accent-ink)] mt-3 break-all">{path}</div> : null}
      </div>

      <label className="flex items-center gap-2 mt-3 text-[11.5px] text-[var(--ink-2)]">
        <input type="checkbox" checked={setActive} onChange={(event) => setSetActive(event.target.checked)} />
        导入后设为当前题库
      </label>

      <label className="flex items-center gap-2 mt-1.5 text-[11.5px] text-[var(--ink-2)]">
        <input
          type="checkbox"
          checked={useAi}
          disabled={busy}
          onChange={(event) => setUseAi(event.target.checked)}
        />
        AI 智能转换（格式不符的 Markdown 自动改写，需先在设置中配置接口）
      </label>

      <ImportFormatHelp />

      {busy ? (
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] p-4">
          <div className="flex items-center gap-2 text-[11.5px] text-[var(--accent-ink)]">
            <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            <span className="truncate">{progress?.message || '准备中…'}</span>
          </div>
          <div className="progress mt-3" style={{ height: 7 }}>
            <i style={{ width: `${percent}%` }} />
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-2">
            {PHASE_LABEL[progress?.phase ?? ''] ?? '处理中'}
            {progress && progress.total > 0 ? ` · ${progress.current}/${progress.total}` : ''}
            {' · '}导入完成前不可关闭
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl bg-[var(--bad-soft)] p-4 text-[11.5px] text-[var(--bad)] leading-6">
          {error}
        </div>
      ) : null}

      {summary ? (
        <div className="mt-4">
          <div className="rounded-xl border border-[var(--line)] p-4">
            <div className="flex items-center gap-2">
              <span className="chip-accent">导入完成</span>
              <span className="text-[11px] text-[var(--muted)]">{summary.title}</span>
            </div>
            <div className="grid grid-cols-4 gap-3 mt-4 text-center">
              {[
                ['题目', summary.questions],
                ['试卷', summary.papers],
                ['图片', summary.images],
                ['待校对', summary.review],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-[18px] font-semibold">{Number(value).toLocaleString('zh-CN')}</div>
                  <div className="text-[10px] text-[var(--muted)] mt-1">{label}</div>
                </div>
              ))}
            </div>
            <div className="text-[10.5px] text-[var(--muted)] mt-3">
              含图题 {summary.imageQuestions.toLocaleString('zh-CN')} · 无效 {summary.invalid} · 文件错误 {summary.fileErrors} · 跳过 {summary.skipped}
            </div>
          </div>

          {aiResult ? (
            <div className="mt-3 rounded-xl border border-[var(--line)] p-4">
              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                <span className="font-semibold">AI 转换报告</span>
                <span className="chip">转换 {aiResult.converted}</span>
                <span className="chip">已合规 {aiResult.valid}</span>
                {aiResult.failed > 0 ? (
                  <span className="chip" style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}>
                    失败 {aiResult.failed}
                  </span>
                ) : null}
              </div>
              <div className="max-h-56 overflow-y-auto scroll mt-3 space-y-2 text-[10.5px] leading-5">
                {aiResult.files
                  .filter((item) => item.status !== 'skipped')
                  .map((item, index) => (
                    <div key={`${item.file}-${index}`} className="border-b border-[var(--line)] pb-2 last:border-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ color: statusColor(item.status) }}>
                          [{STATUS_LABEL[item.status] ?? item.status}]
                        </span>
                        <span className="text-[var(--ink-2)] break-all">{item.file}</span>
                        <span className="text-[var(--muted)]">
                          {item.questions} 题
                          {item.expected > 0 ? ` / 原文约 ${item.expected} 题` : ''}
                        </span>
                      </div>
                      {item.error ? <div style={{ color: 'var(--bad)' }}>{item.error}</div> : null}
                      {(item.flags ?? []).map((flag, flagIndex) => (
                        <div key={flagIndex} style={{ color: 'var(--warn)' }}>
                          {flag}
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          {summary.issues.length > 0 ? (
            <div className="mt-3">
              <div className="text-[11px] text-[var(--muted)] mb-1">报告（前 {Math.min(50, summary.issues.length)} 条）</div>
              <div className="max-h-40 overflow-y-auto scroll rounded-xl border border-[var(--line)] p-3 text-[10.5px] leading-5 text-[var(--ink-2)]">
                {summary.issues.slice(0, 50).map((issue, index) => (
                  <div key={index}>{issue}</div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
