import { useEffect, useState, type ReactNode } from 'react';
import { errorText, getSettings, setSettings } from './api';
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

  useEffect(() => {
    if (!open) return;
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
    try {
      await setSettings({ ai_url: url.trim(), ai_model: model.trim(), ai_key: key.trim() });
      onNotice?.('AI 配置已保存');
      onClose();
    } catch (cause) {
      onNotice?.(`保存失败：${errorText(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const fields: ReactNode = (
    <div className="grid gap-3">
      <label className="text-[11px] text-[var(--muted)]">
        接口地址
        <input
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2 text-[11.5px] text-[var(--ink)] outline-none"
          placeholder="https://api.deepseek.com/v1"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <label className="text-[11px] text-[var(--muted)]">
        模型
        <input
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2 text-[11.5px] text-[var(--ink)] outline-none"
          placeholder="deepseek-chat"
          value={model}
          onChange={(event) => setModel(event.target.value)}
        />
      </label>
      <label className="text-[11px] text-[var(--muted)]">
        密钥
        <input
          type="password"
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2 text-[11.5px] text-[var(--ink)] outline-none"
          placeholder="sk-..."
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
      </label>
    </div>
  );

  const actions = (
    <div className="flex justify-end gap-2 mt-4">
      <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
        取消
      </button>
      <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
        {busy ? '保存中…' : '保存'}
      </button>
    </div>
  );

  if (mobile) {
    return (
      <MobileSheet open onClose={onClose}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line)]">
          <Icon name="sparkle" className="w-4 h-4" />
          <span className="text-[13px] font-semibold">AI 设置</span>
          <button className="icon-btn ml-auto" onClick={onClose} aria-label="关闭">
            <Icon name="x" />
          </button>
        </div>
        <div className="p-4">
          <div className="text-[10.5px] text-[var(--muted)] leading-5 mb-3">
            OpenAI 兼容接口，密钥仅保存在本机。
          </div>
          {fields}
          {actions}
        </div>
      </MobileSheet>
    );
  }

  return (
    <Modal open title="AI 设置" onClose={onClose} footer={actions}>
      <div className="text-[10.5px] text-[var(--muted)] leading-5 mb-3">
        OpenAI 兼容接口，密钥仅保存在本机。
      </div>
      {fields}
    </Modal>
  );
}
