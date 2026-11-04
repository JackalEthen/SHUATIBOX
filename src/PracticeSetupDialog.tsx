import { useEffect, useState } from 'react';
import { Icon } from './icons';
import { MobileSheet } from './MobileSheet';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  moduleName?: string | null;
  wrongCount: number;
  mobile?: boolean;
  onClose: () => void;
  onStart: (count: number, mixWrong: boolean) => void;
}

const presets = [10, 20, 50, 100];

export function PracticeSetupDialog({ open, moduleName, wrongCount, mobile, onClose, onStart }: Props) {
  const [count, setCount] = useState(20);
  const [mixWrong, setMixWrong] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCount(20);
    setMixWrong(false);
  }, [open]);

  const safeCount = Math.min(500, Math.max(1, Math.round(count) || 20));
  const wrongTake = Math.min(wrongCount, Math.max(1, Math.ceil(safeCount * 0.25)));

  const fields = (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] text-[var(--muted)]">练习范围</div>
        <div className="text-[13.5px] font-medium mt-1">{moduleName || '全部模块'}</div>
      </div>

      <div>
        <div className="text-[11px] text-[var(--muted)] mb-2">题目数量</div>
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
            <span className="text-[11px] text-[var(--muted)]">题</span>
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
        <div className="text-[10px] text-[var(--muted)] mt-1.5">范围 1–500 题，图片题需先导入题库图片。</div>
      </div>

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
          <span className="block text-[12.5px]">混入之前的错题</span>
          <span className="block text-[10.5px] text-[var(--muted)] mt-0.5">
            {wrongCount > 0 ? `待攻克 ${wrongCount} 题，最多混入 ${wrongTake} 题` : '暂无错题可混入'}
          </span>
        </span>
      </label>
    </div>
  );

  const start = () => {
    onStart(safeCount, mixWrong && wrongCount > 0);
    onClose();
  };

  const actions = (
    <>
      <button className={`btn btn-ghost ${mobile ? 'flex-1 justify-center' : ''}`} onClick={onClose}>取消</button>
      <button className={`btn btn-primary ${mobile ? 'flex-1 justify-center' : ''}`} onClick={start}>开始练习</button>
    </>
  );

  if (mobile) {
    return (
      <MobileSheet open={open} onClose={onClose}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line)]">
          <Icon name="library" className="w-4 h-4" />
          <span className="text-[13px] font-semibold">开始练习</span>
          <button className="icon-btn ml-auto" onClick={onClose} aria-label="关闭">
            <Icon name="x" />
          </button>
        </div>
        <div className="p-4">
          {fields}
          <div className="flex gap-2 mt-5">{actions}</div>
        </div>
      </MobileSheet>
    );
  }

  return (
    <Modal open={open} title="开始练习" onClose={onClose} footer={actions}>
      {fields}
    </Modal>
  );
}
