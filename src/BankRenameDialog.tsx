import { t } from './i18n';
import { useEffect, useState } from 'react';
import { errorText, renameBank, type BankDto } from './api';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  bank: BankDto | null;
  onClose: () => void;
  onSaved: () => void;
  onNotice: (message: string) => void;
}

export function BankRenameDialog({ open, bank, onClose, onSaved, onNotice }: Props) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(bank?.title ?? '');
    setBusy(false);
    setError('');
  }, [open, bank]);

  const submit = async () => {
    if (!bank || busy) return;
    const next = title.trim();
    if (!next) {
      setError(t("题库名称不能为空"));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await renameBank(bank.id, next);
      onNotice(t("题库已重命名"));
      onSaved();
      onClose();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t("重命名题库")}
      onClose={onClose}
      closable={!busy}
      layer={80}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>{t("取消")}</button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || !title.trim()}>
            {busy ? t("保存中…") : t("保存")}
          </button>
        </>
      }
    >
      <label className="block text-[11.5px] text-[var(--muted)] mb-1.5">{t("题库名称")}</label>
      <input
        className="w-full rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none"
        value={title}
        maxLength={40}
        autoFocus
        disabled={busy}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void submit();
        }}
      />
      {error ? <div className="mt-2 text-[11px] text-[var(--bad)]">{error}</div> : null}
    </Modal>
  );
}
