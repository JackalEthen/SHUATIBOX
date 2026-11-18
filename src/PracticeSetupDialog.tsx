import { t } from './i18n';
import { useEffect, useState } from 'react';
import { JudgeModePicker, type JudgeMode } from './JudgeMode';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  moduleName?: string | null;
  wrongCount: number;
  mobile?: boolean;
  onClose: () => void;
  onStart: (count: number, mixWrong: boolean, judgeMode: JudgeMode) => void;
}

const presets = [10, 20, 50, 100];

export function PracticeSetupDialog({ open, moduleName, wrongCount, mobile, onClose, onStart }: Props) {
  const [count, setCount] = useState(20);
  const [mixWrong, setMixWrong] = useState(false);
  const [judgeMode, setJudgeMode] = useState<JudgeMode>('instant');

  useEffect(() => {
    if (!open) return;
    setCount(20);
    setMixWrong(false);
    setJudgeMode('instant');
  }, [open]);

  const safeCount = Math.min(500, Math.max(1, Math.round(count) || 20));
  const wrongTake = Math.min(wrongCount, Math.max(1, Math.ceil(safeCount * 0.25)));

  const fields = (
    <div className="space-y-4">
      <div>
        <div className="text-[12px] text-[var(--muted)]">{t("练习范围")}</div>
        <div className="text-[14px] font-medium mt-1">{moduleName || t("全部模块")}</div>
      </div>

      <div>
        <div className="text-[12px] text-[var(--muted)] mb-2">{t("题目数量")}</div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--card)]">
            <input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className="w-14 bg-transparent outline-none text-[17px] font-semibold text-[var(--ink)]"
            />
            <span className="text-[12px] text-[var(--muted)]">{t("题")}</span>
          </label>
          {presets.map((value) => (
            <button
              key={value}
              className={`chip ${safeCount === value ? 'active' : ''}`}
              onClick={() => setCount(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-[var(--muted)] mt-1.5">{t("范围 1–500 题，图片题需先导入题库图片。")}</div>
      </div>

      <JudgeModePicker value={judgeMode} onChange={setJudgeMode} />

      <label className={`flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--card)] p-3 ${wrongCount > 0 ? 'cursor-pointer' : 'opacity-60'}`}>
        <input
          type="checkbox"
          checked={mixWrong}
          disabled={wrongCount === 0}
          onChange={(event) => setMixWrong(event.target.checked)}
          className="mt-0.5 w-4 h-4"
          style={{ accentColor: 'var(--accent)' }}
        />
        <span className="min-w-0">
          <span className="block text-[13.5px]">{t("混入之前的错题")}</span>
          <span className="block text-[11.5px] text-[var(--muted)] mt-0.5">
            {wrongCount > 0 ? t("待攻克 {p0} 题，最多混入 {p1} 题", { p0: wrongCount, p1: wrongTake }) : t("暂无错题可混入")}
          </span>
        </span>
      </label>
    </div>
  );

  const start = () => {
    onStart(safeCount, mixWrong && wrongCount > 0, judgeMode);
    onClose();
  };

  const actions = (
    <>
      <button className={`btn btn-ghost ${mobile ? 'flex-1 justify-center' : ''}`} onClick={onClose}>{t("取消")}</button>
      <button className={`btn btn-primary ${mobile ? 'flex-1 justify-center' : ''}`} onClick={start}>{t("开始练习")}</button>
    </>
  );

  return (
    <Modal open={open} title={t("开始练习")} onClose={onClose} footer={actions}>
      {fields}
    </Modal>
  );
}
