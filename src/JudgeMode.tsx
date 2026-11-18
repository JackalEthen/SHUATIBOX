import { useEffect, useState } from 'react';
import { t } from './i18n';
import { Modal } from './Modal';

export type JudgeMode = 'instant' | 'deferred';

export function JudgeModePicker({ value, onChange }: { value: JudgeMode; onChange: (value: JudgeMode) => void }) {
  return (
    <div>
      <div className="text-[12px] text-[var(--muted)] mb-2">{t("判题模式")}</div>
      <div className="seg">
        <button className={value === 'instant' ? 'active' : ''} onClick={() => onChange('instant')}>
          {t("逐题判题")}
        </button>
        <button className={value === 'deferred' ? 'active' : ''} onClick={() => onChange('deferred')}>
          {t("交卷后判题")}
        </button>
      </div>
      <div className="text-[11px] text-[var(--muted)] mt-1.5">{t("本次练习开始后不可更改")}</div>
    </div>
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  onStart: (mode: JudgeMode) => void;
}

export function JudgeModeDialog({ open, onClose, onStart }: DialogProps) {
  const [mode, setMode] = useState<JudgeMode>('instant');

  useEffect(() => {
    if (open) setMode('instant');
  }, [open]);

  return (
    <Modal
      open={open}
      title={t("开始练习")}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>{t("取消")}</button>
          <button className="btn btn-primary" onClick={() => onStart(mode)}>{t("开始练习")}</button>
        </>
      }
    >
      <JudgeModePicker value={mode} onChange={setMode} />
    </Modal>
  );
}
