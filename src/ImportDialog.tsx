import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { errorText, importBank, type ImportSummary } from './api';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  onNotice: (message: string) => void;
}

export function ImportDialog({ open: isOpen, onClose, onDone, onNotice }: Props) {
  const [path, setPath] = useState('');
  const [setActive, setSetActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');

  const chooseFolder = async () => {
    const value = await open({ directory: true, multiple: false });
    if (value && !Array.isArray(value)) {
      setPath(value);
      setSummary(null);
      setError('');
    }
  };

  const chooseZip = async () => {
    const value = await open({
      directory: false,
      multiple: false,
      filters: [{ name: '题库压缩包', extensions: ['zip'] }],
    });
    if (value && !Array.isArray(value)) {
      setPath(value);
      setSummary(null);
      setError('');
    }
  };

  const run = async () => {
    if (!path) return;
    setBusy(true);
    setError('');
    setSummary(null);
    try {
      const value = await importBank(path, setActive);
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
    setSummary(null);
    setError('');
    setPath('');
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      title="导入题库"
      onClose={close}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={close} disabled={busy}>关闭</button>
          <button className="btn btn-primary" onClick={() => void run()} disabled={!path || busy}>
            {busy ? '正在解析导入…' : '开始解析导入'}
          </button>
        </>
      }
    >
      <div className="text-[10.5px] text-[var(--muted)] leading-5">
        支持 Markdown 文件夹或 zip。图片自动复制并按 SHA-256 去重；缺图保留占位并写入报告。
      </div>

      <div className="mt-3 rounded-xl border border-dashed border-[var(--line)] bg-[var(--paper-2)] p-5 text-center">
        <div className="text-[12px] text-[var(--ink-2)]">把题库文件夹或 zip 选进来</div>
        <div className="text-[10.5px] text-[var(--muted)] mt-1">结构：模块目录 / 试卷.md / 90-图片</div>
        <div className="flex justify-center gap-2 mt-3">
          <button className="btn btn-ghost" onClick={() => void chooseFolder()} disabled={busy}>选择文件夹</button>
          <button className="btn btn-ghost" onClick={() => void chooseZip()} disabled={busy}>选择 zip</button>
        </div>
        {path ? <div className="text-[10.5px] text-[var(--accent-ink)] mt-3 break-all">{path}</div> : null}
      </div>

      <label className="flex items-center gap-2 mt-3 text-[11.5px] text-[var(--ink-2)]">
        <input type="checkbox" checked={setActive} onChange={(event) => setSetActive(event.target.checked)} />
        导入后设为当前题库
      </label>

      {busy ? (
        <div className="mt-4 rounded-xl bg-[var(--accent-soft)] p-4 text-[11.5px] text-[var(--accent-ink)]">
          正在读取 Markdown、校验答案、复制图片并写入数据库。题库较大时可能需要几分钟，请勿关闭应用。
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
