import { useEffect, useState, type ReactNode } from 'react';
import { aiTest, errorText, getSettings, setSettings, type AiTestResult } from './api';
import { Icon } from './icons';
import { MobileSheet } from './MobileSheet';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  mobile?: boolean;
  onNotice?: (message: string) => void;
}

export function AiConfigDialog({ open, onClose, mobile, onNotice }: Props) {
  const [url, setUrl] = useState('');
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AiTestResult | null>(null);
  const [testError, setTestError] = useState('');

  const locked = busy || testing;

  useEffect(() => {
    if (!open) return;
    setTestResult(null);
    setTestError('');
    getSettings()
      .then((values) => {
        setUrl(values.ai_url ?? '');
        setModel(values.ai_model ?? '');
        setKey(values.ai_key ?? '');
      })
      .catch(() => undefined);
  }, [open]);

  const save = async () => {
    if (!url.trim() || !model.trim() || !key.trim()) {
      onNotice?.('请填写接口地址、模型和密钥');
      return;
    }
    setBusy(true);
    setTestResult(null);
    setTestError('');
    try {
      await setSettings({ ai_url: url.trim(), ai_model: model.trim(), ai_key: key.trim() });
      setBusy(false);
      setTesting(true);
      (window as unknown as { __shuatiboxAiTesting?: boolean }).__shuatiboxAiTesting = true;
      try {
        const result = await aiTest();
        setTestResult(result);
        onNotice?.(result.visionOk ? '模型连接正常，可读图' : '模型不可读图');
      } catch (cause) {
        setTestError(errorText(cause));
      } finally {
        (window as unknown as { __shuatiboxAiTesting?: boolean }).__shuatiboxAiTesting = false;
        setTesting(false);
      }
    } catch (cause) {
      onNotice?.(`保存失败：${errorText(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const change = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setTestResult(null);
    setTestError('');
  };

  if (!open) return null;

  const fields: ReactNode = (
    <div className="grid gap-3">
      <label className="text-[11px] text-[var(--muted)]">
        接口地址
        <input
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2 text-[11.5px] text-[var(--ink)] outline-none disabled:opacity-60"
          placeholder="https://api.deepseek.com/v1"
          value={url}
          disabled={locked}
          onChange={(event) => change(setUrl)(event.target.value)}
        />
      </label>
      <label className="text-[11px] text-[var(--muted)]">
        模型
        <input
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2 text-[11.5px] text-[var(--ink)] outline-none disabled:opacity-60"
          placeholder="gpt-4o-mini / qwen-vl-plus"
          value={model}
          disabled={locked}
          onChange={(event) => change(setModel)(event.target.value)}
        />
      </label>
      <label className="text-[11px] text-[var(--muted)]">
        密钥
        <input
          type="password"
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2 text-[11.5px] text-[var(--ink)] outline-none disabled:opacity-60"
          placeholder="sk-..."
          value={key}
          disabled={locked}
          onChange={(event) => change(setKey)(event.target.value)}
        />
      </label>
    </div>
  );

  const status: ReactNode = (
    <div className="mt-3 text-[11px] leading-5">
      {testing ? (
        <span className="text-[var(--muted)]">正在测试连通性和读图能力，请稍候…</span>
      ) : testError ? (
        <span className="text-[var(--bad)]">测试失败：{testError}</span>
      ) : testResult ? (
        <span style={{ color: testResult.visionOk ? 'var(--good)' : 'var(--warn)' }}>
          {testResult.message}
        </span>
      ) : null}
    </div>
  );

  const actions = (
    <div className="flex justify-end gap-2 mt-4">
      <button className="btn btn-ghost" onClick={onClose} disabled={locked}>
        关闭
      </button>
      <button className="btn btn-primary" onClick={() => void save()} disabled={locked}>
        {busy ? '保存中…' : testing ? '测试中…' : '保存并测试'}
      </button>
    </div>
  );

  const hint = (
    <div className="text-[10.5px] text-[var(--muted)] leading-5 mb-3">
      用于 AI 转换导入和题目 AI 讲解。建议使用支持图片识别的模型（GPT-4o、Claude、Gemini、Qwen-VL 等），否则带图题目可能无法正常讲解。密钥仅保存在本机。
    </div>
  );

  if (mobile) {
    return (
      <MobileSheet open onClose={onClose} closable={!locked}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line)]">
          <Icon name="sparkle" className="w-4 h-4" />
          <span className="text-[13px] font-semibold">AI 设置</span>
          <button className="icon-btn ml-auto" onClick={onClose} aria-label="关闭" disabled={locked}>
            <Icon name="x" />
          </button>
        </div>
        <div className="p-4">
          {hint}
          {fields}
          {status}
          {actions}
        </div>
      </MobileSheet>
    );
  }

  return (
    <Modal open title="AI 设置" onClose={onClose} footer={actions} closable={!locked}>
      {hint}
      {fields}
      {status}
    </Modal>
  );
}
