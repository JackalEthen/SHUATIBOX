import { t } from './i18n';
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
  const [keySet, setKeySet] = useState(false);
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
        setKey('');
        setKeySet(values.ai_key_set === '1');
      })
      .catch(() => undefined);
  }, [open]);

  const save = async () => {
    if (!url.trim() || !model.trim() || (!key.trim() && !keySet)) {
      onNotice?.(t("请填写接口地址、模型和密钥"));
      return;
    }
    setBusy(true);
    setTestResult(null);
    setTestError('');
    try {
      const values: Record<string, string> = { ai_url: url.trim(), ai_model: model.trim() };
      if (key.trim()) values.ai_key = key.trim();
      await setSettings(values);
      setKey('');
      setKeySet(true);
      setBusy(false);
      setTesting(true);
      (window as unknown as { __shuatiboxAiTesting?: boolean }).__shuatiboxAiTesting = true;
      try {
        const result = await aiTest();
        setTestResult(result);
        onNotice?.(result.visionOk ? t("模型连接正常，可读图") : t("模型不可读图"));
      } catch (cause) {
        setTestError(errorText(cause));
      } finally {
        (window as unknown as { __shuatiboxAiTesting?: boolean }).__shuatiboxAiTesting = false;
        setTesting(false);
      }
    } catch (cause) {
      onNotice?.(t("保存失败：{p0}", { p0: errorText(cause) }));
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
      <label className="text-[12px] text-[var(--muted)]">
        {t("接口地址")}
        <input
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2 text-[13.5px] text-[var(--ink)] outline-none disabled:opacity-60"
          placeholder="https://api.deepseek.com/v1"
          value={url}
          disabled={locked}
          onChange={(event) => change(setUrl)(event.target.value)}
        />
      </label>
      <label className="text-[12px] text-[var(--muted)]">
        {t("模型")}
        <input
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2 text-[13.5px] text-[var(--ink)] outline-none disabled:opacity-60"
          placeholder="gpt-4o-mini / qwen-vl-plus"
          value={model}
          disabled={locked}
          onChange={(event) => change(setModel)(event.target.value)}
        />
      </label>
      <label className="text-[12px] text-[var(--muted)]">
        {t("密钥")}
        <input
          type="password"
          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2 text-[13.5px] text-[var(--ink)] outline-none disabled:opacity-60"
          placeholder={keySet ? t("已保存，留空不修改") : "sk-..."}
          value={key}
          disabled={locked}
          onChange={(event) => change(setKey)(event.target.value)}
        />
      </label>
    </div>
  );

  const status: ReactNode = (
    <div className="mt-3 text-[12px] leading-5">
      {testing ? (
        <span className="text-[var(--muted)]">{t("正在测试连通性和读图能力，请稍候…")}</span>
      ) : testError ? (
        <span className="text-[var(--bad)]">{t("测试失败：")}{testError}</span>
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
        {t("关闭")}
      </button>
      <button className="btn btn-primary" onClick={() => void save()} disabled={locked}>
        {busy ? t("保存中…") : testing ? t("测试中…") : t("保存并测试")}
      </button>
    </div>
  );

  const hint = (
    <div className="text-[11.5px] text-[var(--muted)] leading-5 mb-3">
      {t("用于 AI 转换导入和题目 AI 讲解。建议使用支持图片识别的模型（GPT-4o、Claude、Gemini、Qwen-VL 等），否则带图题目可能无法正常讲解。密钥仅保存在本机。")}
    </div>
  );

  if (mobile) {
    return (
      <MobileSheet open onClose={onClose} closable={!locked}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line)]">
          <Icon name="sparkle" className="w-4 h-4" />
          <span className="text-[13px] font-semibold">{t("AI 设置")}</span>
          <button className="icon-btn ml-auto" onClick={onClose} aria-label={t("关闭")} disabled={locked}>
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
    <Modal open title={t("AI 设置")} onClose={onClose} footer={actions} closable={!locked}>
      {hint}
      {fields}
      {status}
    </Modal>
  );
}
