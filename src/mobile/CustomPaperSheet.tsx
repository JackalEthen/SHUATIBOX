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

  const summary = `${modules.length ? modules.join('、') : '全部模块'} · ${count} 题 · ${order === 'random' ? '随机' : '顺序'}${duration ? ` · 限时 ${duration} 分钟` : ' · 不限时'}`;

  return (
    <MobileSheet open={open} onClose={onClose}>
      <div className="grabber" />
      <h3 className="text-[14px] font-semibold">自定义组卷</h3>
      <p className="text-[10px] text-[var(--muted)] mt-1">不选模块则从全部模块抽题。</p>

      <div className="mt-4">
        <div className="text-[11px] text-[var(--ink-2)] mb-2">模块</div>
        <div className="flex flex-wrap gap-2">
          {data.modules.map((module) => (
            <button
              key={module.code}
              className={`chip ${modules.includes(module.name) ? 'active' : ''}`}
              onClick={() => toggle(modules, module.name, setModules)}
            >
              {module.name} · {module.available.toLocaleString('zh-CN')}
            </button>
          ))}
        </div>

        <div className="text-[11px] text-[var(--ink-2)] mb-2 mt-4">年份</div>
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
          <span className="text-[11px] text-[var(--ink-2)]">题量</span>
          <div className="seg">
            {[10, 20, 50].map((value) => (
              <button key={value} className={count === value ? 'active' : ''} onClick={() => setCount(value)}>
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px] text-[var(--ink-2)]">顺序</span>
          <div className="seg">
            <button className={order === 'random' ? 'active' : ''} onClick={() => setOrder('random')}>随机</button>
            <button className={order === 'sequence' ? 'active' : ''} onClick={() => setOrder('sequence')}>顺序</button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px] text-[var(--ink-2)]">限时</span>
          <div className="seg">
            {[0, 30, 60, 120].map((value) => (
              <button key={value} className={duration === value ? 'active' : ''} onClick={() => setDuration(value)}>
                {value === 0 ? '不限时' : `${value} 分`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 p-2.5 rounded-lg bg-[var(--paper-2)] text-[9.5px] text-[var(--muted)]">{summary}</div>

        <div className="flex gap-2 mt-3">
          <button className="btn btn-ghost flex-1" onClick={onClose}>取消</button>
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
                title: '自定义组卷',
              })
            }
          >
            生成并开始
          </button>
        </div>
      </div>
      <div className="h-3" />
    </MobileSheet>
  );
}