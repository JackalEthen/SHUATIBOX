import { t } from './i18n';
import { useEffect, useState } from 'react';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  title: string;
  max: number;
  initial?: number;
  mobile?: boolean;
  onClose: () => void;
  onStart: (count: number) => void;
}

export function CountDialog({ open, title, max, initial = 20, mobile, onClose, onStart }: Props) {
  const [count, setCount] = useState(1);

  useEffect(() => {
    if (open) setCount(Math.max(1, Math.min(initial, max)));
  }, [open, initial, max]);

  useEffect(() => {
    if (!open || !mobile) return;
    const win = window as unknown as { __shuatiboxBack?: () => string };
    const previous = win.__shuatiboxBack;
    const handler = () => {
      onClose();
      return 'handled';
    };
    win.__shuatiboxBack = handler;
    return () => {
      if (win.__shuatiboxBack === handler) win.__shuatiboxBack = previous;
    };
  }, [open, mobile, onClose]);

  const value = Math.max(1, Math.min(Number(count) || 1, Math.max(1, max)));

  const body = (
    <>
      <div className="text-[13.5px] text-[var(--muted)]">{t("从")} {max}  {t("道待攻克错题中选择本次数量")}</div>
      <div className="flex gap-2 mt-3 flex-wrap">
        {[10, 20, 50, 100].filter((item) => item <= max).map((item) => (
          <button key={item} className={`chip ${value === item ? 'active' : ''}`} onClick={() => setCount(item)}>
            {item}  {t("题")}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button className="icon-btn" onClick={() => setCount(Math.max(1, value - 1))} aria-label={t("减少")}>
          −
        </button>
        <input
          type="number"
          min={1}
          max={max}
          aria-label={t("自定义题数")}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
          className="chip bg-transparent w-24 text-center text-[14px] outline-none"
        />
        <button className="icon-btn" onClick={() => setCount(Math.min(Math.max(1, max), value + 1))} aria-label={t("增加")}>
          +
        </button>
        <span className="text-[13.5px] text-[var(--muted)]">{t("题")}</span>
      </div>
    </>
  );

  const actions = (
    <>
      <button className="btn btn-ghost" onClick={onClose}>{t("取消")}</button>
      <button className="btn btn-primary" onClick={() => onStart(value)}>{t("开始重做")}</button>
    </>
  );

  return (
    <Modal open={open} title={title} onClose={onClose} footer={actions}>
      {body}
    </Modal>
  );
}
