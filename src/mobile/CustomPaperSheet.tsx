import { t, fmtNumber } from '../i18n';
import { useState } from 'react';
import type { Bootstrap, SessionSpec } from '../api';
import { MobileSheet } from '../MobileSheet';

interface Props {
  open: boolean;
  data: Bootstrap;
  onClose: () => void;
  onStart: (spec: SessionSpec) => void;
}

export function CustomPaperSheet({ open, data, onClose, onStart }: Props) {
  const [modules, setModules] = useState<string[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [count, setCount] = useState(20);
  const [order, setOrder] = useState<'random' | 'sequence'>('random');
  const [duration, setDuration] = useState(0);

  const toggle = (list: string[], value: string, set: (next: string[]) => void) => {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const summary = t("{modules} · {count} 题 · {order}{duration}", {
    modules: modules.length ? modules.join(t("、")) : t("全部模块"),
    count,
    s: count === 1 ? '' : 's',
    order: order === 'random' ? t("随机") : t("顺序"),
    duration: duration ? t(" · 限时 {minutes} 分钟", { minutes: duration / 60 }) : t(" · 不限时"),
  });

  return (
    <MobileSheet open={open} onClose={onClose}>
      <div className="grabber" />
      <h3 className="text-[15px] font-semibold">{t("自定义组卷")}</h3>
      <p className="text-[11px] text-[var(--muted)] mt-1">{t("不选模块则从全部模块抽题。")}</p>

      <div className="mt-4">
        <div className="text-[12px] text-[var(--ink-2)] mb-2">{t("模块")}</div>
        <div className="flex flex-wrap gap-2">
          {data.modules.map((module) => (
            <button
              key={module.code}
              className={`chip ${modules.includes(module.name) ? 'active' : ''}`}
              onClick={() => toggle(modules, module.name, setModules)}
            >
              {module.name} · {fmtNumber(module.available)}
            </button>
          ))}
        </div>

        <div className="text-[12px] text-[var(--ink-2)] mb-2 mt-4">{t("年份")}</div>
        <div className="flex flex-wrap gap-2">
          {data.years.map((year) => (
            <button
              key={year}
              className={`chip ${years.includes(year) ? 'active' : ''}`}
              onClick={() => toggle(years, year, setYears)}
            >
              {year}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4">
          <span className="text-[12px] text-[var(--ink-2)]">{t("题量")}</span>
          <div className="seg">
            {[10, 20, 50].map((value) => (
              <button key={value} className={count === value ? 'active' : ''} onClick={() => setCount(value)}>
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-[12px] text-[var(--ink-2)]">{t("顺序")}</span>
          <div className="seg">
            <button className={order === 'random' ? 'active' : ''} onClick={() => setOrder('random')}>{t("随机")}</button>
            <button className={order === 'sequence' ? 'active' : ''} onClick={() => setOrder('sequence')}>{t("顺序")}</button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-[12px] text-[var(--ink-2)]">{t("限时")}</span>
          <div className="seg">
            {[0, 30, 60, 120].map((value) => (
              <button key={value} className={duration === value ? 'active' : ''} onClick={() => setDuration(value)}>
                {value === 0 ? t("不限时") : t("{p0} 分", { p0: value })}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 p-2.5 rounded-lg bg-[var(--paper-2)] text-[10.5px] text-[var(--muted)]">{summary}</div>

        <div className="flex gap-2 mt-3">
          <button className="btn btn-ghost flex-1" onClick={onClose}>{t("取消")}</button>
          <button
            className="btn btn-primary flex-1"
            onClick={() =>
              onStart({
                mode: duration > 0 ? 'exam' : 'custom',
                modules: modules.length ? modules : undefined,
                years: years.length ? years : undefined,
                count,
                order,
                durationSec: duration > 0 ? duration * 60 : undefined,
                title: t("自定义组卷"),
              })
            }
          >
            {t("生成并开始")}
          </button>
        </div>
      </div>
      <div className="h-3" />
    </MobileSheet>
  );
}