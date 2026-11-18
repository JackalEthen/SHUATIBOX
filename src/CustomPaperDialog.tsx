import { t } from './i18n';
import { useState } from 'react';
import type { Bootstrap, SessionSpec } from './api';
import { JudgeModePicker, type JudgeMode } from './JudgeMode';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  data: Bootstrap;
  onClose: () => void;
  onStart: (spec: SessionSpec) => void;
}

export function CustomPaperDialog({ open, data, onClose, onStart }: Props) {
  const [modules, setModules] = useState<Set<string>>(new Set());
  const [years, setYears] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(20);
  const [order, setOrder] = useState('random');
  const [duration, setDuration] = useState(0);
  const [judgeMode, setJudgeMode] = useState<JudgeMode>('instant');

  const toggle = (set: Set<string>, value: string, update: (next: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    update(next);
  };

  return (
    <Modal
      open={open}
      title={t("自定义组卷")}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>{t("取消")}</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onStart({
                mode: 'custom',
                modules: [...modules],
                years: [...years],
                count,
                order,
                judgeMode,
                durationSec: duration || undefined,
                title: t("自定义练习"),
              });
              onClose();
            }}
          >
            {t("生成并开始")}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="text-[11.5px] text-[var(--muted)] mb-2">{t("模块")}</div>
          <div className="flex flex-wrap gap-2">
            {data.modules.map((module) => (
              <button
                key={module.name}
                className={`chip ${modules.has(module.name) ? 'active' : ''}`}
                onClick={() => toggle(modules, module.name, setModules)}
              >
                {module.name} · {module.available}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1.5">{t("不选则从全部模块抽题；图片题在图片导入前不会进入练习。")}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-[var(--muted)] mb-2">{t("年份")}</div>
          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto scroll">
            {data.years.map((year) => (
              <button key={year} className={`chip ${years.has(year) ? 'active' : ''}`} onClick={() => toggle(years, year, setYears)}>
                {year}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[11.5px] text-[var(--muted)] mb-2">{t("题量")}</div>
            <div className="seg">
              {[10, 20, 50].map((value) => (
                <button key={value} className={count === value ? 'active' : ''} onClick={() => setCount(value)}>
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11.5px] text-[var(--muted)] mb-2">{t("顺序")}</div>
            <div className="seg">
              <button className={order === 'random' ? 'active' : ''} onClick={() => setOrder('random')}>{t("随机")}</button>
              <button className={order === 'order' ? 'active' : ''} onClick={() => setOrder('order')}>{t("顺序")}</button>
            </div>
          </div>
          <div>
            <div className="text-[11.5px] text-[var(--muted)] mb-2">{t("限时")}</div>
            <select className="chip bg-transparent" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
              <option value={0}>{t("不限时")}</option>
              <option value={1800}>{t("30 分钟")}</option>
              <option value={3600}>{t("60 分钟")}</option>
              <option value={5400}>{t("90 分钟")}</option>
              <option value={7200}>{t("120 分钟")}</option>
            </select>
          </div>
        </div>
        <JudgeModePicker value={judgeMode} onChange={setJudgeMode} />

        <div className="text-[11px] text-[var(--muted)] bg-[var(--paper-2)] rounded-xl p-3">

          {t("已选：")}{modules.size ? [...modules].join('、') : t("全部模块")} · {years.size ? [...years].join('、') : t("全部年份")} · {count}  {t("题 ·")}{' '}
          {order === 'random' ? t("随机") : t("顺序")} · {duration ? t("{p0} 分钟", { p0: duration / 60 }) : t("不限时")}
        </div>
      </div>
    </Modal>
  );
}
